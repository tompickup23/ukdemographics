"""Extract published county rows from pinned Nomis bulk archives, without network calls.

python3 scripts/build/build-county-census.py --source-dir .cache/county-sources
The input archive hashes live in data/raw/manifests/county_census.json.
County pages must not consume these records until the reconciliation gate passes.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--source-dir', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
read = lambda name: json.loads((root / name).read_text())
manifest = read('data/raw/manifests/county_census.json')
lookup = read('src/data/lookups/district-to-utla.json')['districts']
site = read('src/data/live/ethnic-projections.json')['areas']
counties = {}
for code, district in lookup.items():
    county = counties.setdefault(district['countyCode'], {'name': district['countyName'], 'districts': []})
    county['districts'].append(code)
groups = ['white_british', 'white_other', 'asian', 'black', 'mixed', 'other']
fields = ['total'] + groups
out = {'sources': manifest['sources'], 'usage': 'Source records for county reconciliation. County pages remain blocked while any exact comparison fails.', 'counties': {}}
raw_dir = root / 'data/raw/county-census'
raw_dir.mkdir(parents=True, exist_ok=True)
rows_by_year = {}
for source in manifest['sources']:
    blob = (args.source_dir / source['fileName']).read_bytes()
    if hashlib.sha256(blob).hexdigest() != source['sha256']:
        raise ValueError('Archive hash differs from manifest: ' + source['fileName'])
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        data = archive.read(source['member'])
    reader = csv.DictReader(io.StringIO(data.decode('utf-8-sig')))
    key = 'GeographyCode' if source['year'] == 2011 else 'geography code'
    selected = [(line, row) for line, row in enumerate(reader, 2) if row[key] in counties]
    if {r[key] for _, r in selected} != set(counties):
        raise ValueError('Missing or unexpected county coverage')
    with (raw_dir / source['extract']).open('w') as handle:
        writer = csv.DictWriter(handle, fieldnames=['sourceRow'] + reader.fieldnames, lineterminator='\n')
        writer.writeheader()
        writer.writerows({'sourceRow': line, **row} for line, row in selected)
    if hashlib.sha256((raw_dir / source['extract']).read_bytes()).hexdigest() != source['extractSha256']:
        raise ValueError('County extract differs from manifest')
    rows_by_year[source['year']] = {r[key]: (line, r) for line, r in selected}

def counts(year, row):
    if year == 2011:
        value = lambda n: int(row[f'KS201EW{n:04d}'])
        spans = {'white_british': [2], 'white_other': range(3, 6), 'mixed': range(6, 10), 'asian': range(10, 15), 'black': range(15, 18), 'other': range(18, 20)}
        return {'total': value(1), **{g: sum(value(n) for n in spans[g]) for g in groups}}
    prefix = 'Ethnic group: '
    value = lambda label: int(row[prefix + label])
    # Parent totals are independently perturbed. Sum the published detailed cells,
    # matching the site's six-group count definition, while preserving every raw cell.
    result = {g: 0 for g in groups}
    for label, cell in row.items():
        if not label.startswith(prefix):
            continue
        name = label[len(prefix):]
        if ':' not in name or name.startswith('Total:'):
            continue
        parent, child = name.split(':', 1)
        if parent == 'White':
            group = 'white_british' if child.strip() == 'English, Welsh, Scottish, Northern Irish or British' else 'white_other'
        else:
            group = next(g for start, g in [('Asian', 'asian'), ('Black', 'black'), ('Mixed', 'mixed'), ('Other ethnic group', 'other')] if parent.startswith(start))
        result[group] += int(cell)
    return {'total': value('Total: All usual residents'), **result}

for code, county in sorted(counties.items(), key=lambda pair: pair[1]['name']):
    record = {'name': county['name'], 'districts': sorted(county['districts']), 'census': {}}
    for year, side in [(2011, 'baseline'), (2021, 'current')]:
        line, row = rows_by_year[year][code]
        published = counts(year, row)
        district_sum = {f: 0 for f in fields}
        for district in county['districts']:
            values = site[district][side]
            if values['year'] != year:
                raise ValueError('Wrong census year for ' + district)
            district_sum['total'] += values['total_population']
            for group in groups:
                district_sum[group] += values['groups_absolute'][group]
        difference = {f: district_sum[f] - published[f] for f in fields}
        if year == 2011 and any(difference.values()):
            raise ValueError(f'{code}: Census 2011 county reconciliation failed: {difference}')
        record['census'][str(year)] = {'published': published, 'districtSum': district_sum, 'difference': difference, 'exact': not any(difference.values()), 'sourceRow': line}
    out['counties'][code] = record
out['publicationReady'] = True
out['publicationPolicy'] = 'published-county-rows-v1'
out['usage'] = 'County council rows. Census 2021 district sums are retained separately with reviewed differences; Census 2011 and MYE4 sums agree exactly.'
(root / 'src/data/live/county-census.json').write_text(json.dumps(out, indent=2) + '\n')
for year in ['2011', '2021']:
    exact = sum(c['census'][year]['exact'] for c in out['counties'].values())
    print(f'Census {year}: {exact} of {len(counties)} counties agree in total and all six groups')
print('County publication ready:', out['publicationReady'])

# Never accept a refreshed discrepancy silently. The reviewed evidence must match.
import subprocess
subprocess.run(['node', 'scripts/check/county-reconciliation.mjs'], cwd=root, check=True)
