#!/usr/bin/env node
/**
 * Link the model's gitignored inputs into this checkout and check their bytes.
 *
 *   node scripts/model/link_inputs.mjs                  # link what is missing, then verify every input
 *   node scripts/model/link_inputs.mjs --model v8.1     # only the inputs a v8.1 run needs
 *   node scripts/model/link_inputs.mjs --check          # verify only, create nothing
 *   node scripts/model/link_inputs.mjs --id snpp_2022_migcat_zip --id ons_mye_2025
 *
 * Inputs are listed in data/model/INPUTS.json. Each names a store (a directory
 * held outside git, by default ~/asylumstats/data or ~/ukdemographics/data) and
 * the file's sha256. Override a store's location with the environment variable
 * the manifest gives for it, for example UKD_MODEL_STORE_AS=/Volumes/x/data.
 *
 * The script creates symlinks only. It never copies, moves, renames or
 * overwrites a held file, and it leaves alone anything already at a target path,
 * checking that by hash instead. Several other repos (the LGR Zenodo tools among
 * them) read ~/asylumstats/data/raw/snpp/ and ~/asylumstats/data/model/ directly.
 *
 * Exit status is 1 if any selected input is missing or does not match its hash.
 */
import path from "node:path";
import { linkInput, loadManifest, selectInputs, verifyInput, heldPath } from "./lib/inputs.mjs";

const args = process.argv.slice(2);
const flagValues = (flag) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));
const checkOnly = args.includes("--check");
const model = flagValues("--model")[0];
const ids = flagValues("--id");
const manifestPath = flagValues("--manifest")[0] ?? "data/model/INPUTS.json";
const repoRoot = path.resolve(flagValues("--repo")[0] ?? ".");

const manifest = loadManifest(path.resolve(repoRoot, manifestPath));
const inputs = selectInputs(manifest, { model, ids });
if (inputs.length === 0) {
  console.error("No inputs selected");
  process.exit(1);
}

let failures = 0;
for (const input of inputs) {
  if (!checkOnly) {
    const res = linkInput(manifest, input, repoRoot);
    if (res.status === "held_missing") {
      console.log(`  missing held copy  ${input.id}: ${heldPath(manifest, input)}`);
      if (input.drive) console.log(`      fetch it with: rclone copy "${input.drive}" "${path.dirname(heldPath(manifest, input))}"`);
      if (input.obtain) console.log(`      or: ${input.obtain}`);
    } else if (res.status === "present") {
      console.log(`  left in place      ${input.id}: ${input.path} (${res.note})`);
    } else if (res.status === "linked") {
      console.log(`  linked             ${input.id}: ${input.path}`);
    }
  }
  const v = await verifyInput(input, repoRoot);
  if (v.ok) {
    console.log(`  ok                 ${input.id}`);
  } else {
    failures += 1;
    if (v.reason === "missing") console.log(`  FAIL missing       ${input.id}: ${input.path}`);
    else console.log(`  FAIL sha256        ${input.id}: expected ${v.expected.slice(0, 12)}..., found ${v.actual.slice(0, 12)}...`);
  }
}

console.log(`\n${inputs.length - failures} of ${inputs.length} inputs verified${model ? ` for ${model}` : ""}`);
if (failures) process.exit(1);
