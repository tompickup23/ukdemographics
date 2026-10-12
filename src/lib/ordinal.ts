/**
 * English ordinal for a whole number: 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 72nd.
 *
 * Place pages printed percentiles as `${n}th`, which gave "72th" and "91th".
 */
export function ordinal(n: number): string {
  const whole = Math.round(n);
  const lastTwo = Math.abs(whole) % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${whole}th`;
  switch (Math.abs(whole) % 10) {
    case 1:
      return `${whole}st`;
    case 2:
      return `${whole}nd`;
    case 3:
      return `${whole}rd`;
    default:
      return `${whole}th`;
  }
}
