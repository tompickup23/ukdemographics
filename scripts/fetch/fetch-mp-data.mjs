/**
 * Fetch current UK MPs from the Parliament Members API.
 * Output: src/data/live/mp-directory.json
 *
 * Usage:
 *   node scripts/fetch/fetch-mp-data.mjs                 write the file
 *   node scripts/fetch/fetch-mp-data.mjs --check         compare the live API with
 *        [--report <path>]                               the committed file and write
 *                                                        nothing to src/data
 *
 * Why --check and not a straight weekly write: a changed MP or party is a
 * changed published fact, and those need a second, independent source before
 * they go live. The weekly workflow runs --check and opens an issue listing
 * the differences; a person corroborates them and runs the write.
 *
 * Seats with no current MP (between a resignation and a by-election) are
 * recorded in `vacancies`, confirmed against the constituency endpoint and
 * carrying the date and reason Parliament gives for the last member leaving.
 *
 * `holds` (scripts/fetch/mp-holds.json) keeps a published value where the
 * API has changed but no independent source confirms it yet. A hold only
 * applies while the API still returns the value it was recorded against, so
 * any further change lapses it and shows up in --check.
 */
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "../../src/data/live/mp-directory.json");
const PCON_PATH = join(__dirname, "../../src/data/live/pcon-dataset.json");
const HOLDS_PATH = join(__dirname, "mp-holds.json");
const API = "https://members-api.parliament.uk/api";

// The Commons has 650 seats. Fewer than this many current members means the
// fetch failed part-way, not that a quarter of the House resigned.
const MIN_MEMBERS = 620;

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const REPORT = args.includes("--report") ? args[args.indexOf("--report") + 1] : null;

// Party name normalisation
const PARTY_MAP = {
  "Labour": "Labour",
  "Conservative": "Conservative",
  "Liberal Democrat": "Liberal Democrats",
  "Liberal Democrats": "Liberal Democrats",
  "Scottish National Party": "SNP",
  "Reform UK": "Reform UK",
  "Green Party": "Green",
  "Plaid Cymru": "Plaid Cymru",
  "Democratic Unionist Party": "DUP",
  "Sinn Féin": "Sinn Fein",
  "Alliance Party of Northern Ireland": "Alliance",
  "Social Democratic & Labour Party": "SDLP",
  "Ulster Unionist Party": "UUP",
  "Speaker": "Speaker",
  "Independent": "Independent",
};

async function getJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.ok) return await res.json();
      lastError = new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, attempt * 1000));
  }
  // Fail the run. A partial list written to disk would publish missing MPs.
  throw lastError;
}

async function fetchAllMPs() {
  const allMPs = [];
  let skip = 0;
  const take = 20;
  let total = Infinity;

  console.log("Fetching MPs from Parliament API...");

  while (skip < total) {
    const data = await getJson(`${API}/Members/Search?House=Commons&IsCurrentMember=true&skip=${skip}&take=${take}`);
    total = data.totalResults ?? 0;

    for (const item of data.items ?? []) {
      const member = item.value;
      if (!member) continue;

      const latestMembership = member.latestHouseMembership;
      allMPs.push({
        memberId: member.id,
        mpName: member.nameDisplayAs ?? `${member.nameAddressAs}`,
        party: PARTY_MAP[member.latestParty?.name] ?? member.latestParty?.name ?? "Unknown",
        constituencyName: latestMembership?.membershipFrom ?? "",
        photoUrl: member.thumbnailUrl ?? null,
        majority: null, // the API does not provide majority
        electedDate: latestMembership?.membershipStartDate ?? null,
      });
    }

    skip += take;
    await new Promise((r) => setTimeout(r, 200));
  }

  if (allMPs.length < MIN_MEMBERS || allMPs.length !== total) {
    throw new Error(`Fetched ${allMPs.length} of ${total} current MPs; refusing to write a partial list.`);
  }
  const blank = allMPs.filter((m) => !m.constituencyName);
  if (blank.length) throw new Error(`${blank.length} MPs came back with no constituency.`);

  console.log(`Fetched ${allMPs.length} MPs`);
  return allMPs;
}

/**
 * Constituencies on this site with no current MP. Each is confirmed against
 * the constituency endpoint (currentRepresentation null), so a name mismatch
 * between datasets can never be published as a vacancy.
 */
// The constituency dataset drops Welsh diacritics ("Glyndwr") that Parliament
// keeps ("Glyndŵr"). Match on a folded form; src/lib/pcon-data.ts does the same.
export function foldConstituencyName(name) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

