/**
 * Fetch the published files the v8.1 control totals are built from.
 *
 * New on 12 Oct 2026, for decisions D3 and D4 (UKD refresh plan, phase 3):
 *
 *   ons_npp_england        ONS national population projections, England, machine-readable zip
 *   ons_mye_timeseries     ONS mid-year estimates, England and Wales, detailed time series workbook
 *   ons_3596               ONS user requested data 3596: mid-2025 estimates rescaled with the NPP
 *   wg_lapp                Welsh Government local authority population projections (StatsWales)
 *
 *   node scripts/fetch/fetch-projection-inputs.mjs --dataset ons_npp_england [--dir <dir>] [--dry-run]
 *   node scripts/fetch/fetch-projection-inputs.mjs --all [--dir <dir>]
 *
 * Each dataset's newest edition is resolved from the publisher's own page, never
 * from a typed file URL, and every attempt is recorded in
 * data/raw/manifests/<dataset>.json with the field names UKSkynet's retrieval
 * log uses (url, attempted_at, outcome, http_status, robots_status, blob_sha256,
 * bytes, user_agent), following scripts/fetch/fetch-ons-mye.mjs.
 *
 * Files land in data/raw/<dataset>/ unless --dir names a store (the model's
 * inputs are held in ~/asylumstats/data/raw/snpp/control_totals_inputs and
 * linked in by scripts/model/link_inputs.mjs). Raw files are never edited.
 *
 * Nomis is not used. ONS served no robots.txt on 12 Oct 2026 (HTTP 404) and
 * StatsWales's robots.txt disallows only sort, filter and pagination URLs; the
 * status is checked and recorded on every attempt.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const USER_AGENT = "ukdemographics-data-fetch";
const ONS = "https://www.ons.gov.uk";

export const DATASETS = {
  ons_npp_england: {
    publisher: "Office for National Statistics",
    cadence: "biennial (next: 2026-based, second half of 2028)",
    landing: `${ONS}/peoplepopulationandcommunity/populationandmigration/populationprojections/datasets/z3zippedpopulationprojectionsdatafilesengland`,
    // The page lists editions newest first: /2024based/en1.zip, /2022based/en.zip, ...
    link: /href="(\/file\?uri=[^"]*z3zippedpopulationprojectionsdatafilesengland\/\d{4}based\/[^"]*\.zip)"/gi,
    robotsOrigin: ONS,
    note: "Edition, base year and variant are read from the zip's own file names and contents by scripts/model/build_control_totals.mjs.",
  },
  ons_mye_timeseries: {
    publisher: "Office for National Statistics",
    cadence: "annual",
    landing: `${ONS}/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/estimatesofthepopulationforenglandandwales`,
    link: /href="(\/file\?uri=[^"]*\/myebtablesenglandwales\d{8}\.xlsx)"/gi,
    robotsOrigin: ONS,
    note: "The detailed time series (MYEB tables): mid-2011 onwards by local authority, sex and single year of age, carrying the July 2026 revisions to mid-2022 to mid-2024.",
  },
  ons_3596: {
    publisher: "Office for National Statistics",
    cadence: "ad hoc (user requested data 3596, 27 August 2026)",
    landing: `${ONS}/peoplepopulationandcommunity/populationandmigration/populationprojections/adhocs/3596midyearpopulationestimatesandrescaledpopulationestimatesusingnationalpopulationprojectionsforlocalauthoritiesinenglandbysexandsingleyearofage2025to2050`,
    link: /href="(\/file\?uri=[^"]*\/rescaledpop\d{4}to\d{4}\.xlsx)"/gi,
    robotsOrigin: ONS,
    note: "Published by UKD as a sensitivity line only (decision D3), never as the cap.",
  },
  wg_lapp: {
    publisher: "Welsh Government",
    cadence: "biennial (2022-based published 20 November 2025; principal not revised)",
    landing: "https://stats.gov.wales/en-GB/036507d7-6671-4885-b2b4-af7f01e9ed5b",
    // StatsWales serves the full dataset through its public API as a GET; the
    // web page's own download button posts a form, which this script does not use.
    api: "https://api.stats.gov.wales/v1/036507d7-6671-4885-b2b4-af7f01e9ed5b",
    download: "https://api.stats.gov.wales/v1/036507d7-6671-4885-b2b4-af7f01e9ed5b/download/csv?view=raw_extended&lang=en-gb",
    fileName: "wg_lapp_2022based_036507d7_raw_extended.csv",
    robotsOrigin: "https://stats.gov.wales",
    note: "Full dataset, all six variants, with reference codes. The variant, years and areas are read from the file by scripts/model/build_control_totals.mjs.",
  },
};

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function robotsStatus(origin) {
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": USER_AGENT } });
    if (res.status === 404) return "absent";
    if (!res.ok) return `unreadable_http_${res.status}`;
    const text = await res.text();
    const blanket = text.split("\n").map((l) => l.trim()).some((l) => /^disallow:\s*\/\s*$/i.test(l));
    return blanket ? "disallowed" : "allowed";
  } catch (err) {
    return `error_${err.code ?? err.name}`;
  }
}

async function resolveUrl(cfg) {
  if (cfg.download) {
    // Record the dataset's own metadata (title, last update) alongside the file.
    const meta = await fetch(cfg.api, { headers: { "user-agent": USER_AGENT } });
    const info = meta.ok ? await meta.json() : null;
    return { url: cfg.download, name: cfg.fileName, info: info ? { first_published_at: info.first_published_at, last_updated_at: info.last_updated_at ?? null } : null };
  }
  const page = await fetch(cfg.landing, { headers: { "user-agent": USER_AGENT } });
  if (!page.ok) throw new Error(`landing page HTTP ${page.status}`);
  const html = await page.text();
  const links = [...html.matchAll(cfg.link)].map((m) => m[1].replaceAll("&amp;", "&"));
  if (links.length === 0) throw new Error("no matching file link on the landing page; its layout may have changed");
  const url = new URL(links[0], ONS).toString();
  return { url, name: decodeURIComponent(url.split("/").pop()) };
}

async function fetchDataset(name, { dir, dryRun }) {
  const cfg = DATASETS[name];
  if (!cfg) throw new Error(`unknown dataset ${name}`);
  const manifestPath = path.resolve(`data/raw/manifests/${name}.json`);
  const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { attempts: [] };
  const attempts = previous.attempts ?? [];
  const rawDir = path.resolve(dir ?? `data/raw/${name}`);

  const robots = await robotsStatus(cfg.robotsOrigin);
  if (robots === "disallowed") {
    attempts.push({ url: cfg.landing, attempted_at: new Date().toISOString(), outcome: "robots_disallowed", robots_status: robots, user_agent: USER_AGENT });
    if (!dryRun) writeManifest(name, cfg, manifestPath, attempts);
    throw new Error(`${cfg.robotsOrigin}/robots.txt disallows the path`);
  }
  const { url, name: fileName, info } = await resolveUrl(cfg);
  if (dryRun) {
    console.log(`${name}: would fetch ${url} -> ${path.join(rawDir, fileName)}`);
    return;
  }
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  const attempt = {
    url,
    attempted_at: new Date().toISOString(),
    outcome: res.ok ? "stored" : `http_${res.status}`,
    http_status: res.status,
    robots_status: robots,
    etag: res.headers.get("etag"),
    last_modified: res.headers.get("last-modified"),
    user_agent: USER_AGENT,
    file_name: fileName,
    held_at: rawDir.replace(process.env.HOME ?? "", "~"),
  };
  if (info) attempt.publisher_metadata = info;
  if (res.ok) {
    const bytes = Buffer.from(await res.arrayBuffer());
    attempt.blob_sha256 = sha256(bytes);
    attempt.bytes = bytes.length;
    mkdirSync(rawDir, { recursive: true });
    const target = path.join(rawDir, fileName);
    if (existsSync(target) && sha256(readFileSync(target)) === attempt.blob_sha256) attempt.outcome = "unchanged";
    else writeFileSync(target, bytes);
  }
  attempts.push(attempt);
  writeManifest(name, cfg, manifestPath, attempts);
  console.log(`${name}: ${attempt.outcome} ${fileName} ${attempt.blob_sha256 ?? ""} ${attempt.bytes ?? ""}`);
}

function writeManifest(name, cfg, manifestPath, attempts) {
  const latest = [...attempts].reverse().find((a) => a.blob_sha256);
  const manifest = {
    dataset: name,
    publisher: cfg.publisher,
    cadence: cfg.cadence,
    landing: cfg.landing,
    note: cfg.note,
    current: latest
      ? { fileName: latest.file_name, fileSha256: latest.blob_sha256, sizeBytes: latest.bytes, sourceUrl: latest.url, heldAt: latest.held_at }
      : null,
    attempts,
  };
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  if (statSync(manifestPath).size > 200_000) console.warn(`${name} manifest is over 200 KB; prune old attempts`);
}

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const names = args.includes("--all") ? Object.keys(DATASETS) : [argValue("--dataset")].filter(Boolean);
  if (names.length === 0) {
    console.error(`usage: --dataset <${Object.keys(DATASETS).join("|")}> or --all`);
    process.exit(2);
  }
  let failed = 0;
  for (const n of names) {
    try {
      await fetchDataset(n, { dir: argValue("--dir"), dryRun: args.includes("--dry-run") });
    } catch (err) {
      failed += 1;
      console.error(`${n}: ${err.message}`);
    }
    // One request stream at a time, with a pause between datasets; ONS rate-limits bursts.
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (failed) process.exit(1);
}
