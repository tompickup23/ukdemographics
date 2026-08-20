#!/usr/bin/env python3
"""
Transform Stat-Xplore NINo cube response → nino-dashboard.json.

The Stat-Xplore /table endpoint returns:
  {
    "fields": [<dim 1>, <dim 2>, ...],          # one per dimension requested
    "measures": [<measure 1>, ...],              # one per measure requested
    "cubes": {
      "<measure key>": {
        "values": [[[count, ...], ...], ...]     # nested arrays in dim order
      }
    }
  }

Each `field` has `items: [{labels: [...], code/uris: [...]}]` describing the
ordered values of that dimension. The values cube has the same dimension
order — values[geog_idx][nat_idx][date_idx] for a 3D cube.

We collapse to: per-LA totals over the most recent 4 quarters (rolling year),
plus top-N nationalities per LA, plus year-on-year growth on the rolling-year
total. LA codes from `GEOG_LAUA` are ONS LAD codes (E06xxxxxx etc).

Outputs: src/data/live/nino-dashboard.json
"""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/raw/supplementary/nino-statxplore-cube.json"
OUT = ROOT / "src/data/live/nino-dashboard.json"
EP = ROOT / "src/data/live/ethnic-projections.json"

TOP_N_NATIONALITIES = 10


def field_index(fields, hint):
    """Locate the dimension index for a field whose URI contains `hint`."""
    for i, f in enumerate(fields):
        uri = f.get("uri", "") + " " + f.get("label", "")
        if hint.lower() in uri.lower():
            return i
    raise KeyError(f"No field matched '{hint}' in {[f.get('uri') for f in fields]}")


def field_items(fields, idx):
    """Return [(label, code), ...] for a dimension."""
    items = fields[idx].get("items", [])
    out = []
    for it in items:
        labels = it.get("labels", [])
        code = (it.get("uris") or [""])[0]
        out.append((labels[0] if labels else code, code))
    return out


def main():
    if not SRC.exists():
        print(f"ERROR: {SRC} not found. Run scripts/fetch/fetch-nino.mjs first (needs STATXPLORE_API_KEY).")
        return 2

    cube = json.loads(SRC.read_text())
    fields = cube.get("fields", [])
    geog_i = field_index(fields, "UK_COA")
    nat_i = field_index(fields, "NEWNAT")
    date_i = field_index(fields, "QTR")

    geog_items = field_items(fields, geog_i)
    nat_items = field_items(fields, nat_i)
    date_items = field_items(fields, date_i)

    # Find the cube values for our single measure
    measure_keys = list(cube.get("cubes", {}).keys())
    if not measure_keys:
        print("ERROR: no cubes in response")
        return 2
    values = cube["cubes"][measure_keys[0]]["values"]

    # `values` is nested in the dimension order returned by the API. Walk the
    # tree by dimension index to extract count(geog, nat, date).
    def walk(node, depth):
        if depth == 0:
            return [node]
        out = []
        for child in node:
            out.extend(walk(child, depth - 1))
        return out

    # Order in `fields` corresponds to the order of `values` nesting.
    dim_order = [geog_i, nat_i, date_i]
    sorted_dims = sorted(dim_order)

    # Build a flat (geog_idx, nat_idx, date_idx) → count map.
    counts = {}
    def descend(node, dim_path):
        if len(dim_path) == 0:
            counts[(dim_path_state[geog_i], dim_path_state[nat_i], dim_path_state[date_i])] = node
            return
        # not used — replaced below

    # Simpler: assume the API returns dims in the order requested (geog, nat, date).
    for gi, by_nat in enumerate(values):
        for ni, by_date in enumerate(by_nat):
            for di, count in enumerate(by_date):
                if isinstance(count, (int, float)) and count > 0:
                    counts[(gi, ni, di)] = float(count)

    # Determine the most recent 4 dates (rolling year) and the prior 4.
    n_dates = len(date_items)
    recent_dates = list(range(max(0, n_dates - 4), n_dates))
    prior_dates = list(range(max(0, n_dates - 8), max(0, n_dates - 4)))

    # Per-LA aggregation
    ep = json.loads(EP.read_text())
    ep_codes = set(ep["areas"].keys())

    # Resolve geog item → LA code
    def resolve_la_code(label, code):
        # Stat-Xplore uri form often: "str:value:NINO:...:LA:E06000001"
        # Pull out the trailing E0x... if present
        for tok in code.replace("/", ":").split(":"):
            if tok.startswith("E0") and len(tok) == 9:
                return tok
        # Otherwise try the label
        for tok in (label or "").replace(",", " ").split():
            if tok.startswith("E0") and len(tok) == 9:
                return tok
        return None

    geog_to_la = {}
    geog_label_by_idx = {}
    for gi, (label, code) in enumerate(geog_items):
        la = resolve_la_code(label, code)
        if la and la.startswith("E0"):
            geog_to_la[gi] = la
            geog_label_by_idx[gi] = label

    # Aggregate
    areas = {}
    for gi, la in geog_to_la.items():
        recent_total = 0.0
        prior_total = 0.0
        nat_recent = {}  # ni → count over recent period
        for ni, (nat_label, nat_code) in enumerate(nat_items):
            if nat_label in ("Total", "All", ""):  # skip aggregate rows
                continue
            for di in recent_dates:
                v = counts.get((gi, ni, di))
                if v:
                    recent_total += v
                    nat_recent[ni] = nat_recent.get(ni, 0) + v
            for di in prior_dates:
                v = counts.get((gi, ni, di))
                if v:
                    prior_total += v

        if recent_total <= 0:
            continue

        # Top nationalities by recent total
        top = sorted(nat_recent.items(), key=lambda kv: kv[1], reverse=True)[:TOP_N_NATIONALITIES]
        by_nationality = []
        for ni, count in top:
            label = nat_items[ni][0]
            share = count / recent_total * 100 if recent_total else 0
            by_nationality.append({
                "nationality": label,
                "count": int(round(count)),
                "sharePct": round(share, 1),
            })

        yoy = None
        if prior_total > 0:
            yoy = (recent_total - prior_total) / prior_total * 100

        areas[la] = {
            "areaName": ep["areas"].get(la, {}).get("areaName") or geog_label_by_idx[gi],
            "totalRollingYear": int(round(recent_total)),
            "yearOnYearChangePct": round(yoy, 1) if yoy is not None else None,
            "byNationality": by_nationality,
            "periodEnd": date_items[recent_dates[-1]][0] if recent_dates else None,
        }

    out = {
        "source": "DWP National Insurance number allocations to adult overseas nationals (Stat-Xplore NINO database).",
        "methodology": "Per-LA NINo registrations summed over the four most-recent quarters in the cube (rolling year). Year-on-year is the rolling-year total vs the four quarters before that. Top nationalities by registrations over the recent rolling year. Counts are rounded to the nearest 10 in the Stat-Xplore output and small cells suppressed.",
        "lastUpdated": "2026-04-28",
        "caveat": "NINo registrations measure new arrivals into the National Insurance system, not total foreign-born population. A NINo is allocated when an overseas national requests one — usually to start work or claim benefits — so the figure misses students and dependants who never enter the labour market. Small (LA × nationality) cells are suppressed by Stat-Xplore for disclosure control.",
        "areas": dict(sorted(areas.items())),
    }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"nino-dashboard.json: {len(areas)} LAs")
    if areas:
        sample_code, sample = next(iter(sorted(areas.items())))
        print(f"  sample: {sample['areaName']} — {sample['totalRollingYear']} registrations, top: "
              + ", ".join(f"{n['nationality']} ({n['count']})" for n in sample['byNationality'][:3]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
