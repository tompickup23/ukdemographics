# Research: Normalize refugee funding instruction tables (UK resettlement, Afghan, HfU)

Generated: 2026-04-07
Project: asylum_stats

### **Research Brief: Normalize Refugee Funding Instruction Tables (UK Resettlement, Afghan, HfU)**
**Priority: H (High)**
**Project: Asylum Stats**

---

#### **Key Findings**
1. **Current Gaps in Funding Normalization**
   - The `money-ledger` (`src/data/live/money-ledger.json`) lacks structured normalization for refugee funding instructions (UK Resettlement, Afghan, Homes for Ukraine (HfU)).
   - No clear schema for categorizing funding rows by scheme (e.g., Afghan Citizens Resettlement Scheme (ACRS), UK Resettlement Scheme (UKRS), HfU).
   - **File Reference**:
     - `data/canonical/money_ledger/` (raw NDJSON)
     - `src/data/live/money-ledger.json` (live output)

2. **Missing Data Sources**
   - No direct mapping of Home Office funding instructions to local authority allocations.
   - **Relevant Files**:
     - `docs/research/data-sources.md` (lists official sources but lacks granularity).
     - `docs/product/follow-migrants-follow-money.md` (high-level money-layer design).

3. **Transform Scripts Need Updating**
   - Current transform scripts (`scripts/transform/transform-money-ledger.mjs`) do not normalize funding instructions.
   - **File Reference**:
     - `/opt/asylumstats/scripts/transform/transform-money-ledger.mjs`

4. **Schema Gaps**
   - No formal schema for funding instructions in `schemas/`.
   - **Missing Schema**:
     - `schemas/money_ledger/funding_instructions.json` (proposed).

---

#### **Next Steps**
1. **Define Funding Instruction Schema**
   - Create a new schema for refugee funding instructions:
     ```bash
     mkdir -p schemas/money_ledger/funding_instructions
     touch schemas/money_ledger/funding_instructions/schema.json
     ```
   - **Proposed Fields**:
     - `scheme` (UKRS/ACRS/HfU)
     - `instruction_type` (e.g., "capital grant", "recurring support")
     - `recipient` (local authority, NGO, etc.)
     - `amount_gbp` (if available)
     - `source_url` (link to Home Office instruction)
     - `date_issued`

2. **Update Transform Script**
   - Modify `scripts/transform/transform-money-ledger.mjs` to parse and normalize funding instructions from raw data.
   - **Example Command**:
     ```bash
     node scripts/transform/transform-money-ledger.mjs --normalize-funding
     ```
   - **Output**:
     - `data/canonical/money_ledger/funding_instructions.ndjson`
     - Update `src/data/live/money-ledger.json` to include normalized rows.

3. **Source New Funding Data**
   - **Primary Sources**:
     - [Home Office Asylum Support Funding Instructions](https://www.gov.uk/government/publications/asylum-support-funding)
     - [UK Resettlement Scheme (UKRS) Funding](https://www.gov.uk/government/publications/uk-resettlement-scheme)
     - [Afghan Citizens Resettlement Scheme (ACRS) Funding](https://www.gov.uk/government/publications/afghan-citizens-resettlement-scheme)
     - [Homes for Ukraine (HfU) Funding](https://www.gov.uk/guidance/homes-for-ukraine-scheme-funding)
   - **Action**:
     - Download XLSX/CSV files from the above links and place in `data/raw/funding/`.
     - Add parsing logic to `transform-money-ledger.mjs`.

4. **Update Money Ledger Mart**
   - Regenerate the money ledger mart:
     ```bash
     npm run build:marts
     ```
   - Verify output in `src/data/live/money-ledger.json`.

5. **Add Funding Pages to Site**
   - Create a new page (`src/pages/funding/index.astro`) to display normalized funding instructions.
   - Use `src/components/DataDrawer.astro` for interactive filtering.

---

#### **Resources**
- **Data Sources**:
  - [Home Office Asylum Support Funding](https://www.gov.uk/government/publications/asylum-support-funding)
  - [UK Resettlement Scheme](https://www.gov.uk/government/publications/uk-resettlement-scheme)
  - [ACRS Funding](https://www.gov.uk/government/publications/afghan-citizens-resettlement-scheme)
  - [HfU Funding](https://www.gov.uk/guidance/homes-for-ukraine-scheme-funding)
- **Tools**:
  - `ndjson-cli` (for processing NDJSON files):
    ```bash
    npm install -g ndjson-cli
    ```
  - `jq` (for JSON manipulation):
    ```bash
    sudo apt-get install jq
    ```

---
#### **Risks/Blockers**
1. **Lack of Granular Funding Data**
   - Home Office may not publish local authority-level funding breakdowns.
   - **Mitigation**: Use Freedom of Information (FOI) requests or cross-reference with local authority budgets.

2. **Schema Overlap**
   - Funding instructions may overlap with existing `money-ledger` rows.
   - **Mitigation**: Add a `funding_instruction_id` field to deduplicate.

3. **Data Licensing**
   - Ensure all sources are publicly reusable (check GOV.UK licensing).
   - **Action**: Add license notes in `docs/research/data-sources.md`.

---
**Next Review**: After schema definition and initial transform script update.