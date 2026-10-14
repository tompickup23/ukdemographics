/**
 * /media/places/<slug>/<card>.png and .webp: the share cards for each place page (maps
 * plan Stage 3). Built only in the BUILD_OG=1 pass, like /og/; see src/lib/map/cards.ts.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { getPublicPlaceAreas } from "../../../../lib/site";
import { buildCard, placeCardSpecs, placeSlug, type CardSpec } from "../../../../lib/map/cards";

const MIME: Record<CardSpec["format"], string> = { png: "image/png", webp: "image/webp" };

export const getStaticPaths: GetStaticPaths = async () => {
  if (process.env.BUILD_OG !== "1") return [];
  const specs = placeCardSpecs();
  return getPublicPlaceAreas().flatMap((area) =>
    specs.map((spec) => ({
      params: { slug: placeSlug(area.areaCode), file: `${spec.name}.${spec.format}` },
      props: { code: area.areaCode, spec }
    }))
  );
};

export const GET: APIRoute = async ({ props }) => {
  const { code, spec } = props as { code: string; spec: CardSpec };
  const body = await buildCard(code, spec);
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": MIME[spec.format], "Cache-Control": "public, max-age=86400" }
  });
};
