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
import { getCollection } from "astro:content";
import { getPublicPlaceAreas } from "../../lib/site";
import { getAllPcons } from "../../lib/pcon-data";
import { generalElectionYear } from "../../lib/search-listing";
import {
  BRAND_NAME,
  BRAND_SOURCED,
  BRAND_TAGLINE,
  COLORS,
  FONT_SANS,
  FONT_SERIF,
  MARK_URI,
  SITE_DOMAIN,
  loadSatoriFont
} from "../../lib/map/brand";

const BUILD_OG = process.env.BUILD_OG === "1";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// Colours, the mark, the wording and the fonts are shared with the maps in src/lib/map/,
// so a card and a map can never drift apart.
const verdictColor: Record<string, string> = {
  alert: COLORS.alert,
  critical: COLORS.critical,
  resolved: COLORS.resolved,
  info: COLORS.accent
};

let displaySemiBold: ArrayBuffer | null = null;
let sansRegular: ArrayBuffer | null = null;
let sansSemiBold: ArrayBuffer | null = null;

function ensureFonts() {
  if (!displaySemiBold) displaySemiBold = loadSatoriFont("SourceSerif4-SemiBold.woff");
  if (!sansRegular) sansRegular = loadSatoriFont("SourceSans3-Regular.woff");
  if (!sansSemiBold) sansSemiBold = loadSatoriFont("SourceSans3-SemiBold.woff");
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

  // Place pages take their Open Graph image from the map cards in /media/places/ (maps
  // plan Stage 3, decision P2): the population change card, which replaced the text card
  // that led with the White British share.
  const publicAreas = getPublicPlaceAreas();

  // Constituency cards carry the election result, the one figure every seat has.
  // The winner's name sits in the label rather than as a coloured stat, so no
  // party gets a colour judgement on the card.
  const geYear = generalElectionYear();
  const pconPaths = getAllPcons().map((p) => ({
    params: { slug: `constituencies/${p.slug}` },
    props: {
      title: `${p.name} constituency`,
      stat: p.ge2024.winner && p.ge2024.winnerSharePct > 0 ? `${p.ge2024.winnerSharePct.toFixed(1)}%` : p.code,
      statLabel: p.ge2024.winner && p.ge2024.winnerSharePct > 0
        ? `${p.ge2024.winner} vote share${geYear != null ? `, ${geYear} general election` : ""}`
        : "UK Parliament constituency",
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
    ...pconPaths
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
          fontFamily: FONT_SANS
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
                            fontFamily: FONT_SERIF,
                            fontWeight: 600,
                            fontSize: "16px",
                            color: COLORS.text
                          },
                          children: BRAND_NAME
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
                          children: BRAND_TAGLINE
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
                      fontFamily: FONT_SERIF,
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
                      fontFamily: FONT_SERIF,
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
                    children: SITE_DOMAIN
                  }
                },
                {
                  type: "span",
                  props: {
                    style: {
                      fontSize: "12px",
                      color: COLORS.muted
                    },
                    children: BRAND_SOURCED
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
        { name: FONT_SANS, data: sansRegular!, weight: 400, style: "normal" },
        { name: FONT_SANS, data: sansSemiBold!, weight: 600, style: "normal" },
        { name: FONT_SERIF, data: displaySemiBold!, weight: 600, style: "normal" }
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
