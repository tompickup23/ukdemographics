/**
 * Shared fetch plumbing for the publisher downloads: one user agent, a robots.txt check
 * before any request to a host, and an attempt log in UKSkynet's retrieval field names.
 *
 * Every attempt, successful or not, is appended to data/raw/manifests/<dataset>.json with
 * url, attempted_at, outcome, http_status, robots_status, blob_sha256, bytes and
 * user_agent, so the engine can later match these bytes by hash. The pattern follows
 * scripts/fetch/fetch-ons-mye.mjs and data/raw/manifests/ons_mye.json.
 *
 * Raw files are written once under their published name and never edited. A download
 * whose bytes match the file already held is recorded as "unchanged".
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const USER_AGENT = "ukdemographics-data-fetch";

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** Translate one robots.txt path pattern ("*" wildcard, "$" end anchor) to a RegExp. */
function robotsPattern(rule) {
  const anchored = rule.endsWith("$");
  const body = (anchored ? rule.slice(0, -1) : rule)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/**
 * Whether robots.txt on `origin` lets this user agent fetch `pathname`.
 *
 * Reads the group for our own agent if there is one, otherwise the "*" group, and applies
 * the longest matching rule (Allow wins a tie), as RFC 9309 describes. Returns "allowed",
 * "disallowed", "absent" (HTTP 404, which permits crawling), or a string naming why the
 * file could not be read. Callers stop on anything other than "allowed" or "absent".
 */
export async function robotsStatus(origin, pathname) {
  let text;
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": USER_AGENT } });
    if (res.status === 404) return "absent";
    if (!res.ok) return `unreadable_http_${res.status}`;
    text = await res.text();
  } catch (err) {
    return `error_${err.cause?.code ?? err.name}`;
  }
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (!lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (current && (field === "allow" || field === "disallow") && value) {
        current.rules.push({ allow: field === "allow", pattern: value });
      }
    }
  }
  const own = groups.filter((g) => g.agents.some((a) => a !== "*" && USER_AGENT.toLowerCase().includes(a)));
  const applicable = own.length ? own : groups.filter((g) => g.agents.includes("*"));
  let best = null;
  for (const rule of applicable.flatMap((g) => g.rules)) {
    if (!robotsPattern(rule.pattern).test(pathname)) continue;
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) {
      best = rule;
    }
  }
  return best && !best.allow ? "disallowed" : "allowed";
}

/** Fetch text or JSON from a publisher page after a robots check; throws on refusal or HTTP error. */
export async function politeGet(url, { as = "text" } = {}) {
  const u = new URL(url);
  const robots = await robotsStatus(u.origin, u.pathname + u.search);
  if (robots !== "allowed" && robots !== "absent") {
    throw new Error(`robots.txt on ${u.origin} gives "${robots}" for ${u.pathname}; not requesting it`);
  }
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  return as === "json" ? res.json() : res.text();
}

export function loadManifest(manifestPath) {
  return existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { attempts: [] };
}

/**
 * The path a raw file is written to, refusing any name that could land outside `rawDir`.
 *
 * File names are built from publisher responses (a URL's last segment, an edition label,
 * a data set id), so a hostile or malformed value such as "../x" or "a%2F..%2Fb" must
 * never reach the filesystem. Only a bare name of letters, digits, dot, underscore and
 * hyphen is accepted, and the resolved path must sit directly inside `rawDir`.
 */
export function safeTarget(rawDir, fileName) {
  const root = path.resolve(rawDir);
  const ok =
    typeof fileName === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(fileName) &&
    !fileName.includes("..") &&
    path.basename(fileName) === fileName;
  const target = ok ? path.resolve(root, fileName) : null;
  if (!target || path.dirname(target) !== root) {
    throw new Error(`refusing unsafe raw file name ${JSON.stringify(fileName)} for ${root}`);
  }
  return target;
}

/**
 * Download one file into `rawDir` under `fileName`, returning the attempt record.
 * Never overwrites a held file with different bytes under the same name: a publisher
 * replacing a file in place is recorded as "replaced_upstream" and the new bytes are kept
 * beside the old under a hash-suffixed name, so nothing already read is lost.
 *
 * `request` takes a method and JSON body for query APIs that answer a POST (the DfE
 * statistics API); the body is recorded in the attempt so the query can be repeated.
 */
export async function download(url, rawDir, fileName, extra = {}, request = {}) {
  // Checked before any request is made, so a bad name costs nothing and writes nothing.
  const target = safeTarget(rawDir, fileName);
  const u = new URL(url);
  const attempt = {
    url,
    attempted_at: new Date().toISOString(),
    outcome: null,
    http_status: null,
    robots_status: await robotsStatus(u.origin, u.pathname),
    blob_sha256: null,
    bytes: null,
    user_agent: USER_AGENT,
    file_name: fileName,
    ...(request.body ? { request_method: request.method ?? "POST", request_body: request.body } : {}),
    ...extra
  };
  if (attempt.robots_status !== "allowed" && attempt.robots_status !== "absent") {
    attempt.outcome = "robots_disallowed";
    return attempt;
  }
  let res;
  try {
    res = await fetch(url, request.body
      ? {
          method: request.method ?? "POST",
          headers: { "user-agent": USER_AGENT, "content-type": "application/json" },
          body: JSON.stringify(request.body)
        }
      : { headers: { "user-agent": USER_AGENT } });
  } catch (err) {
    attempt.outcome = `network_error_${err.cause?.code ?? err.name}`;
    return attempt;
  }
  attempt.http_status = res.status;
  attempt.etag = res.headers.get("etag");
  attempt.last_modified = res.headers.get("last-modified");
  if (!res.ok) {
    attempt.outcome = `http_${res.status}`;
    return attempt;
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  attempt.blob_sha256 = sha256(bytes);
  attempt.bytes = bytes.length;
  mkdirSync(rawDir, { recursive: true });
  if (existsSync(target)) {
    if (sha256(readFileSync(target)) === attempt.blob_sha256) {
      attempt.outcome = "unchanged";
      return attempt;
    }
    const ext = path.extname(fileName);
    attempt.file_name = `${path.basename(fileName, ext)}.${attempt.blob_sha256.slice(0, 12)}${ext}`;
    attempt.outcome = "replaced_upstream";
    writeFileSync(safeTarget(rawDir, attempt.file_name), bytes);
    return attempt;
  }
  writeFileSync(target, bytes);
  attempt.outcome = "stored";
  return attempt;
}

/**
 * Write the manifest: dataset metadata, the current file (the latest attempt that holds
 * bytes) and every attempt so far.
 */
export function writeManifest(manifestPath, meta, attempts) {
  const latest = [...attempts].reverse().find((a) => a.blob_sha256);
  const manifest = {
    ...meta,
    current: latest
      ? {
          fileName: latest.file_name,
          fileSha256: latest.blob_sha256,
          sizeBytes: latest.bytes,
          sourceUrl: latest.url,
          ...(latest.edition ? { edition: latest.edition } : {}),
          ...(latest.landing_page ? { landingPage: latest.landing_page } : {})
        }
      : null,
    attempts
  };
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  if (statSync(manifestPath).size > 200_000) console.warn(`${manifestPath} is over 200 KB; prune old attempts`);
}
