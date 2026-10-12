#!/usr/bin/env python3
"""
MHCLG Council Taxbase local authority level data -> src/data/live/council-tax-spd.json.

Reads the newest workbook held in data/raw/council_taxbase/, found by its stable stem
(scripts/lib/newest_release.py), as stored by scripts/fetch/fetch-council-taxbase.mjs.
The edition, publication and revision dates, the snapshot date and every figure come
from the workbook. Tables are located by their title text and columns by header text,
never by position, because the layout moves between editions (the 2025 workbook moved
from .ods to .xlsx and added second-home tables that shift every column after them).

Tables read, from the "Council Taxbase Data" sheet, each at its "Total" column:
  1.01  total dwellings on the valuation list (totalDwellings)
  1.07  chargeable dwellings adjusted for disabled relief (chargeableDwellings, the
        denominator of the single-person share)
  1.08  dwellings entitled to the single adult household 25% discount
        (singlePersonDiscount25)
  1.09  25% discount because all but one resident is disregarded (disregarded25)
  1.10  50% discount because all residents are disregarded (disregardedAll50)

What the share counts: dwellings receiving the single adult discount as a percentage of
chargeable dwellings on the snapshot date. It is a count of dwellings, not of people.

    python3 scripts/transform/transform_council_tax_spd.py
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))
from newest_release import newest_release  # noqa: E402

RAW_DIR = ROOT / "data/raw/council_taxbase"
STEM = "council-taxbase-la-level_"
MANIFEST = ROOT / "data/raw/manifests/council_taxbase.json"
AREAS = ROOT / "src/data/live/ethnic-projections.json"
ALIASES = ROOT / "src/data/lookups/area-code-aliases.json"
OUT = ROOT / "src/data/live/council-tax-spd.json"
SHEET = "Council Taxbase Data"

TABLES = {
    "totalDwellings": r"^Table 1\.01\.? Total Number of Dwellings on Valuation List",
    "chargeableDwellings": r"^Table 1\.07\.? Number of chargeable dwellings adjusted",
    "singlePersonDiscount25": r"^Table 1\.08\.? Number of dwellings in line 7 entitled to a single adult household 25% discount",
    "disregarded25": r"^Table 1\.09\.? Number of dwellings in line 7 entitled to a 25% discount .*all but one resident being disregarded",
    "disregardedAll50": r"^Table 1\.10\.? Number of dwellings in line 7 entitled to a 50% discount .*all residents being disregarded",
}
DATE = r"(\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4})"


def fail(msg: str):
    raise SystemExit(f"transform_council_tax_spd: {msg}")


def iso(text: str) -> str:
    return datetime.strptime(text, "%d %B %Y").date().isoformat()


def to_int(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return None


def main() -> None:
    src = newest_release(RAW_DIR, STEM, exts=(".xlsx", ".ods"), by="year")
    raw = src.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    manifest = json.loads(MANIFEST.read_text())
    held = [a for a in manifest["attempts"] if a.get("blob_sha256") == sha]
    if not held:
        fail(f"{src.name} (sha256 {sha}) is not in {MANIFEST.name}; fetch it with fetch-council-taxbase.mjs")
    attempt = held[-1]

    engine = "odf" if src.suffix == ".ods" else "openpyxl"
    book = pd.read_excel(src, engine=engine, sheet_name=None, header=None)

    # Cover: title, publication and revision dates.
    cover = book.get("Cover")
    if cover is None:
        fail("no Cover sheet")
    cover_text = [str(v).strip() for v in cover.iloc[:, 0].tolist() if str(v) != "nan"]
    title = cover_text[0]
    m = re.search(r"Local Authority Level Data for (\d{4})", title, re.I)
    if not m:
        fail(f"cover title does not name the year: {title!r}")
    edition_year = int(m.group(1))
    published_line = next((t for t in cover_text if t.lower().startswith("published by")), None)
    if not published_line:
        fail("cover has no 'Published by' line")
    dates = [iso(d) for d in re.findall(DATE, published_line)]
    if not dates:
        fail(f"no date in {published_line!r}")
    first_published, last_updated = min(dates), max(dates)

    # Data sheet: title row, header row, then rows by ONS code.
    if SHEET not in book:
        fail(f"no {SHEET!r} sheet")
    df = book[SHEET]
    title_row = next((i for i in range(min(15, len(df)))
                      if any(str(v).startswith("Table 1.01") for v in df.iloc[i].tolist())), None)
    if title_row is None:
        fail("no row of table titles")
    header = [str(v).strip() for v in df.iloc[title_row + 1].tolist()]
    try:
        code_col = header.index("ONS Code")
        name_col = header.index("Local Authority")
    except ValueError:
        fail(f"header row lacks 'ONS Code' or 'Local Authority': {header[:6]}")
    titles = [(j, str(v).strip()) for j, v in enumerate(df.iloc[title_row].tolist()) if str(v) != "nan"]

    cols, found_titles = {}, {}
    for key, pattern in TABLES.items():
        hits = [(j, t) for j, t in titles if re.search(pattern, t, re.I)]
        if len(hits) != 1:
            fail(f"expected one table matching /{pattern}/, found {len(hits)}")
        start, text = hits[0]
        nxt = min([j for j, _ in titles if j > start], default=len(header))
        total = [j for j in range(start, nxt) if header[j] == "Total"]
        if len(total) != 1:
            fail(f"table {text[:40]!r} has {len(total)} 'Total' columns")
        cols[key], found_titles[key] = total[0], text

    snap = re.search(r"on " + DATE, found_titles["singlePersonDiscount25"])
    if not snap:
        fail("Table 1.08 title gives no snapshot date")
    snapshot = iso(snap.group(1))

    aliases = json.loads(ALIASES.read_text())["aliases"]
    site = json.loads(AREAS.read_text())["areas"]
    areas, england = {}, None
    for i in range(title_row + 2, len(df)):
        row = df.iloc[i]
        code = str(row.iloc[code_col]).strip()
        if not code.startswith("E"):
            continue
        rec = {k: to_int(row.iloc[c]) for k, c in cols.items()}
        if not rec["chargeableDwellings"]:
            fail(f"row {i + 1} ({code}) has no chargeable dwellings")
        rec = {
            "areaName": str(row.iloc[name_col]).strip(),
            "totalDwellings": rec["totalDwellings"],
            "chargeableDwellings": rec["chargeableDwellings"],
            "singlePersonDiscount25": rec["singlePersonDiscount25"],
            "singlePersonDiscountPctOfChargeable": (
                round(rec["singlePersonDiscount25"] / rec["chargeableDwellings"] * 100, 1)
                if rec["singlePersonDiscount25"] is not None else None
            ),
            "disregarded25": rec["disregarded25"],
            "disregardedAll50": rec["disregardedAll50"],
            "locator": f"v1:xlsx:sheet={SHEET};row={i + 1}",
        }
        if code == "E92000001":
            england = rec
            continue
        code = aliases.get(code, code)
        if code not in site:
            fail(f"{code} ({rec['areaName']}) is not a site area")
        if code in areas:
            fail(f"{code} appears twice")
        # The site's own name, so the page and the file agree ("County Durham", not
        # the workbook's "Durham").
        rec["areaName"] = site[code]["areaName"]
        areas[code] = rec
    if england is None:
        fail("no England row")

    with_share = [(c, a) for c, a in areas.items() if a["singlePersonDiscountPctOfChargeable"] is not None]
    top = sorted(with_share, key=lambda kv: -kv[1]["singlePersonDiscountPctOfChargeable"])[:15]
    bot = sorted(with_share, key=lambda kv: kv[1]["singlePersonDiscountPctOfChargeable"])[:10]
    snap_text = f"{datetime.fromisoformat(snapshot):%-d %B %Y}"
    revised = f", revised {datetime.fromisoformat(last_updated):%-d %B %Y}" if last_updated != first_published else ""

    out = {
        "source": (
            f"MHCLG, Council Taxbase {edition_year} in England, local authority level data (CTB returns, "
            f"snapshot {snap_text}; published {datetime.fromisoformat(first_published):%-d %B %Y}{revised}). "
            "Single adult 25% discount is Table 1.08; the denominator is Table 1.07 (chargeable dwellings)."
        ),
        "sourceShort": f"MHCLG Council Taxbase {edition_year} (CTB, snapshot {snap_text})",
        "sourceUrl": attempt["url"],
        "landingPage": attempt.get("landing_page"),
        "fileName": src.name,
        "publishedFileName": attempt.get("published_file_name"),
        "fileSha256": sha,
        "edition": edition_year,
        "snapshotDate": snapshot,
        "firstPublished": first_published,
        "lastUpdated": last_updated,
        "caveat": (
            "Counts dwellings, not people. The single adult discount is the cleanest available signal of "
            "single-person occupancy. The separate discounts for dwellings where all but one resident is "
            "disregarded (Table 1.09) or all residents are disregarded (Table 1.10) cover students, people "
            f"who are severely mentally impaired and similar cases, and are shown separately. Snapshot {snap_text}."
        ),
        "totalLAs": len(areas),
        "england": england,
        "topLAsBySpdShare": [
            {"code": c, "name": a["areaName"], "spdShare": a["singlePersonDiscountPctOfChargeable"],
             "spdCount": a["singlePersonDiscount25"]}
            for c, a in top
        ],
        "bottomLAsBySpdShare": [
            {"code": c, "name": a["areaName"], "spdShare": a["singlePersonDiscountPctOfChargeable"]}
            for c, a in bot
        ],
        "areas": dict(sorted(areas.items())),
    }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {OUT.relative_to(ROOT)} from {src.name}: {len(areas)} areas, snapshot {snapshot}, "
          f"published {first_published}, updated {last_updated}")
    print(f"  England: {england['singlePersonDiscount25']:,} of {england['chargeableDwellings']:,} "
          f"chargeable dwellings ({england['singlePersonDiscountPctOfChargeable']}%)")


if __name__ == "__main__":
    main()
