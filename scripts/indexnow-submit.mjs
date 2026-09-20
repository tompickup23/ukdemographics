import process from "node:process";

const SITE_URL = "https://ukdemographics.co.uk";
const KEY = "6e132dc4e47743a0a89df6e331027f5c";

await submitIndexNow({ siteUrl: SITE_URL, key: KEY, args: process.argv.slice(2) });

async function submitIndexNow({ siteUrl, key, args }) {
  if (process.env.INDEXNOW_SUBMIT !== "1") { console.log("IndexNow disabled (set INDEXNOW_SUBMIT=1 after a successful production deploy)."); return; }
  const cutoff = option(args, "--lastmod") ?? new Date().toISOString().slice(0, 10);
  const directUrls = values(args, "--url");
  const urls = args.includes("--sitemap") ? await currentUrlsFromSitemap(`${siteUrl}/sitemap.xml`, cutoff) : directUrls;
  if (!urls.length) { console.log(`IndexNow: no canonical URLs changed on or after ${cutoff}.`); return; }
  if (urls.length > 10_000 || urls.some((url) => new URL(url).origin !== siteUrl)) throw new Error("IndexNow accepts at most 10,000 same-host canonical URLs per notification.");
  const response = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ host: new URL(siteUrl).host, key, keyLocation: `${siteUrl}/${key}.txt`, urlList: urls }) });
  if (!response.ok) throw new Error(`IndexNow rejected ${urls.length} URLs: HTTP ${response.status}`);
  console.log(`IndexNow notified of ${urls.length} changed canonical URL${urls.length === 1 ? "" : "s"}.`);
}
function option(args, name) { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; }
function values(args, name) { return args.flatMap((arg, index) => arg === name && args[index + 1] ? [args[index + 1]] : []); }
async function currentUrlsFromSitemap(sitemapUrl, cutoff) {
  const response = await fetch(sitemapUrl); if (!response.ok) throw new Error(`Could not read ${sitemapUrl}: HTTP ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?\s*<\/url>/g)].filter(([, , lastmod]) => lastmod && lastmod >= cutoff).map(([, url]) => url.replaceAll("&amp;", "&"));
}
