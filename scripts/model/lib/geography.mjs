/**
 * Local authority successor lookups for the model.
 *
 *   successors2023()  April 2023 unitary -> the 2022 districts it replaced
 *                     (src/data/lookups/lad22-to-lad23.json, ONS LAD22_LAD23_UK_LU_v1)
 *   successors2011()  current code -> the 2011 Census codes it is made of: the
 *                     2019 to 2021 changes in scripts/model/geography/lad11-successors.json
 *                     plus the April 2023 changes, with any 2022 district that
 *                     was itself created after 2011 expanded to its 2011 parts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const LAD22_LAD23 = "src/data/lookups/lad22-to-lad23.json";
const LAD11 = "scripts/model/geography/lad11-successors.json";

export function successors2023(file = LAD22_LAD23) {
  const doc = JSON.parse(readFileSync(path.resolve(file), "utf8"));
  return Object.fromEntries(Object.entries(doc.successors).map(([code, v]) => [code, v.predecessors.map((p) => p.code)]));
}

export function successors2011({ lad11 = LAD11, lad22 = LAD22_LAD23 } = {}) {
  const early = JSON.parse(readFileSync(path.resolve(lad11), "utf8")).successors;
  const out = Object.fromEntries(Object.entries(early).map(([code, v]) => [code, [...v.predecessors2011]]));
  for (const [code, preds] of Object.entries(successors2023(lad22))) {
    out[code] = preds.flatMap((p) => (early[p] ? early[p].predecessors2011 : [p]));
  }
  return out;
}
