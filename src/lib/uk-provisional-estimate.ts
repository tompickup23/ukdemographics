/**
 * The ONS provisional estimate of the UK population.
 *
 * One figure for the whole UK, published each November for the 30 June before it. ONS
 * gives no breakdown by council, age or sex, and says the figure should not be compared
 * with earlier estimates for smaller areas, so it belongs on /national/ and on no place
 * page. Every other population figure on the site covers England and Wales, which is why
 * the geography is carried beside this one wherever it is shown.
 *
 * The values are entered by hand from the bulletin (src/data/live/uk-provisional-estimate.json
 * names the sections). tests/uk-provisional-estimate.test.ts checks that the parts ONS
 * publishes add up to the estimate, so a mistyped digit fails the build.
 */
import data from "../data/live/uk-provisional-estimate.json";
import { formatDay } from "./section-dates";

export const UK_ESTIMATE = data;
export const UK_ESTIMATE_ANCHOR = "uk-latest-estimate";

const whole = new Intl.NumberFormat("en-GB");

export function formatWhole(n: number): string {
  return whole.format(n);
}

/** 69564000 to "69.6 million", the rounding ONS uses in its own headline. */
export function formatMillions(n: number): string {
  return `${(n / 1_000_000).toFixed(1)} million`;
}

/** "2026-06-30" to "mid-2026". Only a 30 June reference date is a mid-year. */
export function midYearLabel(iso: string): string {
  if (!iso.endsWith("-06-30")) throw new Error(`Not a mid-year reference date: ${iso}`);
  return `mid-${iso.slice(0, 4)}`;
}

export const UK_ESTIMATE_LABEL = midYearLabel(data.referenceDate);
export const UK_PREVIOUS_LABEL = midYearLabel(data.previous.referenceDate);
export const UK_ESTIMATE_DAY = formatDay(data.referenceDate);
export const UK_ESTIMATE_PUBLISHED_DAY = formatDay(data.source.published);
export const UK_ESTIMATE_READ_DAY = formatDay(data.source.readOn);
export const UK_PREVIOUS_PUBLISHED_DAY = formatDay(data.previous.published);

/** Difference between the two ONS estimates. Not a figure ONS states; it is their subtraction. */
export const UK_ESTIMATE_CHANGE = data.population - data.previous.population;
/** Births minus deaths, from the two figures ONS states. */
export const UK_NATURAL_CHANGE = data.births - data.deaths;
/** What the published parts add up to. Equal to UK_ESTIMATE_CHANGE when the file is right. */
export const UK_COMPONENTS_SUM = data.births - data.deaths + data.netInternationalMigration;

export const UK_ESTIMATE_SOURCE_LINE = `${data.source.publisher}, ${data.source.title}, ${data.source.type.toLowerCase()}, ${data.source.sections}, released ${UK_ESTIMATE_PUBLISHED_DAY}`;
