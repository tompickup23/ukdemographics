# Research: Add published value / tariff rate / forecast / derived estimate split

Generated: 2026-04-07
Project: asylum_stats

**Research Brief: Add Published Value / Tariff Rate / Forecast / Derived Estimate Split**
*Project: Asylum Stats | Priority: M*

---

### **Key Findings**
1. **Current Gaps**:
   - The `money-ledger` (live at `src/data/live/money-ledger.json`) lacks **published tariff rates**, **forecasts**, or **derived estimates** for asylum support, resettlement schemes, or hotel costs. Existing rows focus on **actual spending** (e.g., GBP values) but omit **unit costs** or **future projections**.
   - The `data-sources.md` file confirms no single clean UK regional asylum spending dataset exists. **Tariff rates** (e.g., per-person weekly costs) are likely buried in:
     - Home Office **immigration statistics** (e.g., [Asylum Support](https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas)).
     - **RASI quarterly tables** (operational series with cost breakdowns).
     - **Local authority contracts** (manual ledgers in `data/manual/`).

2. **Relevant Code**:
   - Transform scripts (`scripts/transform/transform-money-ledger.mjs`) normalize spending rows but **do not parse tariff rates**.
   - The `money-explorer.ts` and `money-data.ts` files (in `src/lib/`) handle ledger queries but lack **tariff-specific logic**.

3. **Opportunities**:
   - **Hotels**: The `hotel_entities` layer (`src/data/live/hotel-entity-ledger.json`) could include **per-bed tariffs** (e.g., from contractor invoices or FOI requests).
   - **Schemes**: Afghan resettlement, UK resettlement, and Homes for Ukraine likely have **published unit costs** in Home Office releases.

---

### **Next Steps**
#### **1. Identify Tariff Sources**
- **Action**: Search Home Office releases for "tariff," "unit cost," or "per person" in asylum support/hotels.
  - **URLs**:
    - [Asylum Support Stats](https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas) (check "Costs" tables).
    - [RASI Quarterly Data](https://www.gov.uk/government/collections/immigration-statistics-quarterly-release) (search for "hotel costs").
  - **Command**:
    ```bash
    cd /opt/asylumstats
    grep -r "tariff\|unit cost\|per person" data/raw/  # Search downloaded files.
    ```

#### **2. Extend Money Ledger Schema**
- **File**: `schemas/money-ledger.schema.json`
  - **Action**: Add fields for `tariff_rate`, `forecast`, and `derived_estimate` (type: `number | null`).
  - **Example**:
    ```json
    {
      "type": "object",
      "properties": {
        "tariff_rate": { "type": "number", "description": "Published weekly per-person cost (GBP)" },
        "forecast": { "type": "number", "description": "Projected annual cost (GBP)" },
        "derived_estimate": { "type": "number", "description": "Calculated from local authority data (GBP)" }
      }
    }
    ```

#### **3. Update Transform Script**
- **File**: `scripts/transform/transform-money-ledger.mjs`
  - **Action**: Parse tariff rates from source files (e.g., XLSX/CSV) and map to `tariff_rate`.
  - **Example Logic**:
    ```javascript
    // Pseudocode: Extract tariff from RASI table.
    const tariffRow = rawData.find(row => row["Metric"] === "Weekly Asylum Support Tariff");
    canonicalRow.tariff_rate = tariffRow ? parseFloat(tariffRow["GBP"]) : null;
    ```

#### **4. Add UI Components**
- **Files**:
  - `src/components/KpiCard.astro` (extend to show tariff rates).
  - `src/pages/spending/[id].astro` (new detail page for tariff/forecast splits).
- **Action**: Create a "Tariff & Forecast" tab in the spending ledger UI.

#### **5. Test & Validate**
- **Command**:
  ```bash
  npm run build  # Verify NDJSON outputs in data/canonical/money-ledger/.
  npm run preview  # Check Astro site for new fields.
  ```

---
### **Resources**
- **Home Office Data**:
  - [Immigration System Statistics](https://www.gov.uk/government/collections/immigration-system-statistics)
  - [FOI Requests](https://www.whatdotheyknow.com/) (search for "asylum support tariff").
- **Tools**:
  - `xlsx` library for parsing Excel files (install via `npm install xlsx`).
  - `jq` for JSON manipulation:
    ```bash
    jq '.[] | select(.tariff_rate != null)' src/data/live/money-ledger.json
    ```

---
### **Risks/Blockers**
1. **Data Scarcity**: Tariff rates may not be published. **Mitigation**: Use FOI requests or derive from local authority contracts (`data/manual/`).
2. **Schema Drift**: Adding new fields may break existing components. **Mitigation**: Update `schemas/` and test incrementally.
3. **Performance**: Large tariff datasets could slow down `money-ledger.json`. **Mitigation**: Filter tariffs to only active schemes (e.g., Afghan resettlement).