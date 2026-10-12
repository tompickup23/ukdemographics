"""Read DfE "Schools, pupils and their characteristics" CSVs by header text.

Shared by transform_school_eal.py and transform_school_eal_district.py.

Three things changed between the 2024/25 and 2025/26 releases that a script naming a
file and reading it with defaults would not notice:
  - the encoding: 2024/25 files were Windows-1252, 2025/26 files are UTF-8 with a byte
    order mark, which turns the first header into "\\ufefftime_period";
  - the columns: 2025/26 adds pcon_code and pcon_name to the ethnicity and language file
    (moving every later column along by two) and renames parl_con_* in the school file;
  - the file names, which the fetch now stores with the academic year in them.

So files are resolved by stem (scripts/lib/newest_release.py), opened with the encoding
their bytes declare, and read through csv.DictReader after checking that every column
the caller needs is present. The academic year is read from the time_period column.
The release title and dates come from the fetch manifest entry whose sha256 matches the
file on disk, so a hand-copied file cannot borrow another release's dates.
"""
from __future__ import annotations

import csv
import hashlib
import json
from datetime import date
from pathlib import Path

from newest_release import newest_edition

ETHNICITY_LANGUAGE = r"spc_pupils_ethnicity_and_language_(?P<edition>\d{4})-\d{2}\.csv"
SCHOOL_LEVEL = r"spc_school_level_underlying_data_(?P<edition>\d{4})\.csv"


def resolve(raw_dir: Path, pattern: str) -> Path:
    return newest_edition(raw_dir, pattern)


def encoding_of(path: Path) -> str:
    head = path.open("rb").read(3)
    if head == b"\xef\xbb\xbf":
        return "utf-8-sig"
    try:
        with path.open(encoding="utf-8") as fh:
            for _ in fh:
                pass
        return "utf-8"
    except UnicodeDecodeError:
        return "cp1252"


def open_reader(path: Path, required: list[str]):
    """(file handle, DictReader) after checking every `required` column is present."""
    fh = path.open(encoding=encoding_of(path), newline="")
    reader = csv.DictReader(fh)
    names = [n.strip() for n in (reader.fieldnames or [])]
    reader.fieldnames = names
    missing = [c for c in required if c not in names]
    if missing:
        fh.close()
        raise RuntimeError(f"{path.name}: missing columns {missing}")
    return fh, reader


def academic_year(period: str) -> str:
    """'202526' -> '2025/26'."""
    s = str(period).strip()
    if len(s) != 6 or not s.isdigit() or int(s[4:]) != (int(s[:4]) + 1) % 100:
        raise ValueError(f"unexpected time_period {period!r}")
    return f"{s[:4]}/{s[4:]}"


def release_for(path: Path, manifest_path: Path) -> dict:
    """The manifest's release record, provided the manifest describes these exact bytes."""
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    manifest = json.loads(manifest_path.read_text())
    for entry in (manifest.get("current") or {}).values():
        if entry.get("fileSha256") == digest:
            rel = manifest.get("release") or {}
            if not rel.get("published"):
                raise RuntimeError(f"{manifest_path.name} has no release date")
            return {**rel, "publisher": manifest.get("publisher"), "fileSha256": digest,
                    "sourceUrl": entry.get("sourceUrl")}
    raise RuntimeError(
        f"{path.name} (sha256 {digest[:12]}) is not the file {manifest_path.name} records; "
        "run scripts/fetch/fetch-dfe-pupil-characteristics.mjs rather than copying a file in"
    )


def long_date(iso: str) -> str:
    """'2026-06-04' -> '4 June 2026'."""
    d = date.fromisoformat(iso)
    return f"{d.day} {d:%B %Y}"


def area_code_aliases(root: Path) -> dict[str, str]:
    """Reissued code -> the code this site files the area under (one table for the repo).

    The 2025/26 school level file files Barnsley and Sheffield under the codes ONS
    reissued in April 2025 (E08000038, E08000039). Without this their place pages would
    lose the schools section, because the site keys both on their Census codes.
    """
    path = root / "src/data/lookups/area-code-aliases.json"
    return json.loads(path.read_text())["aliases"]
