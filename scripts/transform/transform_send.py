#!/usr/bin/env python3
"""
DfE "Special educational needs in England" (statistics API) -> src/data/live/send-dashboard.json.

Reads the newest edition held in data/raw/dfe_sen/, found by stable stem
(scripts/lib/newest_release.py), as stored by scripts/fetch/fetch-dfe-sen.mjs. The edition,
publication date, periods, filter labels and every figure come from those stored API
responses. Nothing about a release is typed here.

What each figure counts:
  ehcpPupils         pupils with an education, health and care (EHC) plan on the January
                     school census, all schools (state-funded, independent and
                     non-maintained special, including hospital schools). DfE "Pupils in all
                     schools, by type of SEN provision".
  ehcpPctOfPupils    DfE's own "Percentage of pupils": pupils with an EHC plan as a share of
                     all pupils on roll in those schools. Replaces ehcpRatePer10k, which
                     divided the same count by the whole Census 2021 population of every
                     age, a denominator DfE does not use.
  fiveYearGrowthPct  change in ehcpPupils over five academic years, same table.
  primaryNeeds,      pupils with an EHC plan by primary type of need, as a share of all
  asdPrevalencePct   pupils with an EHC plan in the same table. That table covers
                     state-funded and non-maintained special schools only, so its base is
                     smaller than ehcpPupils. asdPrevalencePct is the autism share of EHC
                     plans, not a prevalence in the population.

SEND is an upper-tier service. Areas are DfE's 153 local authorities: unitaries,
metropolitan districts, London boroughs and the 21 counties. District pages show their
county's figures through src/lib/area-hierarchy.ts.

    python3 scripts/transform/transform_send.py
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))
from newest_release import newest_release  # noqa: E402

RAW = ROOT / "data/raw/dfe_sen"
MANIFEST = ROOT / "data/raw/manifests/dfe_sen.json"
OUT = ROOT / "src/data/live/send-dashboard.json"
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
          "September", "October", "November", "December"]
LANDING = "https://explore-education-statistics.service.gov.uk/find-statistics/special-educational-needs-in-england"


def fail(msg: str):
    raise SystemExit(f"transform_send: {msg}")


def load(stem: str):
    path = newest_release(RAW, stem, exts=(".json",), by="year")
    raw = path.read_bytes()
    return path, hashlib.sha256(raw).hexdigest(), json.loads(raw)


class Meta:
    """Decode the API's short ids by label text, failing on anything unknown."""

    def __init__(self, meta: dict):
        self.filters = {f["label"]: f for f in meta["filters"]}
        self.option_label = {o["id"]: o["label"] for f in meta["filters"] for o in f["options"]}
        self.indicators = {i["label"]: i["id"] for i in meta["indicators"]}
        self.locations = {o["id"]: {**o, "level": loc["level"]["code"]}
                          for loc in meta["locations"] for o in loc["options"]}
        self.periods = {t["period"]: t["label"] for t in meta["timePeriods"]}

    def filter_id(self, label: str) -> str:
        if label not in self.filters:
            fail(f"metadata has no filter {label!r}")
        return self.filters[label]["id"]

    def indicator(self, label: str) -> str:
        if label not in self.indicators:
            fail(f"metadata has no indicator {label!r}")
        return self.indicators[label]

    def option(self, result: dict, filter_label: str) -> str:
        oid = result["filters"].get(self.filter_id(filter_label))
        if oid not in self.option_label:
            fail(f"result carries unknown option {oid!r} for {filter_label!r}")
        return self.option_label[oid]

    def place(self, result: dict) -> dict:
        level = result["geographicLevel"]
        loc = self.locations.get(result["locations"].get(level))
        if not loc:
            fail(f"result carries an unknown {level} location")
        return loc


