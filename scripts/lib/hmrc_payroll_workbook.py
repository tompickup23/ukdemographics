"""Read HMRC's payrolled employments workbook by text, not by position.

Shared by transform_payroll_by_nationality.py and transform_payroll_regional.py.

Both transforms used to open `payrolled-employments-2014-2024.ods` (a hand-renamed
download), take sheets by number and assume the regional tables sat at sheets 5 to 17
in a fixed order. Everything here is found by what it says instead:
  - the file by its stable GOV.UK stem, newest reference period first;
  - a table by the title in its first cell;
  - the region of a regional table from its title, not its sheet number;
  - the reference period and publication date from the cover sheet;
  - the publisher from the cover sheet's "Produced by" line.
"""
from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

import pandas as pd

from newest_release import newest_edition

# GOV.UK keeps the edition's period in the name:
# Payrolled_employments_in_the_UK_by_nationality__region_and_industry__from_July_2014_to_December_2025.ods
FILE_PATTERN = (
    r"Payrolled_employments_in_the_UK_by_nationality__region_and_industry__"
    r"from_July_2014_to_(?P<month>[A-Za-z]+)_(?P<edition>\d{4})(?:_-_Data_tables)?\.ods"
)

COLLECTION_PAGE = (
    "https://www.gov.uk/government/collections/"
    "uk-payrolled-employments-by-nationality-region-industry-age-and-sex"
)


def norm(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    s = re.sub(r"\s+", " ", str(value).replace("\xa0", " ")).strip()
    # The December 2024 edition prints "Total employmentcounts" (a line break lost in
    # the ODS); the December 2025 edition prints "Total employment counts".
    return re.sub(r"employment\s*counts", "employment counts", s, flags=re.IGNORECASE)


def resolve(raw_dir: Path) -> Path:
    return newest_edition(raw_dir, FILE_PATTERN)


def read_all(path: Path) -> dict[str, pd.DataFrame]:
    return pd.read_excel(path, engine="odf", sheet_name=None, header=None)


def title(df: pd.DataFrame) -> str:
    return norm(df.iloc[0, 0]) if len(df) else ""


def cover(sheets: dict[str, pd.DataFrame]) -> dict:
    """Workbook title, reference period, publication date and publisher from the cover."""
    texts = []
    for df in sheets.values():
        cells = [norm(v) for v in df.iloc[:, 0].tolist()] if df.shape[1] else []
        if any(c.startswith("Date published") for c in cells):
            texts = cells
            break
    if not texts:
        raise RuntimeError("no cover sheet with a 'Date published' line")
    wb_title = next((c for c in texts if re.search(r"from \w+ \d{4} to \w+ \d{4}$", c)), None)
    if not wb_title:
        raise RuntimeError("no workbook title ending 'from <Month> <year> to <Month> <year>' on the cover")
    period = re.search(r"from (\w+ \d{4}) to (\w+ \d{4})$", wb_title)
    published = next((re.search(r"Date published:\s*(\d{1,2} \w+ \d{4})", c) for c in texts
                      if c.startswith("Date published")), None)
    if not published:
        raise RuntimeError("the 'Date published' line has no date")
    producer = next((c for c in texts if c.startswith("Produced by")), "")
    publisher = producer.split(",")[-1].strip() if producer else ""
    if not publisher:
        raise RuntimeError("no 'Produced by' line naming the publisher on the cover")
    return {
        "title": wb_title,
        "periodStart": period.group(1),
        "periodEnd": period.group(2),
        "published": datetime.strptime(published.group(1), "%d %B %Y").date().isoformat(),
        "publisher": publisher,
    }


def find_table(sheets: dict[str, pd.DataFrame], title_pattern: str) -> list[tuple[str, str, re.Match]]:
    rx = re.compile(title_pattern, re.IGNORECASE)
    hits = []
    for name, df in sheets.items():
        t = title(df)
        m = rx.search(t)
        if m:
            hits.append((name, t, m))
    return hits


def table_frame(df: pd.DataFrame, sheet: str) -> pd.DataFrame:
    """The table under the header row that starts 'Date', with 'End of worksheet' dropped."""
    header = None
    for i in range(min(10, len(df))):
        if norm(df.iloc[i, 0]) == "Date":
            header = i
            break
    if header is None:
        raise RuntimeError(f"sheet {sheet}: no header row starting 'Date'")
    cols = [norm(c) for c in df.iloc[header].tolist()]
    if len(set(c for c in cols if c)) != len([c for c in cols if c]):
        raise RuntimeError(f"sheet {sheet}: repeated column header")
    body = df.iloc[header + 1:].copy()
    body.columns = cols
    body = body[body["Date"].map(norm).ne("End of worksheet")]
    body = body[body["Date"].map(norm).ne("")]
    for c in cols[1:]:
        if c:
            body[c] = pd.to_numeric(body[c], errors="coerce")
    return body.reset_index(drop=True)


def check_months(body: pd.DataFrame, sheet: str, period_end: str) -> None:
    """Dates run month by month without a gap and end at the cover's reference period."""
    dates = [datetime.strptime(norm(d), "%B %Y") for d in body["Date"]]
    for a, b in zip(dates, dates[1:]):
        if (b.year - a.year) * 12 + (b.month - a.month) != 1:
            raise RuntimeError(f"sheet {sheet}: dates jump from {a:%B %Y} to {b:%B %Y}")
    if dates[-1].strftime("%B %Y") != period_end:
        raise RuntimeError(f"sheet {sheet}: last row is {dates[-1]:%B %Y}, cover says {period_end}")


def same_month_years_back(body: pd.DataFrame, years: int):
    """Row for the same calendar month `years` earlier, matched by date text, or None."""
    latest = datetime.strptime(norm(body["Date"].iloc[-1]), "%B %Y")
    target = f"{latest.strftime('%B')} {latest.year - years}"
    hits = body.index[body["Date"].map(norm) == target].tolist()
    return body.loc[hits[0]] if hits else None
