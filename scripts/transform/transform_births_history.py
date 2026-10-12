#!/usr/bin/env python3
"""
National series of live births by mother's country of birth, England and Wales, from
Table 1 of the newest "Parents' country of birth" workbook on disk.

Inputs:
  data/raw/ons_births/<year>birth(s)byparentscountry.xlsx, newest edition, resolved by
  stem (scripts/fetch/fetch-ons-births-cob.mjs downloads it)

Output:
  src/data/live/births-history-national.json

The years, the categories, the release date and the publisher are all read from the
workbook. Categories are matched by their row label and the years by their column header.

Consistency across editions: each edition restates the whole series, and ONS revises
back years (the 2025 edition moved 2023's total by one birth). Before overwriting, the
series being replaced is compared with the new one for every year both hold. Small
revisions are printed for the change record. A revision larger than REVISION_LIMIT in
the total, UK-born or non-UK-born series stops the run, because at that size it is a
break in the series (a definition or coverage change), not a revision, and needs a
person to decide how to show it.

Caveats:
  - England and Wales only. ONS publishes local authority figures only in Table 6a of
    each edition; see births-by-mother-cob.json for the newest year.
  - "Mother's country of birth" is what is recorded at registration.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
import ons_births_workbook as wbk  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data/raw/ons_births"
OUT = ROOT / "src/data/live/births-history-national.json"

TITLE = r"Live births by country of birth of mother, (\d{4}) to (\d{4})$"
HEADLINE = {"totalBirths": "Total", "ukBornMother": "UK", "nonUkBornMother": "Total outside United Kingdom"}
REVISION_LIMIT = 0.01


def read_series(src: Path):
    wb = wbk.open_workbook(src)
    ws, table_title, m = wbk.find_table(wb, TITLE)
    table_rows = wbk.rows(ws)
    h = wbk.header_index(table_rows, r"^country of birth of mother$")
    header = table_rows[h]
    year_cols = []
    for j, cell in enumerate(header[1:], start=1):
        y = wbk.as_int(cell)
        if y is not None and 1900 < y < 2100:
            year_cols.append((y, j))
    if not year_cols:
        raise RuntimeError(f"{src.name} {ws.title}: no year columns in the header row")
    first, last = int(m.group(1)), int(m.group(2))
    years = sorted(y for y, _ in year_cols)
    if years[0] != first or years[-1] != last or len(years) != last - first + 1:
        raise RuntimeError(
            f"{src.name} {ws.title}: title says {first} to {last}, header holds {years}"
        )
    order = sorted(year_cols)
    series = {}
    for r in table_rows[h + 1:]:
        label = wbk.norm(r[0] if r else None)
        if not label:
            continue
        values = [wbk.as_int(r[j]) if j < len(r) else None for _, j in order]
        if all(v is None for v in values):
            continue
        if label in series:
            raise RuntimeError(f"{src.name} {ws.title}: row label '{label}' appears twice")
        series[label] = values
    for label in HEADLINE.values():
        if label not in series:
            raise RuntimeError(f"{src.name} {ws.title}: no '{label}' row")
    return {
        "years": years,
        "series": series,
        "tableTitle": table_title,
        "publisher": wbk.publisher(table_rows),
        "released": wbk.release_date(wb),
        "sheet": ws.title,
    }


def compare_with_previous(previous: dict, years: list[int], new_headline: dict) -> list[dict]:
    """Revisions in the headline series for every year held by both the old and new output."""
    old_years = previous.get("years") or []
    revisions = []
    for key in HEADLINE:
        old_vals = dict(zip(old_years, previous.get(key) or []))
        new_vals = dict(zip(years, new_headline[key]))
        for y in sorted(set(old_vals) & set(new_vals)):
            o, n = old_vals[y], new_vals[y]
            if o is None or n is None or o == n:
                continue
            revisions.append({"series": key, "year": y, "previous": o, "current": n,
                              "relative": round((n - o) / o, 6) if o else None})
    return revisions


def main():
    src = wbk.resolve(RAW_DIR)
    read = read_series(src)
    years, series = read["years"], read["series"]
    headline = {key: series[label] for key, label in HEADLINE.items()}

    non_uk_pct = [
        round(n / t * 100, 1) if (t and n is not None) else None
        for t, n in zip(headline["totalBirths"], headline["nonUkBornMother"])
    ]

    previous = json.loads(OUT.read_text()) if OUT.exists() else {}
    overlap = sorted(set(previous.get("years") or []) & set(years))
    revisions = compare_with_previous(previous, years, headline)
    breaks = [r for r in revisions if r["relative"] is None or abs(r["relative"]) > REVISION_LIMIT]
    if breaks:
        raise RuntimeError(
            "the new edition differs from the series it replaces by more than "
            f"{REVISION_LIMIT:.0%} in an overlapping year; check for a definition change "
            f"before publishing: {breaks}"
        )

    first, last = years[0], years[-1]
    out = {
        "source": wbk.citation(read["publisher"], last, read["released"], read["tableTitle"]),
        "sourceUrl": wbk.DATASET_PAGE,
        "sourceFile": src.name,
        "lastUpdated": read["released"],
        "years": years,
        "totalBirths": headline["totalBirths"],
        "ukBornMother": headline["ukBornMother"],
        "nonUkBornMother": headline["nonUkBornMother"],
        "nonUkBornMotherPct": non_uk_pct,
        "byCategoryTimeSeries": series,
        "caveat": (
            f"England and Wales, live births registered in each year from {first} to {last}, "
            "by the mother's country of birth as recorded at registration. The whole series "
            f"is taken from the {last} edition, which restates earlier years with any "
            "revisions ONS has made. Local authority figures are published for the latest "
            "year only; see births-by-mother-cob.json."
        ),
    }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"Read {src.name}, sheet {read['sheet']}: {read['tableTitle']} (released {read['released']})")
    print(f"Years {first} to {last}; {len(series)} categories")
    if overlap:
        print(f"Checked against the series it replaces for {overlap[0]} to {overlap[-1]}: "
              f"{len(revisions)} revision(s) within {REVISION_LIMIT:.0%}")
        for r in revisions:
            print(f"  {r['series']} {r['year']}: {r['previous']} -> {r['current']}")
    else:
        print("No earlier series to check against")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
