/**
 * Write JSON in the same layout as the file it replaces, so a change to a few
 * fields produces a diff of those fields and nothing else.
 *
 * Two-space indentation, as every generator here writes. A trailing newline is
 * kept if the original had one, and any character the original wrote as a
 * \uXXXX escape is written the same way again.
 */
import { writeFileSync } from "node:fs";

export function formatJsonLike(data, originalText) {
  let out = JSON.stringify(data, null, 2);
  const escapes = new Set(originalText.match(/\\u[0-9a-fA-F]{4}/g) ?? []);
  for (const esc of escapes) {
    const ch = String.fromCharCode(parseInt(esc.slice(2), 16));
    // Only characters JSON.stringify writes literally need restoring, and only
    // where the original never wrote that character literally.
    if (ch < " " || ch === '"' || ch === "\\") continue;
    if (originalText.includes(ch)) continue;
    out = out.split(ch).join(esc);
  }
  if (originalText.endsWith("\n") && !out.endsWith("\n")) out += "\n";
  return out;
}

export function writeJsonLike(filePath, data, originalText) {
  writeFileSync(filePath, formatJsonLike(data, originalText), "utf8");
}
