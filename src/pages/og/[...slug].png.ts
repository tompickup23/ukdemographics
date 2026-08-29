/**
 * /og/[...slug].png, dynamic per-page Open Graph card endpoint.
 *
 * Each path enumerated in getStaticPaths emits a 1200×630 PNG rendered
 * by Satori (text + flex layout → SVG) and @resvg/resvg-js (SVG → PNG).
 * Per-card cost is roughly 250-350ms on a modern Mac.
 *
 * Gated behind BUILD_OG=1. When unset, getStaticPaths returns [] which
 * means no OG endpoints are generated, iteration builds stay sub-10s.
 * Production deploys set BUILD_OG=1 in the GitHub Actions workflow.
 *
 * Standard layout (shared with ukelections.co.uk + asylumstats.co.uk):
 *   Brand row (40×40 logo tile + name + tagline)
 *   Hero block (site-specific, UKD uses stat + uppercase label + title)
 *   Single-line footer (site URL · brand sourced-tagline)
 */
import type { APIRoute, GetStaticPaths } from "astro";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getCollection } from "astro:content";
import { getPublicPlaceAreas, slugifyAreaName } from "../../lib/site";

const BUILD_OG = process.env.BUILD_OG === "1";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// The estate ground, shared by every social and Open Graph surface on all five sites.
// The accent here is the BRIGHT value of the ukdemographics triple, not the deep one:
// deep is for links and rules on white, bright is the mark and the URL on the ground,
// and #4338ca does not clear 4.5:1 against #0f1317 while #7b74f2 does at 4.99.
// The three verdict colours are the same lightened set Asylum Stats validated, all
// above 7:1 on the ground.
const COLORS = {
  bg: "#0f1317",
  surface: "#0f1317",
  accent: "#7b74f2",
  accentLight: "#a9a4f7",
  text: "#f4f6f7",
  muted: "#98a3ac",
  alert: "#e8b661",
  critical: "#e8897c",
  resolved: "#7fc9a8"
};

// The mark, as a data URI because Satori takes SVG through an img rather than as
// elements. The population pyramid from the site header and the favicon, on the same
// 64 unit grid. It replaced rising bars with a trend line, which collided with the food
// hygiene steps at thumbnail size and whose opacity ramp made the tallest bar faintest.
const MARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">' +
  '<rect x="20" y="8" width="10" height="9" fill="#7b74f2"/><rect x="34" y="8" width="12" height="9" fill="#574fa8"/>' +
  '<rect x="16" y="19" width="14" height="9" fill="#7b74f2"/><rect x="34" y="19" width="16" height="9" fill="#574fa8"/>' +
  '<rect x="12" y="30" width="18" height="9" fill="#7b74f2"/><rect x="34" y="30" width="20" height="9" fill="#574fa8"/>' +
  '<rect x="8" y="41" width="22" height="9" fill="#7b74f2"/><rect x="34" y="41" width="24" height="9" fill="#574fa8"/>' +
  '<rect x="4" y="52" width="26" height="9" fill="#7b74f2"/><rect x="34" y="52" width="28" height="9" fill="#574fa8"/>' +
  '</svg>';
