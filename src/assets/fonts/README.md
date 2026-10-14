# Fonts for rendered images

- `*.woff`: read by Satori for the Open Graph cards (`src/pages/og/[...slug].png.ts`). Satori reads ttf, otf and woff, and falls back silently on woff2.
- `*.ttf`: read by resvg for the maps and share cards (`src/lib/map/`). resvg does not read WOFF. Static TrueType instances of the same faces, as served by fonts.googleapis.com: Source Serif 4 at weight 600, Source Sans 3 at 400 and 600. Copied from `~/ukplaces/data/fonts` on 13 October 2026.

Both families are published by Adobe under the SIL Open Font Licence 1.1 (`OFL-SourceSans3.txt`, `OFL-SourceSerif4.txt`, copied from the `@fontsource` packages).
