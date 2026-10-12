/**
 * The "Dominant driver" label on the shift-share section of a place page.
 *
 * Until October 2026 the label named whichever component was largest in size,
 * whatever its sign. In 20 mostly rural areas (Isle of Anglesey, Staffordshire
 * Moorlands, North Norfolk and others) the local component raised the White
 * British share by more than the national trend lowered it, so a fall in the
 * share was put down to "local migration", the component working against it.
 *
 * The rule now, applied to the components as the page prints them (one decimal
 * place, so the label always agrees with the bars beside it):
 *
 * 1. The driver is the largest component with the same sign as the total change.
 *    Components that tie at that precision are named together, "equally".
 * 2. Where a component of the opposite sign is at least as large as the driver,
 *    the label adds ", offset by" that component. Smaller opposing components are
 *    left to the chart.
 * 3. A total change of zero has no driver.
 *
 * scripts/model/compute_shift_share.mjs writes the same rule into the data file's
 * `dominantDriver`, and tests/shift-share.test.ts checks the two agree.
 */
export interface ShiftShareComponents {
  totalChangePp: number;
  nationalEffectPp: number;
  structuralEffectPp: number;
  localEffectPp: number;
}

export const SHIFT_SHARE_COMPONENT_NAMES: ReadonlyArray<[keyof ShiftShareComponents, string]> = [
  ["nationalEffectPp", "national trend"],
  ["structuralEffectPp", "age structure"],
  ["localEffectPp", "local migration"],
];

export const NO_DRIVER = "none, the components cancel out";

export function shiftShareDriver(s: ShiftShareComponents): string {
  const sign = Math.sign(s.totalChangePp);
  if (sign === 0) return NO_DRIVER;
  const parts = SHIFT_SHARE_COMPONENT_NAMES.map(([key, name]) => ({ name, value: s[key] }));
  const bySize = (a: { value: number }, b: { value: number }) => Math.abs(b.value) - Math.abs(a.value);
  const same = parts.filter((p) => Math.sign(p.value) === sign).sort(bySize);
  if (same.length === 0) return NO_DRIVER;
  const size = Math.abs(same[0].value);
  const leaders = same.filter((p) => Math.abs(p.value) === size).map((p) => p.name);
  let label = leaders.length > 1 ? `${leaders.join(" and ")}, equally` : leaders[0];
  const opposing = parts.filter((p) => Math.sign(p.value) === -sign).sort(bySize);
  if (opposing.length > 0 && Math.abs(opposing[0].value) >= size) label += `, offset by ${opposing[0].name}`;
  return label;
}
