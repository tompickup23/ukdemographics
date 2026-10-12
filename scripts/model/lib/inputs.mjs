/**
 * The model's input manifest, read and checked in one place.
 *
 * The forward model and its build steps read gitignored files that live outside
 * this repo, mostly under ~/asylumstats/data. Until October 2026 nothing named
 * them or pinned their bytes: the v8.0 run was made with hand-made symlinks that
 * have since gone, so nobody could say which files it read. data/model/INPUTS.json
 * names every input with its repo path, where the bytes are held and their
 * sha256. This module loads that manifest, links each input into a checkout and
 * refuses to proceed when a file is missing or its bytes have changed.
 *
 * It never copies, moves or overwrites a held file. Linking creates a symlink in
 * the checkout pointing at the held copy, and only where nothing is in the way.
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const MANIFEST_PATH = "data/model/INPUTS.json";

export function expandHome(p) {
  if (!p) return p;
  return p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p;
}

export function loadManifest(file = MANIFEST_PATH) {
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  if (!manifest.stores || !Array.isArray(manifest.inputs)) {
    throw new Error(`${file}: expected "stores" and an "inputs" array`);
  }
  const ids = new Set();
  const paths = new Set();
  for (const input of manifest.inputs) {
    for (const field of ["id", "path", "store", "storePath", "sha256", "bytes"]) {
      if (input[field] === undefined || input[field] === "") {
        throw new Error(`${file}: input ${input.id ?? "(no id)"} lacks "${field}"`);
      }
    }
    if (!manifest.stores[input.store]) throw new Error(`${file}: input ${input.id} names unknown store ${input.store}`);
    if (!/^[0-9a-f]{64}$/.test(input.sha256)) throw new Error(`${file}: input ${input.id} has a malformed sha256`);
    if (ids.has(input.id)) throw new Error(`${file}: duplicate id ${input.id}`);
    if (paths.has(input.path)) throw new Error(`${file}: duplicate path ${input.path}`);
    ids.add(input.id);
    paths.add(input.path);
  }
  return manifest;
}

/** Root directory of a store, from its environment variable or its default. */
export function storeRoot(manifest, name, env = process.env) {
  const store = manifest.stores[name];
  return path.resolve(expandHome(env[store.env] || store.default));
}

export function heldPath(manifest, input, env = process.env) {
  return path.join(storeRoot(manifest, input.store, env), input.storePath);
}

export function selectInputs(manifest, { model, ids } = {}) {
  return manifest.inputs.filter((i) => {
    if (ids && ids.length && !ids.includes(i.id)) return false;
    if (model && !(i.models ?? []).includes(model)) return false;
    return true;
  });
}

export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

/**
 * Put a symlink at input.path (relative to repoRoot) pointing at the held copy.
 * Returns one of: "linked", "already_linked", "present" (a real file or a link
 * elsewhere is in the way; left alone and checked by hash instead), "same_file"
 * (the checkout is the store) or "held_missing".
 */
export function linkInput(manifest, input, repoRoot, env = process.env) {
  const target = heldPath(manifest, input, env);
  const local = path.resolve(repoRoot, input.path);
  if (!existsSync(target)) return { status: "held_missing", target, local };
  let stat = null;
  try {
    stat = lstatSync(local);
  } catch {
    stat = null;
  }
  if (stat) {
    if (realpathSync(local) === realpathSync(target)) {
      return { status: stat.isSymbolicLink() ? "already_linked" : "same_file", target, local };
    }
    return { status: "present", target, local, note: stat.isSymbolicLink() ? `links to ${readlinkSync(local)}` : "a real file" };
  }
  mkdirSync(path.dirname(local), { recursive: true });
  symlinkSync(target, local);
  return { status: "linked", target, local };
}

/** Hash the file the checkout would read and compare it with the manifest. */
export async function verifyInput(input, repoRoot) {
  const local = path.resolve(repoRoot, input.path);
  if (!existsSync(local)) return { id: input.id, ok: false, reason: "missing", local };
  const actual = await sha256File(local);
  if (actual !== input.sha256) {
    return { id: input.id, ok: false, reason: "sha256_mismatch", expected: input.sha256, actual, local };
  }
  return { id: input.id, ok: true, local };
}
