import { countyAuditInputs, validateCountyAudit } from '../lib/county-audit.mjs';
try {
  const result = validateCountyAudit(countyAuditInputs());
  console.log(`County audit passed: ${result.counties} counties, ${result.censusComparisons} census comparisons, ${result.populationComparisons} population comparisons. Published county rows and reviewed differences verified exactly.`);
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}