def count(v) -> int | None:
    """DfE suppression and not-applicable markers become None, never zero."""
    try:
        return int(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def pct(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def main() -> None:
    _, ds_sha, ds_list = load("sen-api-datasets_")
    _, pm_sha, prov_meta_raw = load("sen-api-provision-meta_")
    prov_path, prov_sha, prov = load("sen-api-provision_")
    _, nm_sha, need_meta_raw = load("sen-api-need-meta_")
    need_path, need_sha, need = load("sen-api-need_")

    manifest = json.loads(MANIFEST.read_text())
    held = {a.get("blob_sha256") for a in manifest["attempts"]}
    for name, sha in [("data set list", ds_sha), ("provision metadata", pm_sha), ("provision query", prov_sha),
                      ("need metadata", nm_sha), ("need query", need_sha)]:
        if sha not in held:
            fail(f"the {name} on disk (sha256 {sha}) is not in {MANIFEST.name}; fetch it with fetch-dfe-sen.mjs")
    for res, label in [(prov, "provision"), (need, "need")]:
        if res.get("warnings"):
            fail(f"{label} query returned warnings: {res['warnings']}")
        if res["paging"]["totalPages"] != 1:
            fail(f"{label} query is not a single page")

    pm, nm = Meta(prov_meta_raw), Meta(need_meta_raw)

    # Data set titles, versions and publication date, from the stored list.
    def data_set(title_start: str) -> dict:
        hits = [d for d in ds_list["results"] if d["title"].startswith(title_start)]
        if len(hits) != 1:
            fail(f"expected one data set starting {title_start!r}")
        return hits[0]
    prov_ds = data_set("Pupils in all schools, by type of SEN provision")
    need_ds = data_set("Ethnicity by type of SEN provision and type of need")
    published = max(prov_ds["latestVersion"]["published"], need_ds["latestVersion"]["published"])[:10]

    # Provision: headcount and percentage by LA, provision and year.
    head_id, pct_id = pm.indicator("Headcount of pupils"), pm.indicator("Percentage of pupils")
    by = {}
    periods = set()
    for r in prov["results"]:
        for label in ("Hospital school flag", "Phase type of school", "School type (detailed)"):
            if pm.option(r, label) != "Total":
                fail(f"provision row is not the {label} total")
        loc = pm.place(r)
        period = r["timePeriod"]["period"]
        periods.add(period)
        provision = pm.option(r, "Pupil SEN provision")
        by[(loc["code"], period, provision)] = (loc, count(r["values"].get(head_id)), pct(r["values"].get(pct_id)))
    if len(periods) != 2:
        fail(f"provision query returned periods {sorted(periods)}, expected two")
    then, now = sorted(periods)
    now_label, then_label = pm.periods[now], pm.periods[then]
    if int(now[:4]) - int(then[:4]) != 5:
        fail(f"growth periods {then_label} and {now_label} are not five years apart")

    # Primary need among pupils with an EHC plan, latest year.
    need_count_id = nm.indicator("Count of pupils")
    needs = {}
    for r in need["results"]:
        if r["timePeriod"]["period"] != now:
            fail(f"need row for {r['timePeriod']['period']}, expected {now}")
        for label, want in (("Phase type of school", "Total"), ("Pupil major ethnicity breakdown", "Total"),
                            ("Pupil minor ethnicity breakdown", "Total"),
                            ("SEN provision", "Education, health and care plan")):
            if nm.option(r, label) != want:
                fail(f"need row is not {label} = {want}")
        loc = nm.place(r)
        needs.setdefault(loc["code"], {})[nm.option(r, "Primary type of need")] = count(r["values"].get(need_count_id))

    def need_profile(code: str):
        nd = needs.get(code) or {}
        total = nd.get("Total")
        if not total:
            return [], None
        shares = sorted(((k, v) for k, v in nd.items() if k != "Total" and v is not None),
                        key=lambda kv: -kv[1])
        top = [{"need": k, "pct": round(v / total * 100, 1)} for k, v in shares[:6]]
        asd = nd.get("Autistic spectrum disorder")
        return top, (round(asd / total * 100, 1) if asd is not None else None)

    def profile(code: str):
        loc, ehcp, ehcp_pct = by.get((code, now, "Education, health and care plan"), (None, None, None))
        if loc is None or ehcp is None:
            return None
        _, prior, _ = by.get((code, then, "Education, health and care plan"), (None, None, None))
        _, pupils, _ = by.get((code, now, "Total"), (None, None, None))
        top, asd = need_profile(code)
        return {
            "areaName": loc["label"],
            "ehcpPupils": ehcp,
            "ehcpPctOfPupils": round(ehcp_pct, 1) if ehcp_pct is not None else None,
            "pupilsOnRoll": pupils,
            "fiveYearGrowthPct": round((ehcp - prior) / prior * 100, 1) if prior else None,
            "ehcpPupilsFiveYearsEarlier": prior,
            "asdPrevalencePct": asd,
            "primaryNeeds": top,
            "primaryNeedBase": (needs.get(code) or {}).get("Total"),
            "period": f"{now_label} academic year",
        }

    la_codes = sorted({code for (code, period, _), (loc, _, _) in by.items() if loc["level"] == "LA" and period == now})
    areas = {}
    for code in la_codes:
        p = profile(code)
        if p:
            areas[code] = p
    nat_codes = {code for (code, _, _), (loc, _, _) in by.items() if loc["level"] == "NAT"}
    if len(nat_codes) != 1:
        fail("expected one national location")
    england = profile(nat_codes.pop())

    pub_title = "Special educational needs in England"
    published_text = f"{int(published[8:10])} {MONTHS[int(published[5:7]) - 1]} {published[:4]}"
    out = {
        # Rendered on place pages, so it describes the two data sets rather than quoting
        # their titles, which carry spaced hyphens. The verbatim titles are in dataSets.
        "source": (
            f"DfE, {pub_title}, academic year {now_label}, published {published_text}, Explore Education "
            "Statistics: pupils in all schools by type of SEN provision, and pupils with an EHC plan by "
            "primary type of need"
        ),
        "dataSets": [
            {"title": d["title"], "id": d["id"], "version": d["latestVersion"]["version"],
             "published": d["latestVersion"]["published"]}
            for d in (prov_ds, need_ds)
        ],
        "sourceUrl": LANDING,
        "lastUpdated": published,
        "edition": now_label,
        "growthBasePeriod": then_label,
        "files": {
            "provision": {"fileName": prov_path.name, "fileSha256": prov_sha, "dataSetId": prov_ds["id"]},
            "need": {"fileName": need_path.name, "fileSha256": need_sha, "dataSetId": need_ds["id"]},
        },
        "methodology": (
            f"Pupils with an EHC plan and DfE's percentage of pupils, all schools, {now_label}, from the "
            f"provision data set (school type, phase and hospital school totals). Five-year growth compares "
            f"{now_label} with {then_label} in the same data set. Primary need is the share of pupils with an "
            "EHC plan in each primary type of need, from the ethnicity data set at its ethnicity and phase "
            "totals, which covers state-funded and non-maintained special schools only."
        ),
        "caveat": (
            "SEND is run by upper-tier councils, so district pages show their county. Figures count pupils on "
            "the January school census who have an EHC plan; plans held by children under school age, young "
            "people in further education and those not in school are not included. The autism figure is the "
            "share of pupils with an EHC plan whose primary need is autism, not a prevalence in the population. "
            "Rising numbers may reflect identification, diagnosis and parental awareness as well as need."
        ),
        "england": england,
        "areas": areas,
    }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(areas)} local authorities, {now_label} (growth from {then_label}), published {published}")
    if england:
        print(f"  England: {england['ehcpPupils']:,} pupils with an EHC plan, {england['ehcpPctOfPupils']}% of pupils, "
              f"growth {england['fiveYearGrowthPct']}%, autism share {england['asdPrevalencePct']}%")


if __name__ == "__main__":
    main()