const MARK_URI = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString("base64")}`;

const verdictColor: Record<string, string> = {
  alert: COLORS.alert,
  critical: COLORS.critical,
  resolved: COLORS.resolved,
  info: COLORS.accent
};

// Source Serif 4 for display, Source Sans 3 for everything else, matching the site and
// the other estate cards. woff rather than woff2: Satori reads ttf, otf and woff, and
// silently falls back on woff2, which would render these cards in a font nobody chose.
let displaySemiBold: ArrayBuffer | null = null;
let sansRegular: ArrayBuffer | null = null;
let sansSemiBold: ArrayBuffer | null = null;

function loadFont(fontFile: string): ArrayBuffer {
  const fontPath = join(process.cwd(), "src", "assets", "fonts", fontFile);
  return readFileSync(fontPath).buffer as ArrayBuffer;
}

function ensureFonts() {
  if (!displaySemiBold) displaySemiBold = loadFont("SourceSerif4-SemiBold.woff");
  if (!sansRegular) sansRegular = loadFont("SourceSans3-Regular.woff");
  if (!sansSemiBold) sansSemiBold = loadFont("SourceSans3-SemiBold.woff");
}

export const getStaticPaths: GetStaticPaths = async () => {
  if (!BUILD_OG) return [];

  const findings = await getCollection("findings");

  const findingPaths = findings.map((f) => ({
    params: { slug: `findings/${f.id.replace(/\.md$/, "")}` },
    props: {
      title: f.data.headline,
      stat: f.data.stat_value,
      statLabel: f.data.stat_label,
      verdict: f.data.verdict
    }
  }));

  const publicAreas = getPublicPlaceAreas();
  const placePaths = publicAreas.map((area) => ({
    params: { slug: `places/${slugifyAreaName(area.areaName)}` },
    props: {
      title: area.areaName,
      stat: area.wbiPct2021 != null ? `${area.wbiPct2021.toFixed(1)}%` : "n/a",
      statLabel: `White British 2021 · Population ${(area.population ?? 0).toLocaleString()}`,
      // Always the brand accent. This previously graded the colour by the area's White
      // British share: under 50 rendered in the critical red, under 70 in the alert
      // amber. That is an editorial judgement encoded as colour, on 320 cards that are
      // exactly what people see when a page is shared, and it says a lower share is a
      // warning. The place page itself already made this correction for its stat cards
      // ("escalating the hue encoded alarm rather than data"); the card had not.
      // A verdict is something an editor assigns to a finding, not something a census
      // share earns automatically.
      verdict: "info"
    }
  }));

  return [
    {
      params: { slug: "home" },
      props: {
        title: "Population data for every community",
        stat: `${publicAreas.length}`,
        statLabel: "Local authorities with projections",
        verdict: "info"
      }
    },
    ...findingPaths,
    ...placePaths
  ];
};

export const GET: APIRoute = async ({ props }) => {
  ensureFonts();

  const { title, stat, statLabel, verdict } = props as {
    title: string;
    stat: string;
    statLabel: string;
    verdict: string;
  };

  const statColor = verdictColor[verdict] ?? COLORS.accent;

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: `${OG_WIDTH}px`,
          height: `${OG_HEIGHT}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 70px",
          background: COLORS.bg,
          fontFamily: "Source Sans 3"
        },
        children: [
          // Brand row, shared standard across UKD / UKE / AS.
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "12px"
              },
              children: [
                {
                  type: "img",
                  props: { src: MARK_URI, width: 40, height: 40 }
                },
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      flexDirection: "column"
                    },
                    children: [
                      {
                        type: "span",
                        props: {
                          style: {
                            fontFamily: "Source Serif 4",
                            fontWeight: 600,
                            fontSize: "16px",
                            color: COLORS.text
                          },
                          children: "UK Demographics"
                        }
                      },
                      {
                        type: "span",
                        props: {
                          style: {
                            fontSize: "11px",
                            color: COLORS.muted,
                            letterSpacing: "0.05em"
                          },
                          children: "Population data for every community"
                        }
                      }
                    ]
                  }
                }
              ]
            }
          },
          // Hero block, stat (Source Serif 4 at 96, the bright accent) + label + title.
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "20px",
                flex: 1,
                justifyContent: "center"
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      fontFamily: "Source Serif 4",
                      fontSize: "96px",
                      fontWeight: 600,
                      color: statColor,
                      lineHeight: 1,
                      letterSpacing: "-0.03em"
                    },
                    children: stat
                  }
                },
                {
                  type: "div",
                  props: {
                    style: {
                      fontSize: "14px",
                      color: COLORS.muted,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em"
                    },
                    children: statLabel
                  }
                },
                {
                  type: "div",
                  props: {
                    style: {
                      fontFamily: "Source Serif 4",
                      fontSize: "36px",
                      fontWeight: 600,
                      color: COLORS.text,
                      lineHeight: 1.15,
                      maxWidth: "900px"
                    },
                    children: title
                  }
                }
              ]
            }
          },
          // Single-line footer, URL (brand colour) + tagline (muted).
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: `2px solid ${COLORS.accent}`,
                paddingTop: "16px"
              },
              children: [
                {
                  type: "span",
                  props: {
                    style: {
                      fontSize: "14px",
                      color: COLORS.accent,
                      fontWeight: 600
                    },
                    children: "ukdemographics.co.uk"
                  }
                },
                {
                  type: "span",
                  props: {
                    style: {
                      fontSize: "12px",
                      color: COLORS.muted
                    },
                    children: "Every projection sourced."
                  }
                }
              ]
            }
          }
        ]
      }
    },
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts: [
        { name: "Source Sans 3", data: sansRegular!, weight: 400, style: "normal" },
        { name: "Source Sans 3", data: sansSemiBold!, weight: 600, style: "normal" },
        { name: "Source Serif 4", data: displaySemiBold!, weight: 600, style: "normal" }
      ]
    }
  );

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } });
  const png = Buffer.from(resvg.render().asPng());

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400"
    }
  });
};
