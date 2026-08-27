"""Resolve the newest Home Office release file for a given filename stem.

Home Office detailed datasets carry their release period in the filename:
`citizenship-datasets-jun-2026.xlsx`, `safe-legal-routes-summary-tables-mar-2026.ods`.
Every transform in this repo used to name one of those files literally, which meant a
script kept working while quietly reading a period older than the one on the site. The
docstrings of several of them named an OLDER period than the code did, which is the
tell: they had each been hand-bumped at least once and the comment was not updated.

The same defect took down the Asylum Stats routes pipeline on 23 August 2026, where nine
hardcoded `-mar-2026` filenames would have thrown ENOENT in CI or, worse locally, served
March figures under a June headline.

Name the stable stem, get the newest period that is actually on disk. A table that did
not ship this quarter (education visas did not ship in June 2026) correctly resolves to
its own latest, rather than failing or silently reading something else.
"""
from __future__ import annotations

import re
from pathlib import Path

MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
          "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}


def _period(name: str):
    m = re.search(r"-(" + "|".join(MONTHS) + r")-(\d{4})", name.lower())
    if not m:
        return None
    return int(m.group(2)), MONTHS[m.group(1)]


def newest_release(directory, stem: str, exts=(".xlsx", ".ods")) -> Path:
    """Newest file in `directory` whose name starts with `stem` and carries a period.

    Raises FileNotFoundError naming the directory and stem, rather than returning a
    path that does not exist, so a missing download fails where it happens.
    """
    d = Path(directory)
    best, best_key = None, None
    if d.is_dir():
        for f in d.iterdir():
            if not f.name.startswith(stem) or f.suffix.lower() not in exts:
                continue
            key = _period(f.name)
            if key and (best_key is None or key > best_key):
                best, best_key = f, key
    if best is None:
        raise FileNotFoundError(
            f"no release file for stem '{stem}' in {d}. "
            f"Download the current file rather than pinning a period in the script."
        )
    return best


def period_label(path) -> str:
    """'Year ending June 2026' for a resolved file, for stamping into output metadata."""
    key = _period(Path(path).name)
    if not key:
        return "unknown period"
    year, month = key
    return f"Year ending {['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month]} {year}"


def period_phrase(path) -> str:
    """'year ending June 2026', for embedding mid-sentence in a source line.

    Lowercasing the whole label gives 'year ending june 2026', which is what a
    naive .lower() on period_label() produces.
    """
    return period_label(path).replace("Year ending", "year ending", 1)
