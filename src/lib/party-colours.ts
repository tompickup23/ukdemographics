/**
 * One colour per party, for swatches, bar segments and map fills on the constituency
 * pages. A party colour is never used as a text colour: several fall far short of 4.5:1
 * on the page (SNP yellow is 1.14:1 on white), so a party name is printed in the text
 * colour beside a swatch. Labels drawn on a party fill take their ink from
 * `inkOnFill` (src/lib/fill-ink.ts).
 */
export const PARTY_COLOURS: Record<string, string> = {
  Labour: "#dc241f",
  "Labour (Co-op)": "#dc241f",
  "Reform UK": "#12b6cf",
  Conservative: "#0087dc",
  "Liberal Democrats": "#faa61a",
  "Green Party": "#6ab023",
  Green: "#6ab023",
  "Plaid Cymru": "#005b54",
  SNP: "#fdf38e",
  Independent: "#999999",
  "Sinn Fein": "#326760",
  "Sinn Féin": "#326760",
  DUP: "#d46a4c",
  "Democratic Unionist Party": "#d46a4c",
  UUP: "#48a5b8",
  "Ulster Unionist Party": "#48a5b8",
  Alliance: "#f6cb2f",
  "Alliance Party of Northern Ireland": "#f6cb2f",
  SDLP: "#2c6b3d",
  "Social Democratic and Labour Party": "#2c6b3d",
};

export function partyColour(party: string | null | undefined, fallback = "var(--accent)"): string {
  return (party && PARTY_COLOURS[party]) || fallback;
}
