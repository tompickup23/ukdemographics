import type { APIRoute } from "astro";
import { buildAbsoluteUrl, getIndexableSitePaths } from "../lib/site";
import { getCollection } from "astro:content";

export const prerender = true;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export const GET: APIRoute = async () => {
  const paths = getIndexableSitePaths();

  // A lastmod is only useful when it states a real revision date. The findings
  // carry that date in frontmatter; the generated area pages do not, so they
  // intentionally remain undated rather than being falsely stamped per build.
  const lastmod = new Map<string, string>();
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