async function findVacancies(mps) {
  const pcons = JSON.parse(readFileSync(PCON_PATH, "utf8")).pcons;
  const held = new Set(mps.map((m) => foldConstituencyName(m.constituencyName)));
  const vacancies = [];
  for (const p of Object.values(pcons)) {
    if (held.has(foldConstituencyName(p.name))) continue;
    const search = await getJson(`${API}/Location/Constituency/Search?searchText=${encodeURIComponent(p.name)}&take=20`);
    const match = (search.items ?? []).map((i) => i.value)
      .find((v) => foldConstituencyName(v.name) === foldConstituencyName(p.name) && !v.endDate);
    if (!match) throw new Error(`"${p.name}" has no MP in the members list and no exact match at Parliament; check the name mapping.`);
    if (match.currentRepresentation) {
      throw new Error(`"${p.name}" is represented at Parliament but missing from the members list.`);
    }
    const reps = await getJson(`${API}/Location/Constituency/${match.id}/Representations`);
    const last = (reps.value ?? [])
      .map((r) => r.member?.value)
      .filter((m) => m?.latestHouseMembership?.membershipEndDate)
      .sort((a, b) => b.latestHouseMembership.membershipEndDate.localeCompare(a.latestHouseMembership.membershipEndDate))[0];
    vacancies.push({
      constituencyName: p.name,
      parliamentConstituencyId: match.id,
      previousMember: last?.nameDisplayAs ?? null,
      previousMemberEnded: last?.latestHouseMembership?.membershipEndDate?.slice(0, 10) ?? null,
      previousMemberEndReason: last?.latestHouseMembership?.membershipEndReason ?? null,
    });
  }
  return vacancies;
}

function applyHolds(mps) {
  if (!existsSync(HOLDS_PATH)) return [];
  const holds = JSON.parse(readFileSync(HOLDS_PATH, "utf8")).holds ?? [];
  const applied = [];
  for (const h of holds) {
    const mp = mps.find((m) => m.constituencyName === h.constituencyName);
    if (!mp) continue;
    if (mp[h.field] === h.apiValue) {
      mp[h.field] = h.publishedValue;
      applied.push(h);
    } else {
      console.warn(`Hold lapsed for ${h.constituencyName} ${h.field}: API now returns "${mp[h.field]}", not "${h.apiValue}".`);
    }
  }
  return applied;
}

function diff(oldFile, next) {
  const lines = [];
  const before = new Map((oldFile.members ?? []).map((m) => [m.constituencyName, m]));
  const after = new Map(next.members.map((m) => [m.constituencyName, m]));
  for (const [name, m] of after) {
    const o = before.get(name);
    if (!o) lines.push(`- ${name}: now ${m.mpName} (${m.party}), elected ${m.electedDate?.slice(0, 10)}; the site lists no MP`);
    else if (o.memberId !== m.memberId) lines.push(`- ${name}: ${o.mpName} (${o.party}) replaced by ${m.mpName} (${m.party}), elected ${m.electedDate?.slice(0, 10)}`);
    else if (o.electedDate !== m.electedDate) lines.push(`- ${name}: ${m.mpName} re-elected, membership now starts ${m.electedDate?.slice(0, 10)} (was ${o.electedDate?.slice(0, 10)}); likely a by-election`);
    else if (o.party !== m.party) lines.push(`- ${name}: ${m.mpName} party ${o.party} to ${m.party}`);
    else if (o.mpName !== m.mpName) lines.push(`- ${name}: display name ${o.mpName} to ${m.mpName}`);
  }
  for (const [name, o] of before) {
    if (!after.has(name)) {
      const v = next.vacancies.find((x) => x.constituencyName === name);
      lines.push(`- ${name}: ${o.mpName} no longer sits${v?.previousMemberEnded ? ` (left ${v.previousMemberEnded}, ${v.previousMemberEndReason})` : ""}; seat vacant`);
    }
  }
  return lines;
}

async function main() {
  const mps = await fetchAllMPs();
  const holds = applyHolds(mps);
  const vacancies = await findVacancies(mps);

  const output = {
    source: "Parliament Members API",
    lastUpdated: new Date().toISOString().split("T")[0],
    totalMPs: mps.length,
    members: mps.sort((a, b) => a.constituencyName.localeCompare(b.constituencyName)),
    vacancies,
    holds,
  };

  if (CHECK) {
    const current = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, "utf8")) : { members: [] };
    const lines = diff(current, output);
    const body = lines.length
      ? `The MP list on the site (${current.lastUpdated}) differs from the Parliament Members API (${output.lastUpdated}):\n\n${lines.join("\n")}\n\nCorroborate each change with an independent source, then run \`node scripts/fetch/fetch-mp-data.mjs\` and open a PR. Use scripts/fetch/mp-holds.json for any change that cannot be corroborated yet.\n`
      : "";
    console.log(lines.length ? body : "MP list matches Parliament.");
    if (REPORT) writeFileSync(REPORT, body);
    return;
  }

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`Wrote ${mps.length} MPs, ${vacancies.length} vacancies and ${holds.length} holds to ${OUT_PATH}`);

  const parties = {};
  for (const mp of mps) parties[mp.party] = (parties[mp.party] ?? 0) + 1;
  console.log("Party breakdown:", parties);
}

main().catch((err) => {
  console.error("Failed:", err.message ?? err);
  process.exit(1);
});
