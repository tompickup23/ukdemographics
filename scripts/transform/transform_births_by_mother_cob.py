#!/usr/bin/env python3
"""
ONS live births by country of birth of mother and area of usual residence (Table 6a of
the "Parents' country of birth" dataset), newest edition on disk.

Per area: all live births registered in the year, split into UK-born and non-UK-born
mothers, with the non-UK-born split into the regional groups ONS publishes at this level.

Pairs with NINo flow and Census 2021 country-of-birth stock: births are a flow in one
calendar year, Census country of birth is a stock of residents on one day. Do not set one
against the other without saying so.

Inputs:
  data/raw/ons_births/<year>birth(s)byparentscountry.xlsx, newest edition, resolved by
  stem (scripts/fetch/fetch-ons-births-cob.mjs downloads it)
  src/data/lookups/area-code-aliases.json

Output:
  src/data/live/births-by-mother-cob.json

What is read from the workbook rather than written here: the year (Table 6a's title), the
release date (cover sheet), the publisher (the table's Source line), every column (by
header text) and the geography of each row.

Caveats:
  - Geography mixes Country, Region, County, Unitary Authority, Metropolitan District,
    Non-metropolitan District and London Borough rows. Each row keeps geographyType.
  - "EU" in Table 6a is the whole European Union as constituted in 2020. "New EU" is a
    subset of it, not an addition: EU, Rest of Europe, Africa, Middle East and Asia and
    Rest of World sum to the non-UK-born total, and New EU is already inside EU.
  - From the 2025 edition the rows are on February 2026 boundaries. Reissued codes are
    filed under the code this site uses (src/data/lookups/area-code-aliases.json).
  - Isles of Scilly is counted with Cornwall in the 2025 edition (ONS note 9).
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
import ons_births_workbook as wbk  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data/raw/ons_births"
ALIASES = ROOT / "src/data/lookups/area-code-aliases.json"
OUT = ROOT / "src/data/live/births-by-mother-cob.json"

TITLE = r"Live births by country of birth of mother and area of usual residence, (\d{4})$"

# Output key -> the region name that ends its header ("... Mother's country of birth EU").
REGION_HEADERS = {
    "EU": "eu",
    "NewEU": "new eu",
    "RestOfEurope_nonEU": "rest of europe (non eu)",
    "Africa": "africa",
    "MiddleEastAndAsia": "middle east and asia",
    "RestOfWorld": "rest of world",
}

LA_GEOGRAPHIES = {
    "Unitary Authority", "Non-metropolitan District",
    "London Borough", "Metropolitan District",
}


def main():
    src = wbk.resolve(RAW_DIR)
    wb = wbk.open_workbook(src)
    ws, table_title, m = wbk.find_table(wb, TITLE, header_has="to UK-born mothers")
    year = int(m.group(1))
    released = wbk.release_date(wb)
    table_rows = wbk.rows(ws)
    publisher = wbk.publisher(table_rows)
    h = wbk.header_index(table_rows, r"\bcode$")
    headers = [wbk.norm(c) for c in table_rows[h]]

    col = {
        "code": wbk.column(headers, "code", lambda s: s.endswith("code")),
        "name": wbk.column(headers, "name", lambda s: s.endswith("name")),
        "geography": wbk.column(headers, "geography", lambda s: s.endswith("geography")),
        "total": wbk.column(headers, "all live births", lambda s: s == "number of live births"),
        "uk": wbk.column(headers, "UK-born mothers",
                         lambda s: s.endswith("to uk-born mothers")),
        "nonuk": wbk.column(headers, "non-UK-born mothers",
                            lambda s: s.endswith("to non-uk-born mothers")),
        "pct": wbk.column(headers, "non-UK-born percentage",
                          lambda s: "non-uk-born mothers" in s and s.endswith("percentage of all live births")),
    }
    for key, region in REGION_HEADERS.items():
        col[key] = wbk.column(
            headers, f"mother's country of birth: {region}",
            lambda s, region=region: "mother's country of birth" in s
            and s.split("mother's country of birth")[-1].strip() == region,
        )

    aliases = json.loads(ALIASES.read_text())["aliases"]

    areas = {}
    skipped = []
    for r in table_rows[h + 1:]:
        code = wbk.norm(r[col["code"]] if len(r) > col["code"] else None)
        if not code:
            continue
        total = wbk.as_int(r[col["total"]])
        uk_born = wbk.as_int(r[col["uk"]])
        non_uk = wbk.as_int(r[col["nonuk"]])
        if total is None or uk_born is None or non_uk is None:
            skipped.append(code)
            continue
        code = aliases.get(code, code)
        if code in areas:
            raise RuntimeError(f"{code} appears twice in {ws.title} after resolving aliases")
        regions = {}
        for key in REGION_HEADERS:
            v = wbk.as_int(r[col[key]])
            if v is not None:
                regions[key] = v
        areas[code] = {
            "areaName": wbk.norm(r[col["name"]]),
            "geographyType": wbk.norm(r[col["geography"]]),
            "totalBirths": total,
            "ukBornMother": uk_born,
            "nonUkBornMother": non_uk,
            "nonUkBornMotherPct": wbk.as_float(r[col["pct"]]),
            "ukBornMotherPct": round(uk_born / total * 100, 1) if total else None,
            "byMotherRegion": regions,
        }

    if not areas:
        raise RuntimeError(f"no data rows read from {src.name} {ws.title}")

    la_areas = [
        (c, a) for c, a in areas.items()
        if a["geographyType"] in LA_GEOGRAPHIES and a["nonUkBornMotherPct"] is not None
    ]
    if not la_areas:
        raise RuntimeError("no local authority rows; the geography labels have changed")
    top_pct = sorted(la_areas, key=lambda kv: -kv[1]["nonUkBornMotherPct"])[:15]
    bottom_pct = sorted(la_areas, key=lambda kv: kv[1]["nonUkBornMotherPct"])[:10]

    def brief(c, a):
        return {"code": c, "name": a["areaName"], "totalBirths": a["totalBirths"],
                "nonUkBornMotherPct": a["nonUkBornMotherPct"]}

    out = {
        "source": wbk.citation(publisher, year, released, table_title),
        "sourceUrl": wbk.DATASET_PAGE,
        "sourceFile": src.name,
        "lastUpdated": released,
        "year": year,
        "measure": (
            f"Live births registered in {year}, by the mother's area of usual residence "
            "and the mother's country of birth as recorded at registration."
        ),
        "caveat": (
            "Mother's country of birth is reported in regional groups at local authority "
            "level; individual countries are published for England and Wales only. EU is "
            "the whole European Union as constituted in 2020, and NewEU is a subset of it, "
            "so EU, RestOfEurope_nonEU, Africa, MiddleEastAndAsia and RestOfWorld sum to "
            "the non-UK-born total. Geography mixes Country, Region, County, Unitary "
            "Authority, Metropolitan District, Non-metropolitan District and London Borough "
            "rows in one file, so filter on geographyType when joining. Births are a flow "
            "in one year, not a count of residents."
        ),
        "totalAreas": len(areas),
        "topNonUkBornMotherLAs": [brief(c, a) for c, a in top_pct],
        "bottomNonUkBornMotherLAs": [brief(c, a) for c, a in bottom_pct],
        "areas": areas,
    }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"Read {src.name}, sheet {ws.title}: {table_title}")
    print(f"Released {released}; {len(areas)} areas; rows without counts skipped: {skipped or 'none'}")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
