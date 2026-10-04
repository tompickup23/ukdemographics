import type { APIRoute } from "astro";
import { execFileSync } from "node:child_process";
import { buildAbsoluteUrl, getIndexableSitePaths } from "../lib/site";
import { getCollection } from "astro:content";
import rawProjections from "../data/live/ethnic-projections.json";
import { pconDatasetDate } from "../lib/search-listing";

export const prerender = true;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The date of the last commit that touched any of these files, or null when
 * git history is not available. A shallow clone would report the build commit
 * for every file, which is a build date in disguise, so it is treated as no
 * history. The deploy and site-check workflows check out with full history.
 */
function lastCommitDate(files: string[]): string | null {
  try {
    const shallow = execFileSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim();
    if (shallow !== "false") return null;
    const date = execFileSync("git", ["log", "-1", "--format=%cs", "--", ...files], { encoding: "utf8" }).trim();
    return ISO_DATE.test(date) ? date : null;
  } catch {
    return null;
  }
}

function latest(...dates: Array<string | null | undefined>): string | null {
  const valid = dates.filter((d): d is string => !!d && ISO_DATE.test(d)).sort();
  return valid.at(-1) ?? null;
}

export const GET: APIRoute = async () => {
  const paths = getIndexableSitePaths();

  // A lastmod is only useful when it states a real revision date, and the
  // deploy job submits every URL whose lastmod is today to IndexNow, so a date
  // stamped on every build would re-submit a thousand pages on each deploy.
  //
  // Findings carry their revision date in frontmatter. The generated pages are
  // dated by the later of two real revisions: the data release behind them (the
  // projection file's lastUpdated, or the constituency dataset's generatedAt)
  // and the last commit to the template and copy code that renders them. The
  // build date stands in only through that commit date, which is the date the
  // built content last changed.
  const lastmod = new Map<string, string>();
  const projectionsUpdated = (rawProjections as { lastUpdated?: string }).lastUpdated ?? null;
  const placeDate = latest(projectionsUpdated, lastCommitDate([
    "src/pages/places/[slug].astro",
    "src/lib/search-listing.ts",
    "src/lib/listing-arm.ts",
  ]));
  const regionDate = latest(projectionsUpdated, lastCommitDate([
    "src/pages/places/regions/[region].astro",
    "src/lib/search-listing.ts",
  ]));
  const pconDate = latest(pconDatasetDate(), lastCommitDate([
    "src/pages/constituencies/[slug].astro",
    "src/lib/search-listing.ts",
  ]));
  for (const path of paths) {
    const date = path.startsWith("/places/regions/") ? regionDate
      : /^\/places\/[^/]+\/$/.test(path) ? placeDate
      : /^\/constituencies\/[^/]+\/$/.test(path) ? pconDate
      : null;
    if (date) lastmod.set(path, date);
  }
  const findings = await getCollection("findings");
  for (const finding of findings) {
    const path = `/findings/${finding.id.replace(/\.md$/, "")}/`;
    paths.push(path);
    lastmod.set(path, finding.data.updated ?? finding.data.date);
  }
  if (!paths.includes("/findings/")) paths.push("/findings/");

  const newestFinding = [...lastmod.values()].sort().at(-1);
  if (newestFinding) {
    lastmod.set("/findings/", newestFinding);
    lastmod.set("/", newestFinding);
  }

  const urlEntries = paths
    .map((path) => {
      const changed = lastmod.get(path);
      return (
        `  <url>\n    <loc>${escapeXml(buildAbsoluteUrl(path))}</loc>` +
        (changed ? `\n    <lastmod>${escapeXml(changed)}</lastmod>` : "") +
        `\n  </url>`
      );
    })
    .join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>\n`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8"
      }
    }
  );
};
