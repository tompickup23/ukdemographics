/**
 * Output templates: canvas size, where the map panel sits and the type sizes of every
 * text element. Sizes are in SVG user units.
 *
 * inline is the web map: a 600-unit-wide viewBox scaled to the page column. Values are
 * 26 units or more, so they draw at 14 CSS px or more in a 343 px column (a 375 px phone
 * less its gutters). Its height follows its content.
 */
export type TemplateKey = "inline" | "portrait" | "story" | "og";
export const TEMPLATE_KEYS: TemplateKey[] = ["inline", "portrait", "story", "og"];

export interface PlateType { name: number; val: number; sub: number }

export interface Template {
  key: TemplateKey;
  W: number;
  /** Fixed height, or 0 when the height follows the content (inline). */
  H: number;
  /** Stroke and spacing scale against portrait. */
  s: number;
  /** Space kept clear of text at the top and bottom (story: platform chrome). */
  safeTop: number;
  safeBottom: number;
  /** Side gutters for labels that cannot sit on the map (group frames up to DENSE_FRAME). */
  gutter: number;
  /** Fixed panel (og), or null when the panel is laid out from the header and footer. */
  panel: { x: number; y: number; w: number; h: number } | null;
  /** Panel height for the inline template, whose canvas grows around it. */
  inlinePanelH?: number;
  font: {
    brandName: number; brandTag: number; title: number; subtitle: number; year: number; pill: number;
    legend: number; reference: number; foot: number; url: number; sourced: number; tag: number;
    tableHead: number; tableRow: number; timeline: number;
  };
  plate: { group: PlateType; focus: PlateType; neighbour: PlateType };
  /** Draw the A to Z table of bordering councils on focus frames. */
  table: boolean;
  timeline: boolean;
}

/** Frames with more councils than this get no gutters: plates only where they fit. */
export const DENSE_FRAME = 20;

const scaled = (k: number) => ({
  font: {
    brandName: 29 * k, brandTag: 19 * k, title: 50 * k, subtitle: 25 * k, year: 84 * k, pill: 17 * k, legend: 17 * k,
    reference: 16 * k, foot: 17 * k, url: 25 * k, sourced: 20 * k, tag: 17 * k, tableHead: 18 * k, tableRow: 21 * k, timeline: 17 * k
  },
  plate: {
    group: { name: 19 * k, val: 31 * k, sub: 15.5 * k },
    focus: { name: 27.5 * k, val: 45 * k, sub: 22.5 * k },
    neighbour: { name: 16 * k, val: 25 * k, sub: 0 }
  }
});

export const TEMPLATES: Record<TemplateKey, Template> = {
  portrait: { key: "portrait", W: 1080, H: 1350, s: 1, safeTop: 40, safeBottom: 30, gutter: 205, panel: null, table: true, timeline: true, ...scaled(1) },
  story: { key: "story", W: 1080, H: 1920, s: 1.05, safeTop: 230, safeBottom: 400, gutter: 210, panel: null, table: true, timeline: true, ...scaled(1.05) },
  og: {
    key: "og", W: 1200, H: 630, s: 0.62, safeTop: 20, safeBottom: 20, gutter: 120,
    panel: { x: 520, y: 20, w: 664, h: 590 }, table: false, timeline: false,
    font: {
      brandName: 23, brandTag: 15, title: 40, subtitle: 22, year: 34, pill: 15, legend: 14, reference: 14,
      foot: 14, url: 20, sourced: 17, tag: 14, tableHead: 0, tableRow: 0, timeline: 0
    },
    plate: {
      group: { name: 14, val: 21, sub: 12 },
      focus: { name: 20, val: 34, sub: 15 },
      neighbour: { name: 13, val: 18, sub: 0 }
    }
  },
  inline: {
    key: "inline", W: 600, H: 0, s: 0.6, safeTop: 0, safeBottom: 0, gutter: 0, panel: null, inlinePanelH: 470,
    table: false, timeline: false,
    font: {
      brandName: 24, brandTag: 19, title: 30, subtitle: 22, year: 46, pill: 17, legend: 20, reference: 19,
      foot: 19, url: 24, sourced: 20, tag: 18, tableHead: 0, tableRow: 0, timeline: 0
    },
    plate: {
      group: { name: 21, val: 26, sub: 19 },
      focus: { name: 26, val: 34, sub: 21 },
      neighbour: { name: 20, val: 26, sub: 0 }
    }
  }
};
