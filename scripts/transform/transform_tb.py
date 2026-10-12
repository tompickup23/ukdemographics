#!/usr/bin/env python3
"""
UKHSA TB surveillance official statistics -> src/data/live/tb-notifications.json.

Reads the newest England supplementary data tables workbook on disk, found by its stable
stem (scripts/lib/newest_release.py), as fetched by scripts/fetch/fetch-ukhsa-tb.mjs.
Every figure, the edition title, the publication date and the period come from the
workbook itself. Nothing about a release is typed here except the citation for its
status (provisional), which UKHSA states in its quality and methodology report rather
than in the workbook.

Tables read, each located by its title text and its header row by column text:
  Supplementary Table 3: three-year average number of people notified with TB and
    three-year average notification rate per 100,000, by UKHSA region, upper tier and
    lower tier local authority, England.
  Supplementary Table 1: number of people notified with TB and rate per 100,000 by
    country and year, UK.

What the figures count: people notified with TB disease, by area of residence and
calendar year of notification. Local rates are three-year averages because annual
counts in many districts are small. They are not arrivals data.

    python3 scripts/transform/transform_tb.py
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))
from newest_release import newest_release  # noqa: E402

RAW_DIR = ROOT / "data/raw/ukhsa_tb"
STEM = "cases-of-tuberculosis-reported-to-enhanced-TB-surveillance-systems-England-"
MANIFEST = ROOT / "data/raw/manifests/ukhsa_tb.json"
AREAS = ROOT / "src/data/live/ethnic-projections.json"
OUT = ROOT / "src/data/live/tb-notifications.json"

# Release status. The workbook does not say; UKHSA's quality and methodology report does.
STATUS = {
    "status": "provisional",
    "quote": "The data in the statistics is provisional and is subject to revision.",
    "source": (
        "UKHSA, Reports of cases of TB to UK enhanced tuberculosis surveillance systems: "
        "quality and methodology information, 4 September 2025"
    ),
    "url": (
        "https://www.gov.uk/government/publications/reports-of-cases-of-tb-to-uk-enhanced-"
        "tuberculosis-surveillance-systems-quality-and-methodology-information/tb-notifications-"
        "reported-to-enhanced-surveillance-systems-quality-and-methodology-information-report"
    ),
}

# UKHSA writes some unitary names in short form ("Bristol", "St. Helens"); norm() drops
# the ", City of" and ", County of" suffixes and full stops so they meet the site's names.
# Published as one area. Neither half can be given the combined rate as its own.
COMBINED = {"hackney and city of london", "cornwall and isles of scilly"}


def norm(name: str) -> str:
    n = str(name).strip().lower().replace("&", "and").replace(".", "")
    n = re.sub(r",\s*(city|county) of$", "", n)
    return re.sub(r"\s+", " ", n)


def fail(msg: str):
    raise SystemExit(f"transform_tb: {msg}")


def find_sheet(book: dict, title_pattern: str):
    """The one sheet whose first cell matches `title_pattern`; fails on none or several."""
    hits = [(name, df) for name, df in book.items()
            if len(df) and re.search(title_pattern, str(df.iat[0, 0]), re.I)]
    if len(hits) != 1:
        fail(f"expected one sheet titled /{title_pattern}/, found {[h[0] for h in hits]}")
    return hits[0]


def header_map(df, required: dict[str, str]):
    """Locate the header row and map each required key to a column by header text.

    `required` maps an output key to a regex matched against the header cell. Fails,
    naming the missing headers, rather than guessing a column position.
    """
    for i in range(min(len(df), 30)):
        cells = [str(v).strip() for v in df.iloc[i].tolist()]
        found = {}
        for key, pattern in required.items():
            cols = [j for j, c in enumerate(cells) if re.fullmatch(pattern, c, re.I)]
            if len(cols) == 1:
                found[key] = cols[0]
        if len(found) == len(required):
            return i, found
    fail(f"no header row carries all of {list(required.values())} in sheet starting {df.iat[0, 0]!r}")


def num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def table_subject(title: str) -> str:
    """'Supplementary Table 3. Three-year average ...' -> 'Three-year average ...'."""
    return re.sub(r"^Supplementary Table \d+\.\s*", "", title.strip()).rstrip(".")


def notes(df, header_row: int) -> list[str]:
    return [str(df.iat[i, 0]).strip() for i in range(header_row)
            if str(df.iat[i, 0]).strip().lower().startswith("note ")]


def main() -> None:
    src = newest_release(RAW_DIR, STEM, exts=(".ods", ".xlsx"), by="year")
    raw = src.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    manifest = json.loads(MANIFEST.read_text())
    held = [a for a in manifest["attempts"] if a.get("blob_sha256") == sha]
    if not held:
        fail(f"{src.name} (sha256 {sha}) is not in {MANIFEST.name}; fetch it with fetch-ukhsa-tb.mjs")
    source_url = held[-1]["url"]
    landing = held[-1].get("landing_page")

    engine = "odf" if src.suffix.lower() == ".ods" else "openpyxl"
    book = pd.read_excel(src, engine=engine, sheet_name=None, header=None)

    # Cover: edition title and publication date, by label text.
    cover = book.get("Cover")
    if cover is None:
        fail("no Cover sheet")
    cover_cells = [str(v).strip() for v in cover.iloc[:, 0].tolist()]
    edition = cover_cells[0].rstrip(", ").strip()
    if not re.search(r"tuberculosis", edition, re.I):
        fail(f"cover title does not name TB: {edition!r}")
    try:
        pub_text = cover_cells[cover_cells.index("Publication date") + 1]
    except (ValueError, IndexError):
        fail("cover has no 'Publication date' label")
    published = datetime.strptime(pub_text, "%d %B %Y").date().isoformat()

    # Supplementary Table 3: LTLA three-year averages.
    t3_name, t3 = find_sheet(book, r"three-year average number of people notified with TB")
    t3_title = str(t3.iat[0, 0]).strip()
    m = re.search(r"(\d{4}) to (\d{4})\s*$", t3_title)
    if not m:
        fail(f"cannot read the period from {t3_name} title {t3_title!r}")
    la_first, la_last = int(m.group(1)), int(m.group(2))
    h3, c3 = header_map(t3, {
        "region": r"UKHSA region",
        "utla": r"Upper tier local authority.*",
        "ltla": r"Lower tier local authority.*",
        "count": r"Number of people notified with TB",
        "rate": r"Rate per 100,000",
        "lci": r"Lower CI",
        "uci": r"Upper CI",
    })

    site = json.loads(AREAS.read_text())["areas"]
    by_name = {norm(a["areaName"]): code for code, a in site.items() if code.startswith("E")}

    areas, unmatched, combined = {}, [], []
    regions = set()
    for i in range(h3 + 1, len(t3)):
        row = t3.iloc[i]
        region, utla, ltla = (str(row.iloc[c3[k]]).strip() for k in ("region", "utla", "ltla"))
        if ltla in ("", "nan"):
            continue
        rate, count = num(row.iloc[c3["rate"]]), num(row.iloc[c3["count"]])
        if ltla == region and utla == region:
            regions.add(region)
            continue
        key = norm(ltla)
        if key in COMBINED:
            combined.append(ltla)
            continue
        code = by_name.get(key)
        if not code:
            unmatched.append(ltla)
            continue
        if rate is None or count is None:
            fail(f"{t3_name} row {i + 1} ({ltla}) has no rate or count")
        if code in areas:
            fail(f"{ltla} appears twice in {t3_name}")
        areas[code] = {
            "areaName": site[code]["areaName"],
            "ukhsaRegion": region,
            "parentUtla": utla,
            "notifications3yrAvg": round(count, 1),
            "ratePer100k": round(rate, 1),
            "lowerCI": round(num(row.iloc[c3["lci"]]), 1),
            "upperCI": round(num(row.iloc[c3["uci"]]), 1),
            "period": f"{la_first} to {la_last}",
            "locator": f"v1:ods:sheet={t3_name};row={i + 1}",
        }
    if unmatched:
        fail(f"{len(unmatched)} {t3_name} areas match no site area: {unmatched}")

    # Supplementary Table 1: England annual counts and rates.
    t1_name, t1 = find_sheet(book, r"Number of individuals notified with TB and rates by country")
    h1, c1 = header_map(t1, {
        "year": r"Year",
        "count": r"Number of cases \(England\)",
        "rate": r"Rate per 100,000 \(England\)",
        "lci": r"Lower 95% CI \(England\)",
        "uci": r"Upper 95% CI \(England\)",
    })
    series = []
    for i in range(h1 + 1, len(t1)):
        year = num(t1.iat[i, c1["year"]])
        count = num(t1.iat[i, c1["count"]])
        if year is None or count is None:
            continue
        series.append({
            "year": int(year),
            "notifications": int(count),
            "ratePer100k": num(t1.iat[i, c1["rate"]]),
            "lowerCI": num(t1.iat[i, c1["lci"]]),
            "upperCI": num(t1.iat[i, c1["uci"]]),
            "locator": f"v1:ods:sheet={t1_name};row={i + 1}",
        })
    series.sort(key=lambda r: r["year"])
    if len(series) < 2:
        fail(f"{t1_name} has fewer than two England years")
    latest, previous = series[-1], series[-2]
    if latest["year"] != la_last or previous["year"] != latest["year"] - 1:
        fail(f"{t1_name} ends {latest['year']} but {t3_name} ends {la_last}")
    change_pct = round((latest["notifications"] - previous["notifications"]) / previous["notifications"] * 100, 1)

    top = sorted(((c, a) for c, a in areas.items() if a["notifications3yrAvg"] >= 5),
                 key=lambda kv: -kv[1]["ratePer100k"])[:15]

    out = {
        "source": (
            f"UKHSA, {edition}. Supplementary Table 3: {table_subject(t3_title)}; England notifications "
            f"and rates by year from Supplementary Table 1. Published {datetime.fromisoformat(published):%-d %B %Y}."
        ),
        "sourceUrl": source_url,
        "landingPage": landing,
        "fileName": src.name,
        "fileSha256": sha,
        "lastUpdated": published,
        "releaseStatus": STATUS,
        "measure": (
            "People notified with TB disease, by area of residence and calendar year of notification. "
            "Local figures are three-year averages of the annual count and of the rate per 100,000."
        ),
        "denominatorNotes": notes(t1, h1) + notes(t3, h3),
        "laPeriod": {"firstYear": la_first, "lastYear": la_last, "label": f"{la_first} to {la_last}"},
        "england": {
            "latestYear": latest["year"],
            "notifications": latest["notifications"],
            "ratePer100k": latest["ratePer100k"],
            "lowerCI": latest["lowerCI"],
            "upperCI": latest["upperCI"],
            "previousYear": previous["year"],
            "previousNotifications": previous["notifications"],
            "notificationsChangePct": change_pct,
            "changeLabel": f"{previous['year']} to {latest['year']}",
            "series": series,
        },
        "caveat": (
            "TB notifications are not arrivals data. Local rates are averages over "
            f"{la_first} to {la_last}, so they are not comparable with England's single-year rate. "
            "England only: Welsh areas have no rate here. UKHSA publishes Hackney with the City of "
            "London, and Cornwall with the Isles of Scilly, as combined areas, so neither half is "
            "shown with a rate of its own. Areas absent from UKHSA's table have no rate."
        ),
        "excludedCombinedAreas": combined,
        "topLaByRate": [
            {"code": c, "name": a["areaName"], "ratePer100k": a["ratePer100k"],
             "notifications3yrAvg": a["notifications3yrAvg"]}
            for c, a in top
        ],
        "areas": dict(sorted(areas.items())),
    }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {OUT.relative_to(ROOT)} from {src.name}")
    print(f"  {len(areas)} areas, LA period {la_first} to {la_last}, regions skipped {len(regions)}, combined skipped {combined}")
    print(f"  England {latest['year']}: {latest['notifications']} notified, rate {latest['ratePer100k']}; "
          f"{previous['year']}: {previous['notifications']}; change {change_pct}%")


if __name__ == "__main__":
    main()
