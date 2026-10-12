#!/usr/bin/env python3
"""
Transform the ONS Police Force Area data tables into src/data/live/crime-dashboard.json.

Source: ONS, "Crime in England and Wales: Police Force Area data tables", the newest
edition named in data/raw/manifests/ons_pfa_crime.json (fetched by
scripts/fetch/fetch-ons-pfa-crime.mjs). ONS discontinued its "Recorded crime data by
Community Safety Partnership area" dataset on 24 October 2024 and moved the CSP rows
into this workbook, so this replaces the year ending March 2024 CSP tables.

Tables read, all by header text and never by column position:
  C1  combined local authorities by Community Safety Partnership (CSP)
  C2  offences by CSP, current year (counts)
  C5  offences by CSP, previous year (counts), for the year on year change
  C4  the population column only, to check that each area's CSPs follow its boundary
  P1, P4  force totals, recorded beside the C2 and C5 force rows as a cross-check

Counts are police recorded crimes excluding fraud. Rates are per 1,000 residents on the
ONS mid-2025 population estimates in src/data/live/population-estimates.json, not on the
mid-2024 figures ONS's own Table C4 uses (see DENOMINATOR_NOTE).

Geography:
  * a CSP with one local authority gives that authority's figure directly;
  * several CSPs filed under one authority (Buckinghamshire, North and West
    Northamptonshire, Bournemouth Christchurch and Poole, East Suffolk) are summed;
  * former districts still published separately (Cumbria's six) are summed into their
    April 2023 successors using src/data/lookups/lad22-to-lad23.json;
  * a CSP covering several authorities (Table C1, "Combined Local Authorities") gives
    one CSP rate, published on each member authority and labelled as a CSP figure.
    Nothing is apportioned;
  * where the CSPs filed under authorities do not match those authorities' populations
    in Table C4 but do match them together (Dorset with Bournemouth, Christchurch and
    Poole in the year ending March 2026 edition), the authorities share one combined
    figure, labelled as such. Any other mismatch stops the run.

Suppressed, with a note on the area: the CSPs the workbook's notes say are recorded
under an "Unassigned" group (Kent, note 4), and City of London, whose rate ONS does not
publish. The year on year change is withheld for every Derbyshire area because the
notes say some Derbyshire areas were recorded as "Unassigned" in the previous year
without naming which.

Run: uv run --with openpyxl python scripts/transform/transform_crime.py
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "data/raw/manifests/ons_pfa_crime.json"
RAW_DIR = ROOT / "data/raw/crime"
POP = ROOT / "src/data/live/population-estimates.json"
EP = ROOT / "src/data/live/ethnic-projections.json"
SUCCESSORS = ROOT / "src/data/lookups/lad22-to-lad23.json"
OUT = ROOT / "src/data/live/crime-dashboard.json"

TOTAL = "total recorded crime (excluding fraud)"
ID_HEADERS = [
    "police force area code",
    "police force area name",
    "community safety partnership code",
    "community safety partnership name",
    "local authority code",
    "local authority name",
]
# Display label, header text in C2 and C5.
BREAKDOWN = [
    ("Violence against the person", "violence against the person"),
    ("Sexual offences", "sexual offences"),
    ("Robbery", "robbery"),
    ("Theft offences", "theft offences"),
    ("Burglary", "burglary"),
    ("Vehicle offences", "vehicle offences"),
    ("Drug offences", "drug offences"),
    ("Public order offences", "public order offences"),
]
COUNT_HEADERS = [TOTAL] + [h for _, h in BREAKDOWN]
LA_CODE = re.compile(r"^(E0[6-9]|W06)\d{6}$")
NOTE_REF = re.compile(r"\s*\[note[^\]]*\]", re.I)
# ONS's own convention in Table C3: percentage changes on a base under 50 are shown as [u].
MIN_BASE_FOR_CHANGE = 50


def fail(msg: str) -> None:
    sys.exit(f"transform_crime: {msg}")


def norm(value) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def clean(value) -> str:
    """A name with its [note n] references and stray spaces removed."""
    return re.sub(r"\s+", " ", NOTE_REF.sub("", str(value or ""))).strip()


def notes_cited(value) -> set[int]:
    found = set()
    for ref in re.findall(r"\[note([^\]]*)\]", str(value or ""), re.I):
        found.update(int(n) for n in re.findall(r"\d+", ref))
    return found


def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def sheet(wb, wanted: str):
    for ws in wb.worksheets:
        if norm(ws.title) == norm(wanted):
            return ws
    fail(f"sheet {wanted!r} not found; sheets are {[ws.title for ws in wb.worksheets]}")


def header_row(rows, required: list[str], table: str):
    for i, row in enumerate(rows):
        headers = [norm(NOTE_REF.sub("", str(c or ""))) for c in row]
        if all(h in headers for h in required):
            return i, {h: headers.index(h) for h in required}
    fail(f"{table}: no header row holds all of {required}")


def title_period(rows, table: str) -> str:
    title = str(rows[0][0] or "")
    m = re.search(r"year ending (\w+ \d{4})", title, re.I)
    if not m:
        fail(f"{table}: no 'year ending <month> <year>' in title {title!r}")
    return m.group(1)


def read_counts(wb, table: str):
    """Rows of a counts table, grouped by force block.

    Each force's block starts with its total row (no CSP code or name) and runs to the
    next total row. Rows are filed to the block they sit in, not by their force code,
    because the year ending March 2026 edition carries at least two CSP rows under a
    neighbouring force's code ("unassigned Surrey" under Kent's, "Unassigned Gwent"
    under South Wales's). The cleaned force name on every row must match its block.
    """
    rows = list(sheet(wb, table).iter_rows(values_only=True))
    period = title_period(rows, table)
    hi, col = header_row(rows, ID_HEADERS + COUNT_HEADERS, table)
    forces: dict[str, dict] = {}
    current = None
    for row in rows[hi + 1:]:
        if not row or all(c is None for c in row):
            continue
        force_code = row[col["police force area code"]]
        force_name = clean(row[col["police force area name"]])
        csp_code = row[col["community safety partnership code"]]
        csp_name = clean(row[col["community safety partnership name"]])
        if not force_code and not force_name:
            continue
        counts = {h: number(row[col[h]]) for h in COUNT_HEADERS}
        if not csp_code and not csp_name:
            if force_code in forces:
                fail(f"{table}: force {force_code} has two total rows")
            current = forces[force_code] = {
                "code": force_code,
                "name": force_name,
                "notes": notes_cited(row[col["police force area name"]]),
                "total": counts[TOTAL],
                "csps": [],
            }
            continue
        if current is None or (force_name.lower() != current["name"].lower()
                               and force_code not in forces and not csp_name.lower().startswith("unassigned")):
            # A force with a single CSP and no total row of its own (City of London).
            if force_code in forces:
                fail(f"{table}: {csp_name!r} reopens force {force_code}")
            current = forces[force_code] = {
                "code": force_code, "name": force_name,
                "notes": notes_cited(row[col["police force area name"]]),
                "total": None, "csps": [],
            }
        if force_name.lower() != current["name"].lower():
            fail(f"{table}: {csp_name!r} names force {force_name!r} inside the {current['name']!r} block")
        current["csps"].append({
            "code": csp_code,
            "name": csp_name,
            "unassigned": csp_name.lower().startswith("unassigned"),
            "filedUnderForceCode": force_code,
            "notes": notes_cited(row[col["police force area name"]]) | notes_cited(row[col["community safety partnership name"]]),
            "laCode": str(row[col["local authority code"]] or "").strip(),
            "laName": clean(row[col["local authority name"]]),
            "counts": counts,
        })
    if not forces:
        fail(f"{table}: no force rows read")
    return period, forces


def read_force_table(wb, table: str) -> tuple[str, dict[str, int]]:
    """Force totals from a Table P counts table, the cross-source check on Table C2 and C5."""
    rows = list(sheet(wb, table).iter_rows(values_only=True))
    period = title_period(rows, table)
    hi, col = header_row(rows, ["area code", "area name", TOTAL], table)
    totals = {}
    for row in rows[hi + 1:]:
        code = str(row[col["area code"]] or "").strip() if row else ""
        if re.match(r"^(E23|W15)\d{6}$", code):
            totals[code] = number(row[col[TOTAL]])
    if not totals:
        fail(f"{table}: no force rows")
    return period, totals


def read_c4_population(wb) -> tuple[str, dict[str, int]]:
    """CSP code to Table C4 population, used only to check that CSPs follow authority boundaries."""
    rows = list(sheet(wb, "Table C4").iter_rows(values_only=True))
    hi, col = header_row(rows, ["community safety partnership code"], "Table C4")
    headers = [norm(NOTE_REF.sub("", str(c or ""))) for c in rows[hi]]
    pop_cols = [(i, h) for i, h in enumerate(headers) if h.startswith("population figures")]
    if len(pop_cols) != 1:
        fail(f"Table C4: expected one 'Population figures' column, found {pop_cols}")
    i, h = pop_cols[0]
    m = re.search(r"mid-(\d{4})", h) or fail(f"Table C4: no mid-year in {h!r}")
    out = {}
    for row in rows[hi + 1:]:
        code = row[col["community safety partnership code"]] if row else None
        if code and number(row[i]) is not None:
            out[code] = row[i]
    return m.group(1), out


def sum_or_none(values):
    total = 0
    for v in values:
        if v is None:
            return None
        total += v
    return total


def read_c1(wb):
    """CSP name to member local authority codes for CSPs covering several authorities."""
    rows = list(sheet(wb, "Table C1").iter_rows(values_only=True))
    required = ["police force area name", "community safety partnership name", "local authority code", "local authority name"]
    hi, col = header_row(rows, required, "Table C1")
    members: dict[str, list[tuple[str, str]]] = defaultdict(list)
    csp = None
    for row in rows[hi + 1:]:
        if not row or all(c is None for c in row):
            continue
        if row[col["community safety partnership name"]]:
            csp = clean(row[col["community safety partnership name"]])
        code = str(row[col["local authority code"]] or "").strip()
        if csp and LA_CODE.match(code):
            members[csp.lower()].append((code, clean(row[col["local authority name"]])))
    return members


def read_notes(wb) -> dict[int, str]:
    rows = list(sheet(wb, "Notes - CSP").iter_rows(values_only=True))
    hi, col = header_row(rows, ["note number", "note text"], "Notes - CSP")
    notes = {}
    for row in rows[hi + 1:]:
        n = number(row[col["note number"]])
        if n is not None and row[col["note text"]]:
            notes[int(n)] = str(row[col["note text"]]).strip()
    return notes


def note_matching(notes: dict[int, str], pattern: str) -> tuple[int, str]:
    hits = [(n, t) for n, t in notes.items() if re.search(pattern, t, re.I)]
    if len(hits) != 1:
        fail(f"expected one CSP note matching {pattern!r}, found {len(hits)}")
    return hits[0]


def iso_from_page_date(text: str) -> str:
    return datetime.strptime(text, "%d %B %Y").date().isoformat()


def months_index(month_year: str) -> int:
    d = datetime.strptime(month_year, "%B %Y")
    return d.year * 12 + d.month


def years_overlap(a: str, b: str) -> bool:
    """Whether two 12-month periods named by their 'year ending' month overlap."""
    return abs(months_index(a) - months_index(b)) < 12


def rate(count, denominator):
    if count is None or not denominator:
        return None
    return round(count / denominator * 1000, 2)


def main() -> None:
    manifest = json.loads(MANIFEST.read_text())
    current = manifest.get("current") or fail("manifest has no current file; run the fetch first")
    src = RAW_DIR / current["fileName"]
    if not src.exists():
        fail(f"{src} is missing; run node scripts/fetch/fetch-ons-pfa-crime.mjs")
    digest = hashlib.sha256(src.read_bytes()).hexdigest()
    if digest != current["fileSha256"]:
        fail(f"{src.name} hash {digest} does not match the manifest")
    attempt = next(a for a in reversed(manifest["attempts"]) if a.get("blob_sha256") == digest)
    if not attempt.get("page_release_date"):
        fail("manifest attempt has no page_release_date for this file")
    release_iso = iso_from_page_date(attempt["page_release_date"])

    wb = load_workbook(src, read_only=True, data_only=True)
    cover = str(next(sheet(wb, "Cover_sheet").iter_rows(values_only=True))[0] or "")
    notes = read_notes(wb)
    period, c2 = read_counts(wb, "Table C2")
    prev_period, c5 = read_counts(wb, "Table C5")
    month, year = period.split()
    if prev_period != f"{month} {int(year) - 1}":
        fail(f"Table C5 covers year ending {prev_period}, not the year before {period}")
    if period.lower() not in cover.lower():
        fail(f"cover sheet title {cover!r} does not name year ending {period}")
    combined = read_c1(wb)
    p1_period, p1 = read_force_table(wb, "Table P1")
    p4_period, p4 = read_force_table(wb, "Table P4")
    if (p1_period, p4_period) != (period, prev_period):
        fail(f"Tables P1 and P4 cover {p1_period} and {p4_period}, not {period} and {prev_period}")

    unassigned_note = note_matching(notes, r"unassigned CSP group from \d{4} onwards")
    derbyshire_note = note_matching(notes, r"Derbyshire.*unassigned")
    city_note = note_matching(notes, r"not presented for City of London")
    # The Derbyshire note names a year; read it rather than assume it.
    m = re.search(r"year ending (\w+ \d{4})", derbyshire_note[1], re.I)
    if not m:
        fail(f"Derbyshire note {derbyshire_note[0]} names no 'year ending' period")
    derbyshire_year = m.group(1)
    # Quarterly editions cover rolling years, so test for any overlap, not an exact match.
    derbyshire_hits_prev = years_overlap(m.group(1), prev_period)
    derbyshire_hits_curr = years_overlap(m.group(1), period)

    pop_file = json.loads(POP.read_text())
    pop = {code: a["population"] for code, a in pop_file["areas"].items()}
    pop_ref = pop_file["source"]["referenceDate"]
    pop_year = pop_ref[:4]
    ep = json.loads(EP.read_text())["areas"]
    successor_of = {
        p["code"]: (succ, info["successorName"])
        for succ, info in json.loads(SUCCESSORS.read_text())["successors"].items()
        for p in info["predecessors"]
    }

    prev_by_csp = {}
    for force in c5.values():
        for c in force["csps"]:
            prev_by_csp[(force["code"], c["code"] or c["name"].lower())] = c

    # Accumulate per site area.
    areas: dict[str, dict] = {}
    forces_out = {}
    suppressed_csps = defaultdict(list)

    def blank(code: str, force) -> dict:
        return {
            "areaName": ep[code]["areaName"],
            "counts": {h: 0 for h in COUNT_HEADERS},
            "prevTotal": 0,
            "prevMissing": False,
            "csps": [],
            "formerDistricts": [],
            "force": force,
            "suppress": None,
        }

    for fcode, force in c2.items():
        prev_force = c5.get(fcode) or fail(f"force {fcode} is in Table C2 but not C5")
        is_derbyshire = force["name"].lower() == "derbyshire"
        assigned = 0
        unassigned_count = 0
        no_area = []
        for c in force["csps"]:
            total = c["counts"][TOTAL]
            if c["unassigned"]:
                unassigned_count += total or 0
                continue
            if not c["code"] and not c["laCode"]:
                # A row for a place that is not an area, such as Manchester Airport (CSP note 2).
                no_area.append({"name": c["name"], "count": total})
                continue
            assigned += total or 0
            prev = prev_by_csp.get((fcode, c["code"] or c["name"].lower()))
            prev_total = prev["counts"][TOTAL] if prev else None

            suppress = None
            if unassigned_note[0] in c["notes"]:
                suppress = f"Withheld: ONS note {unassigned_note[0]} says this area's offences are recorded under an unassigned group, so the published count is not a count for the area. ONS's words: \"{unassigned_note[1]}\""
            elif c["laCode"] == "E09000001":
                suppress = f"Withheld: ONS does not publish a rate for City of London. ONS's words: \"{city_note[1]}\""
            elif is_derbyshire and derbyshire_hits_curr:
                suppress = f"Withheld: ONS note {derbyshire_note[0]} says some Derbyshire areas were recorded as unassigned in this year without naming them. ONS's words: \"{derbyshire_note[1]}\""
            if suppress:
                suppressed_csps[fcode].append({"cspCode": c["code"], "cspName": c["name"], "count": total, "reason": suppress})

            if c["laCode"].lower() == "combined local authorities":
                members = combined.get(c["name"].lower()) or fail(f"combined CSP {c['name']!r} has no Table C1 entry")
                targets = [code for code, _ in members]
                kind = "csp_shared"
            elif LA_CODE.match(c["laCode"]):
                if c["laCode"] in pop:
                    targets, kind = [c["laCode"]], "la"
                elif c["laCode"] in successor_of:
                    targets, kind = [successor_of[c["laCode"]][0]], "former_district"
                else:
                    fail(f"{c['name']!r} is filed under {c['laCode']}, which is neither a site area nor a known former district")
            else:
                fail(f"{c['name']!r} has local authority cell {c['laCode']!r}")

            for code in targets:
                if code not in ep:
                    fail(f"{code} from {c['name']!r} is not a site area")
                a = areas.setdefault(code, blank(code, force))
                if a["force"]["code"] != fcode:
                    fail(f"{code} draws on two forces")
                for h in COUNT_HEADERS:
                    v = c["counts"][h]
                    a["counts"][h] = None if v is None or a["counts"][h] is None else a["counts"][h] + v
                if prev_total is None:
                    a["prevMissing"] = True
                else:
                    a["prevTotal"] += prev_total
                a["csps"].append({"code": c["code"], "name": c["name"], "kind": kind,
                                  "members": [n for _, n in combined.get(c["name"].lower(), [])] if kind == "csp_shared" else None})
                if kind == "former_district":
                    a["formerDistricts"].append(c["laName"])
                if suppress:
                    a["suppress"] = suppress

        prev_unassigned = sum((c["counts"][TOTAL] or 0) for c in prev_force["csps"] if c["unassigned"])
        prev_no_area = [{"name": c["name"], "count": c["counts"][TOTAL]} for c in prev_force["csps"]
                        if not c["unassigned"] and not c["code"] and not c["laCode"]]
        prev_assigned = (sum((c["counts"][TOTAL] or 0) for c in prev_force["csps"] if not c["unassigned"])
                         - sum((r["count"] or 0) for r in prev_no_area))
        force_total = force["total"] if force["total"] is not None else p1.get(fcode)
        prev_total_f = prev_force["total"] if prev_force["total"] is not None else p4.get(fcode)
        if force_total is None or prev_total_f is None:
            fail(f"force {fcode} has no total in Table C2/C5 or P1/P4")
        forces_out[fcode] = {
            "name": force["name"],
            "totalRecordedCrime": force_total,
            "totalFrom": "Table C2" if force["total"] is not None else "Table P1 (no force row in Table C2)",
            "tableP1Total": p1.get(fcode),
            "assignedToAreas": assigned,
            "unassigned": unassigned_count,
            "unassignedSharePct": round(unassigned_count / force_total * 100, 2) if force_total else None,
            "rowsWithoutArea": no_area,
            "previousYear": {
                "totalRecordedCrime": prev_total_f,
                "tableP4Total": p4.get(fcode),
                "assignedToAreas": prev_assigned,
                "unassigned": prev_unassigned,
                "rowsWithoutArea": prev_no_area,
                "unassignedSharePct": round(prev_unassigned / prev_total_f * 100, 2) if prev_total_f else None,
            },
            "suppressedCsps": suppressed_csps.get(fcode, []),
            "rowsFiledUnderAnotherForceCode": [
                {"cspName": c["name"], "filedUnderForceCode": c["filedUnderForceCode"]}
                for c in force["csps"] if c["filedUnderForceCode"] != fcode
            ],
        }

    missing = sorted(set(ep) - set(areas))
    if missing:
        fail(f"no crime row reaches {missing}")

    # Geography check. Table C4 gives each CSP's population (mid-2024 as first published,
    # rounded to 100). Where the CSPs filed under an authority do not add to that
    # authority's own mid-2024 estimate, the partnership boundary does not follow the
    # authority's. If the mismatched authorities in one force add up together, they get
    # one combined figure; otherwise the run stops.
    c4_year, c4_pop = read_c4_population(wb)

    def published_pop(code: str) -> int:
        rev = pop_file["areas"][code]["revisions"].get(c4_year) or fail(f"no mid-{c4_year} revision record for {code}")
        keys = [k for k in rev if k.startswith("published")]
        if len(keys) != 1:
            fail(f"cannot tell which mid-{c4_year} value for {code} was first published: {list(rev)}")
        return rev[keys[0]]

    def area_las(code: str) -> list[str]:
        shared = [c for c in areas[code]["csps"] if c["kind"] == "csp_shared"]
        return [m for m, _ in combined[shared[0]["name"].lower()]] if shared else [code]

    def csp_pop(csp_codes: list[str]) -> int:
        missing_pop = [c for c in csp_codes if c not in c4_pop]
        if missing_pop:
            fail(f"Table C4 has no population for CSPs {missing_pop}")
        return sum(c4_pop[c] for c in csp_codes)

    tolerance = 50  # Table C4 rounds each CSP population to the nearest 100.
    mismatched = defaultdict(list)
    for code, a in areas.items():
        csp_codes = [c["code"] for c in a["csps"]]
        if abs(csp_pop(csp_codes) - sum(published_pop(l) for l in area_las(code))) > tolerance * len(csp_codes):
            mismatched[a["force"]["code"]].append(code)
    geography_groups = []
    for fcode, codes in mismatched.items():
        if any(len(area_las(c)) > 1 for c in codes):
            fail(f"shared CSP areas {codes} do not match their Table C4 population")
        csp_codes = sorted({c["code"] for code in codes for c in areas[code]["csps"]})
        if abs(csp_pop(csp_codes) - sum(published_pop(c) for c in codes)) > tolerance * len(csp_codes) or len(codes) < 2:
            fail(f"CSP populations in Table C4 do not match {codes} in force {fcode}, alone or together")
        group = {
            "codes": sorted(codes),
            "names": [areas[c]["areaName"] for c in sorted(codes)],
            "csps": sorted({(c["code"], c["name"]) for code in codes for c in areas[code]["csps"]}),
            "counts": {h: sum_or_none(areas[c]["counts"][h] for c in codes) for h in COUNT_HEADERS},
            "prevTotal": sum(areas[c]["prevTotal"] for c in codes),
            "prevMissing": any(areas[c]["prevMissing"] for c in codes),
            "suppress": next((areas[c]["suppress"] for c in codes if areas[c]["suppress"]), None),
            "cspPopulationC4": csp_pop(csp_codes),
            "areaPopulationC4Year": sum(published_pop(c) for c in codes),
        }
        geography_groups.append(group)
        for c in codes:
            areas[c]["group"] = group

    # The period text is short and carries no parentheses or semicolons: ukplaces puts it
    # in brackets inside meta descriptions capped at 300 characters, and keeps only the
    # part before a semicolon. The full source is in the top-level "source" field.
    period_label = f"Year ending {period}"
    out_areas = {}
    counts = defaultdict(int)
    for code in sorted(areas):
        a = areas[code]
        shared = [c for c in a["csps"] if c["kind"] == "csp_shared"]
        if shared and len(a["csps"]) > 1:
            fail(f"{code} mixes a shared CSP with other rows")
        group = a.get("group")
        if group:
            a = {**a, "counts": group["counts"], "prevTotal": group["prevTotal"],
                 "prevMissing": group["prevMissing"], "suppress": group["suppress"],
                 "csps": [{"code": c, "name": n} for c, n in group["csps"]]}
            denom_codes = group["codes"]
            denom = sum(pop[c] for c in denom_codes)
            basis = "csp_group"
            # Authority names can contain "and" and commas, so join them unambiguously.
            together = " together with ".join(group["names"])
            basis_note = (f"Combined figure for {together}. The Community Safety Partnerships ONS publishes here "
                          f"({join_names([n for _, n in group['csps']])}) do not follow the authorities' boundaries: "
                          f"their Table C4 populations differ from the authorities' own, but add up to the same total "
                          f"together. ONS publishes no figure for {a['areaName']} alone, and none is apportioned.")
            period_text = f"{period_label}, ONS, combined figure for {together}"
            source_tag = f"csp_group:{together}"
        elif shared:
            c = shared[0]
            denom_codes = [m for m, _ in combined[c["name"].lower()]]
            denom = sum(pop[m] for m in denom_codes) if all(m in pop for m in denom_codes) else None
            basis = "csp_shared"
            basis_note = (f"Community Safety Partnership figure for {c['name']}, which covers "
                          f"{join_names(c['members'])}. ONS publishes no separate figure for {a['areaName']}, "
                          f"so the rate shown is the partnership's, not {a['areaName']}'s alone.")
            period_text = f"{period_label}, ONS, partnership figure for {c['name']}"
            source_tag = f"shared_csp:{c['name']}"
        else:
            denom_codes = [code]
            denom = pop.get(code)
            if a["formerDistricts"]:
                basis = "sum_of_former_districts"
                basis_note = f"Sum of the former districts {join_names(a['formerDistricts'])}, which ONS still publishes separately."
            elif len(a["csps"]) > 1:
                basis = "sum_of_csps"
                basis_note = f"Sum of the Community Safety Partnerships {join_names([c['name'] for c in a['csps']])}, all within {a['areaName']}."
            else:
                basis = "local_authority"
                basis_note = None
            period_text = f"{period_label}, ONS"
            source_tag = "direct" if basis == "local_authority" else basis

        suppressed = a["suppress"] is not None
        total = a["counts"][TOTAL]
        rates = {h: (None if suppressed else rate(a["counts"][h], denom)) for h in COUNT_HEADERS}

        yoy, yoy_note = None, None
        if suppressed:
            yoy_note = "Withheld with the rate."
        elif a["force"]["name"].lower() == "derbyshire" and derbyshire_hits_prev:
            yoy_note = (f"Withheld: ONS note {derbyshire_note[0]} says some Derbyshire areas were recorded under an "
                        f"unassigned group in the year ending {derbyshire_year} without naming them, so the change "
                        f"from the year ending {prev_period} is not a like-for-like comparison.")
        elif a["prevMissing"]:
            yoy_note = f"Withheld: Table C5 has no year ending {prev_period} row for this area."
        elif a["prevTotal"] < MIN_BASE_FOR_CHANGE:
            yoy_note = f"Withheld: fewer than {MIN_BASE_FOR_CHANGE} offences in the year ending {prev_period}, the base ONS uses for a percentage change."
        elif total is not None:
            yoy = round((total - a["prevTotal"]) / a["prevTotal"] * 100, 2)

        fo = forces_out[a["force"]["code"]]
        out_areas[code] = {
            "areaName": a["areaName"],
            "snapshotDate": release_iso,
            "totalCrimeRate": rates[TOTAL],
            "violentCrimeRate": rates["violence against the person"],
            "theftRate": rates["theft offences"],
            "asbRate": None,
            "drugRate": rates["drug offences"],
            "hateCrimeCount": None,
            "yearOnYearChange": yoy,
            "breakdown": [] if suppressed else [
                {"type": label, "rate": rates[h]} for label, h in BREAKDOWN if rates[h] is not None
            ],
            "period": period_text,
            "source": "suppressed" if suppressed else source_tag,
            "basis": basis,
            "basisNote": basis_note,
            "cspCodes": [c["code"] for c in a["csps"]],
            "cspNames": [c["name"] for c in a["csps"]],
            "totalCrimeCount": None if suppressed else total,
            "previousYearCount": None if suppressed or a["prevMissing"] else a["prevTotal"],
            "rateDenominator": None if suppressed else denom,
            "rateDenominatorAreas": None if suppressed else denom_codes,
            "suppressed": suppressed,
            "suppressionNote": a["suppress"],
            "yearOnYearNote": yoy_note,
            "policeForce": {
                "code": a["force"]["code"],
                "name": fo["name"],
                "unassignedSharePct": fo["unassignedSharePct"],
            },
        }
        counts["areas"] += 1
        counts["suppressed" if suppressed else basis] += 1
        if rates[TOTAL] is not None:
            counts["withRate"] += 1

    page_date = attempt["page_release_date"]
    out = {
        "source": (f"ONS, Crime in England and Wales: Police Force Area data tables, year ending {period} "
                   f"(released {page_date}), Tables C1, C2 and C5, police recorded crime from the Home Office; "
                   f"rates per 1,000 residents on ONS mid-{pop_year} population estimates"),
        "methodology": (f"Counts of police recorded crimes excluding fraud, year ending {period}, from Table C2, "
                        f"divided by the ONS mid-{pop_year} resident population and multiplied by 1,000. "
                        f"Year on year change is the total in Table C2 against Table C5 (year ending {prev_period}). "
                        "Where ONS files several Community Safety Partnerships under one authority, or Cumbria's former "
                        "districts under their successors, the counts are summed. Where one partnership covers several "
                        "authorities (Table C1), the partnership's rate is shown on each member and labelled as a "
                        "partnership figure; nothing is apportioned. Areas whose offences ONS records under an "
                        "unassigned group, and City of London, are withheld."),
        "denominator": (f"ONS mid-{pop_year} population estimates ({pop_file['source']['title']}, "
                        f"published {published_date(pop_file['source']['published'])}), taken from "
                        "src/data/live/population-estimates.json. "
                        f"Mid-{pop_year} ({pop_ref}) is the estimate nearest the middle of the year ending {period}. "
                        "It comes from the July 2026 series, which revised mid-2022 to mid-2024. ONS's own Table C4 "
                        "uses mid-2024 population as published before that revision, so rates here differ from C4."),
        "lastUpdated": release_iso,
        "caveat": ("Police recorded crime is shaped by recording practice, reporting rates and policing priority, "
                   "and city centre rates are inflated by small resident populations. Offences a force could not "
                   "place in any area are left out of area figures; each area shows its force's unassigned share."),
        "period": period_label,
        "previousPeriod": f"Year ending {prev_period}",
        "edition": {
            "title": cover.strip(),
            "fileName": current["fileName"],
            "fileSha256": digest,
            "sourceUrl": current["sourceUrl"],
            "releaseDate": release_iso,
            "releaseDateSource": "ONS dataset page at fetch time (data/raw/manifests/ons_pfa_crime.json)",
            "tables": ["C1", "C2", "C5"],
        },
        "notes": {
            "asb": ("Anti-social behaviour is not in the Police Force Area data tables, so asbRate is blank. "
                    "No figure is estimated in its place."),
            "hateCrime": "Hate crime is not in these tables; hateCrimeCount is blank.",
            "unassigned": f"ONS CSP note 2: \"{notes.get(2, '')}\"",
            "kent": f"ONS CSP note {unassigned_note[0]}: \"{unassigned_note[1]}\"",
            "derbyshire": f"ONS CSP note {derbyshire_note[0]}: \"{derbyshire_note[1]}\"",
            "cityOfLondon": f"ONS CSP note {city_note[0]}: \"{city_note[1]}\"",
            "sourceAnomaly": ("In the year ending March 2026 edition some unassigned rows carry a neighbouring force's "
                              "code; rows are filed to the force block they sit in. See forces[*].rowsFiledUnderAnotherForceCode."),
        },
        "counts": dict(sorted(counts.items())),
        "geographyCheck": {
            "method": (f"Each area's CSP populations in Table C4 (mid-{c4_year}, rounded to 100) are compared with the "
                       f"area's mid-{c4_year} estimate as first published, allowing 50 per CSP for rounding."),
            "combinedGroups": [
                {"areas": g["codes"], "areaNames": g["names"], "csps": [n for _, n in g["csps"]],
                 "cspPopulationTableC4": g["cspPopulationC4"], "areaPopulation": g["areaPopulationC4Year"]}
                for g in geography_groups
            ],
        },
        "forces": forces_out,
        "areas": out_areas,
    }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"crime-dashboard.json: year ending {period}; {dict(counts)}")


def published_date(text: str) -> str:
    m = re.search(r"(\d{1,2} \w+ \d{4})", text)
    if not m:
        fail(f"no publication date in population source {text!r}")
    return m.group(1)


def join_names(names: list[str]) -> str:
    names = list(dict.fromkeys(names))
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


if __name__ == "__main__":
    main()
