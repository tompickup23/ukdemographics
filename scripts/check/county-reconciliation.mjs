import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync('src/data/live/county-census.json', 'utf8'));
const failures = [];
for (const county of Object.values(data.counties)) {
  for (const [year, row] of Object.entries(county.census)) {
    const differences = Object.entries(row.difference).filter(([, value]) => value !== 0);
    if (differences.length) failures.push(`${county.name}, ${year}: ${differences.map(([field, value]) => `${field} ${value > 0 ? '+' : ''}${value}`).join(', ')}`);
  }
}
if (failures.length) {
  console.error('County publication blocked. District sum minus published county count:');
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('All county census counts agree exactly.');
}
