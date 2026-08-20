#!/usr/bin/env python3
"""
Companies House Persons-of-Significant-Control (PSC) monthly snapshot —
stream-download + stream-parse for nationality aggregates.

The PSC snapshot is the closest thing to a bulk "owners and controllers
of UK companies by nationality" dataset that Companies House publishes
freely. PSCs are anyone holding ≥25% of shares, ≥25% voting rights, or
otherwise exercising significant control. Most active UK companies have
at least one PSC; many have several. PSC nationality is self-declared
at filing.

The snapshot is ~2.1 GB compressed (~8 GB uncompressed), one JSON
record per line. We stream the zip, parse each line for the
`data.nationality` field, and produce per-nationality totals — without
ever materialising the full file to disk.

Output:
  src/data/live/companies-house-psc-nationality.json

Caveats:
  - PSC ≠ director. A company's directors are not necessarily its
    PSCs. PSC captures ownership and control, not operational role.
  - Self-declared nationality. People with multiple nationalities
    typically choose one. Some declare "British" by long-residence
    even where born abroad.
  - The snapshot includes both active and ceased PSCs; we filter to
    active (no `ceased_on` field).
  - Companies House does not publish a free directors-by-nationality
    bulk file. PSC is the closest free proxy.
"""
import json
import sys
import urllib.request
import zipfile
import io
import gzip
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src/data/live/companies-house-psc-nationality.json"
RAW_DIR = ROOT / "data/raw/companies_house"
RAW_DIR.mkdir(parents=True, exist_ok=True)
LOCAL_ZIP = RAW_DIR / "psc-snapshot-latest.zip"

URL = "https://download.companieshouse.gov.uk/persons-with-significant-control-snapshot-2026-04-28.zip"


def normalise(nat):
    """Normalise nationality strings — Companies House data is messy."""
    if not nat:
        return None
    s = str(nat).strip()
    if not s or s.lower() in {"none", "null", "n/a", "unknown"}:
        return None
    # Title-case for consistency
    return s.title()


def stream_download():
    if LOCAL_ZIP.exists() and LOCAL_ZIP.stat().st_size > 1_000_000_000:
        print(f"Using cached {LOCAL_ZIP} ({LOCAL_ZIP.stat().st_size / 1e9:.2f} GB)")
        return
    print(f"Downloading {URL} ...")
    with urllib.request.urlopen(URL) as resp, LOCAL_ZIP.open("wb") as fh:
        total = int(resp.headers.get("Content-Length", 0))
        downloaded = 0
        chunk = 1 << 20  # 1 MiB
        while True:
            block = resp.read(chunk)
            if not block:
                break
            fh.write(block)
            downloaded += len(block)
            if total:
                pct = downloaded / total * 100
                print(f"\r  {downloaded / 1e9:.2f} / {total / 1e9:.2f} GB ({pct:.1f}%)",
                      end="", flush=True)
    print(f"\nWrote {LOCAL_ZIP} ({LOCAL_ZIP.stat().st_size / 1e9:.2f} GB)")


def parse_records():
    print(f"Streaming parse from {LOCAL_ZIP} ...")
    counts = defaultdict(lambda: {"active": 0, "ceased": 0})
    grand = {"active": 0, "ceased": 0, "no_nationality": 0, "total": 0}
    with zipfile.ZipFile(LOCAL_ZIP) as zf:
        names = zf.namelist()
        if not names:
            print("ERROR: zip is empty")
            sys.exit(1)
        # Usually there's a single inner file (sometimes named with .txt or no extension)
        for inner_name in names:
            print(f"  inner: {inner_name}")
            with zf.open(inner_name) as raw:
                # Wrap in a TextIOWrapper for line iteration
                buf = io.TextIOWrapper(raw, encoding="utf-8", errors="replace")
                for line in buf:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    grand["total"] += 1
                    data = rec.get("data") or {}
                    if data.get("kind") and "individual" not in data["kind"]:
                        # Non-individual PSCs (corporate entities) don't have nationality
                        continue
                    nat = normalise(data.get("nationality"))
                    ceased = "ceased_on" in data
                    if not nat:
                        grand["no_nationality"] += 1
                        continue
                    if ceased:
                        counts[nat]["ceased"] += 1
                        grand["ceased"] += 1
                    else:
                        counts[nat]["active"] += 1
                        grand["active"] += 1
                    if grand["total"] % 500_000 == 0:
                        print(f"    processed {grand['total']:,} records, "
                              f"active distinct nationalities {len(counts)}")
    return counts, grand


def main():
    stream_download()
    counts, grand = parse_records()

    # Top by active count
    sorted_nats = sorted(
        counts.items(),
        key=lambda kv: -kv[1]["active"],
    )
    top_active = [
        {"nationality": n, "activePSCs": c["active"], "ceasedPSCs": c["ceased"]}
        for n, c in sorted_nats[:60]
    ]

    out = {
        "source": (
            "Companies House Persons-of-Significant-Control (PSC) monthly "
            "snapshot, 28 April 2026. Aggregated by self-declared "
            "nationality across all individual PSC records (corporate-"
            "entity PSCs excluded as they have no nationality)."
        ),
        "lastUpdated": "2026-04-28",
        "snapshotUrl": URL,
        "totalRecordsProcessed": grand["total"],
        "totalActivePSCs_individual": grand["active"],
        "totalCeasedPSCs_individual": grand["ceased"],
        "totalIndividualPSCsWithNoNationality": grand["no_nationality"],
        "totalDistinctNationalities": len(counts),
        "caveat": (
            "PSC ≠ director: PSCs are owners and controllers (≥25% "
            "shares/votes/control), not operational managers. Self-"
            "declared nationality. Excludes corporate-entity PSCs which "
            "have no nationality. The snapshot is point-in-time; PSC "
            "filings lag actual transactions by up to 14 days."
        ),
        "topActiveNationalities": top_active,
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"\nWrote {OUT}")
    print(f"Total records processed: {grand['total']:,}")
    print(f"Active individual PSCs: {grand['active']:,}")
    print(f"Distinct nationalities: {len(counts):,}")
    print(f"\nTop 15 active PSC nationalities:")
    for n, c in sorted_nats[:15]:
        print(f"  {n:30s} {c['active']:>8,} active   ({c['ceased']:>6,} ceased)")


if __name__ == "__main__":
    main()
