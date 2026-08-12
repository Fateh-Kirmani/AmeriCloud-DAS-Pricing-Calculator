# Materials → Excel Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a green "Export to Excel" button to the Materials page that downloads a 2-sheet `.xlsx` workbook (Consumable, DAS Materials) containing only the currently non-zero-quantity material rows, formatted with bold headers, currency-formatted cost columns, and a bold totals row per sheet.

**Architecture:** A new pure function, `buildMaterialsWorkbook()`, takes the three pieces of data already available in `EstimateContext` (the material catalog, the calculated line results, and the entered quantities) and returns an in-memory `exceljs` `Workbook` — no React, no I/O, fully unit-testable. The Materials page's Export button calls this function on click, serializes the workbook to a `Blob`, and triggers a download via a temporary `<a>` element — generated fresh only on click, never regenerated on every render.

**Tech Stack:** TypeScript, `exceljs` (new dependency), Vitest, React (Next.js App Router client component).

## Global Constraints

- Only two sheets are ever produced: `Consumable` and `DAS Materials` — `BAT Materials` is out of scope (zero items exist in current seed data; this is an accepted, literal reading of the request, not an oversight).
- Only rows with `quantity > 0` are included. A sheet is omitted entirely if it has zero qualifying rows.
- Columns, in order: TYPE, MANUFACTURER / MODEL (joined with `' / '`, omitting either when null — identical logic to the existing on-screen table), DESCRIPTION, UNIT COST, QTY, EXT COST.
- Unit Cost and Ext Cost are real numeric cells with number format `"$"#,##0.00`, not pre-formatted strings.
- Each sheet ends with a bold "Total" row summing that sheet's Ext Cost column.
- Header row is bold with a light-gray fill.
- The workbook is built only inside the Export button's `onClick` handler — never regenerated on every render/keystroke (this is the specific mistake to avoid, already present elsewhere in the PDF export).
- The Export button is disabled (with an explanatory `title` tooltip) when there are zero qualifying rows across both categories.
- No Prisma schema changes, no new data fetching, no changes to the Materials page's existing table/search/category-chip/footer behavior.

---

### Task 1: `excelFileName` helper

**Files:**
- Modify: `package.json` (add `exceljs` dependency)
- Modify: `src/lib/utils/pdfFileName.ts`
- Test: `src/lib/utils/pdfFileName.test.ts`

**Interfaces:**
- Produces: `excelFileName(client: string, project: string): string` — Task 3 imports this to name the downloaded file.

- [ ] **Step 1: Install the new dependency**

Run: `npm install exceljs@^4.4.0`
Expected: `package.json`'s `dependencies` gains an `"exceljs"` entry; `package-lock.json` updates.

- [ ] **Step 2: Write the failing tests**

Add to `src/lib/utils/pdfFileName.test.ts`, after the existing `import` line (currently line 3):

```ts
import { excelFileName } from './pdfFileName';
```

Then add a new `describe` block at the end of the file, after the closing `});` of the existing `describe('pdfFileName', ...)` block (currently line 22):

```ts

describe('excelFileName', () => {
  it('builds a filename from client and project when both are present', () => {
    expect(excelFileName('Acme Corp', 'Downtown Stadium DAS')).toBe('Acme Corp-Downtown Stadium DAS-Estimate.xlsx');
  });

  it('trims whitespace from client and project', () => {
    expect(excelFileName('  Acme Corp  ', '  Stadium  ')).toBe('Acme Corp-Stadium-Estimate.xlsx');
  });

  it('falls back to a date-stamped name when client or project is blank', () => {
    const name = excelFileName('', '');
    expect(name).toMatch(/^Estimate-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it('strips filesystem-unsafe characters from client and project names', () => {
    expect(excelFileName('Acme/Corp', 'Project: "Big" <Job>?')).toBe('AcmeCorp-Project Big Job-Estimate.xlsx');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/utils/pdfFileName.test.ts`
Expected: FAIL — `excelFileName` is not exported from `./pdfFileName`.

- [ ] **Step 4: Implement `excelFileName`**

In `src/lib/utils/pdfFileName.ts`, add this export at the end of the file (after the existing `pdfFileName` function, currently ending at line 16):

```ts

export function excelFileName(client: string, project: string): string {
  const trimmedClient = sanitizeFileNamePart(client.trim());
  const trimmedProject = sanitizeFileNamePart(project.trim());
  if (trimmedClient && trimmedProject) {
    return `${trimmedClient}-${trimmedProject}-Estimate.xlsx`;
  }
  const date = new Date().toISOString().slice(0, 10);
  return `Estimate-${date}.xlsx`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/utils/pdfFileName.test.ts`
Expected: PASS (all 8 tests — 4 existing + 4 new).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/utils/pdfFileName.ts src/lib/utils/pdfFileName.test.ts
git commit -m "feat: add excelFileName helper and exceljs dependency"
```

---

### Task 2: `buildMaterialsWorkbook`

**Files:**
- Create: `src/lib/export/materialsWorkbook.ts`
- Test: `src/lib/export/materialsWorkbook.test.ts`

**Interfaces:**
- Consumes: `MaterialCategory`, `MaterialItem`, `MaterialLineInput`, `MaterialLineResult` from `@/lib/calc` (already-exported types — `MaterialItem` has `key`, `type`, `manufacturer: string | null`, `model: string | null`, `description`, `category`, `unitCost`; `MaterialLineInput` has `key`, `quantity`; `MaterialLineResult` has `key`, `extCost`, `percentOfTotal`).
- Produces: `buildMaterialsWorkbook(materialItems: MaterialItem[], lines: MaterialLineResult[], quantities: MaterialLineInput[]): ExcelJS.Workbook` — Task 3 calls this directly with `referenceData.materialItems`, `result.materials.lines`, and `input.materials`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/export/materialsWorkbook.test.ts`:

```ts
// src/lib/export/materialsWorkbook.test.ts
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildMaterialsWorkbook } from './materialsWorkbook';
import type { MaterialItem, MaterialLineInput, MaterialLineResult } from '@/lib/calc';

const materialItems: MaterialItem[] = [
  { key: 'c-1', type: 'Cable Tie', manufacturer: 'Panduit', model: 'PLT2S-C0', description: 'Cable tie, 8 inch', vendor: 'Anixter', category: 'Consumable', unitCost: 0.1 },
  { key: 'c-2', type: 'Velcro', manufacturer: null, model: null, description: 'Hook and loop strap', vendor: 'Anixter', category: 'Consumable', unitCost: 2.5 },
  { key: 'd-1', type: 'DC Power Plant', manufacturer: 'Vertiv', model: '582137200', description: 'NetSure 5100', vendor: 'Anixter', category: 'DAS Materials', unitCost: 4685 },
  { key: 'b-1', type: 'Battery', manufacturer: 'Vertiv', model: 'BAT-1', description: 'Backup battery', vendor: 'Anixter', category: 'BAT Materials', unitCost: 500 },
];

async function reload(workbook: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const buffer = await workbook.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer);
  return reloaded;
}

describe('buildMaterialsWorkbook', () => {
  it('includes only Consumable and DAS Materials rows with quantity > 0, each ending with a Total row', async () => {
    const lines: MaterialLineResult[] = [
      { key: 'c-1', extCost: 1, percentOfTotal: 0 },
      { key: 'c-2', extCost: 0, percentOfTotal: 0 },
      { key: 'd-1', extCost: 4685, percentOfTotal: 0 },
      { key: 'b-1', extCost: 500, percentOfTotal: 0 },
    ];
    const quantities: MaterialLineInput[] = [
      { key: 'c-1', quantity: 10 },
      { key: 'c-2', quantity: 0 },
      { key: 'd-1', quantity: 1 },
      { key: 'b-1', quantity: 1 },
    ];

    const workbook = buildMaterialsWorkbook(materialItems, lines, quantities);
    const reloaded = await reload(workbook);

    expect(reloaded.worksheets.map((s) => s.name)).toEqual(['Consumable', 'DAS Materials']);

    const consumableSheet = reloaded.getWorksheet('Consumable')!;
    expect(consumableSheet.getRow(1).getCell(1).value).toBe('TYPE');
    expect(consumableSheet.getRow(2).getCell(1).value).toBe('Cable Tie');
    expect(consumableSheet.getRow(2).getCell(6).value).toBe(1);
    // c-2 has quantity 0, so it's excluded — row 3 is the Total row, not a second item row.
    expect(consumableSheet.getRow(3).getCell(1).value).toBe('Total');
    expect(consumableSheet.getRow(3).getCell(6).value).toBe(1);
  });

  it('joins manufacturer and model with a slash, and omits the separator when both are null', async () => {
    const lines: MaterialLineResult[] = [
      { key: 'c-1', extCost: 1, percentOfTotal: 0 },
      { key: 'c-2', extCost: 25, percentOfTotal: 0 },
    ];
    const quantities: MaterialLineInput[] = [
      { key: 'c-1', quantity: 10 },
      { key: 'c-2', quantity: 10 },
    ];

    const workbook = buildMaterialsWorkbook(materialItems, lines, quantities);
    const reloaded = await reload(workbook);
    const sheet = reloaded.getWorksheet('Consumable')!;
    expect(sheet.getRow(2).getCell(2).value).toBe('Panduit / PLT2S-C0');
    expect(sheet.getRow(3).getCell(2).value).toBe('');
  });

  it('applies a currency number format to Unit Cost and Ext Cost cells, and bold to header/total cells', async () => {
    const lines: MaterialLineResult[] = [{ key: 'd-1', extCost: 9370, percentOfTotal: 0 }];
    const quantities: MaterialLineInput[] = [{ key: 'd-1', quantity: 2 }];

    const workbook = buildMaterialsWorkbook(materialItems, lines, quantities);
    const reloaded = await reload(workbook);
    const sheet = reloaded.getWorksheet('DAS Materials')!;

    expect(sheet.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(sheet.getRow(2).getCell(4).numFmt).toBe('"$"#,##0.00');
    expect(sheet.getRow(2).getCell(6).numFmt).toBe('"$"#,##0.00');

    const totalRow = sheet.getRow(3);
    expect(totalRow.getCell(1).value).toBe('Total');
    expect(totalRow.getCell(1).font?.bold).toBe(true);
    expect(totalRow.getCell(6).value).toBe(9370);
    expect(totalRow.getCell(6).numFmt).toBe('"$"#,##0.00');
  });

  it('skips a category sheet entirely when it has zero qualifying rows', async () => {
    const lines: MaterialLineResult[] = [{ key: 'd-1', extCost: 0, percentOfTotal: 0 }];
    const quantities: MaterialLineInput[] = [{ key: 'd-1', quantity: 0 }];

    const workbook = buildMaterialsWorkbook(materialItems, lines, quantities);
    const reloaded = await reload(workbook);
    expect(reloaded.worksheets.map((s) => s.name)).toEqual([]);
  });

  it('never produces a BAT Materials sheet, even when that category has qualifying rows', async () => {
    const lines: MaterialLineResult[] = [{ key: 'b-1', extCost: 500, percentOfTotal: 0 }];
    const quantities: MaterialLineInput[] = [{ key: 'b-1', quantity: 1 }];

    const workbook = buildMaterialsWorkbook(materialItems, lines, quantities);
    const reloaded = await reload(workbook);
    expect(reloaded.worksheets.map((s) => s.name)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/export/materialsWorkbook.test.ts`
Expected: FAIL — `Cannot find module './materialsWorkbook'`.

- [ ] **Step 3: Implement `buildMaterialsWorkbook`**

Create `src/lib/export/materialsWorkbook.ts`:

```ts
// src/lib/export/materialsWorkbook.ts
import ExcelJS from 'exceljs';
import type { MaterialCategory, MaterialItem, MaterialLineInput, MaterialLineResult } from '@/lib/calc';

const EXPORTABLE_CATEGORIES: MaterialCategory[] = ['Consumable', 'DAS Materials'];
const HEADERS = ['TYPE', 'MANUFACTURER / MODEL', 'DESCRIPTION', 'UNIT COST', 'QTY', 'EXT COST'];
const CURRENCY_FORMAT = '"$"#,##0.00';
const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE5E7EB' } };

export function buildMaterialsWorkbook(
  materialItems: MaterialItem[],
  lines: MaterialLineResult[],
  quantities: MaterialLineInput[],
): ExcelJS.Workbook {
  const qtyByKey = new Map(quantities.map((q) => [q.key, q.quantity]));
  const extCostByKey = new Map(lines.map((l) => [l.key, l.extCost]));
  const workbook = new ExcelJS.Workbook();

  for (const category of EXPORTABLE_CATEGORIES) {
    const rows = materialItems.filter(
      (item) => item.category === category && (qtyByKey.get(item.key) ?? 0) > 0,
    );
    if (rows.length === 0) continue;

    const sheet = workbook.addWorksheet(category);
    sheet.columns = [
      { width: 20 },
      { width: 28 },
      { width: 45 },
      { width: 14 },
      { width: 10 },
      { width: 14 },
    ];

    const headerRow = sheet.addRow(HEADERS);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
    });

    let total = 0;
    for (const item of rows) {
      const quantity = qtyByKey.get(item.key) ?? 0;
      const extCost = extCostByKey.get(item.key) ?? 0;
      total += extCost;
      const row = sheet.addRow([
        item.type,
        [item.manufacturer, item.model].filter(Boolean).join(' / '),
        item.description,
        item.unitCost,
        quantity,
        extCost,
      ]);
      row.getCell(4).numFmt = CURRENCY_FORMAT;
      row.getCell(6).numFmt = CURRENCY_FORMAT;
    }

    const totalRow = sheet.addRow(['Total', '', '', '', '', total]);
    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
    });
    totalRow.getCell(6).numFmt = CURRENCY_FORMAT;
  }

  return workbook;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/export/materialsWorkbook.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/materialsWorkbook.ts src/lib/export/materialsWorkbook.test.ts
git commit -m "feat: add buildMaterialsWorkbook for Excel export"
```

---

### Task 3: Wire the Export button into the Materials page

**Files:**
- Modify: `src/app/(estimator)/materials/page.tsx`

**Interfaces:**
- Consumes: `buildMaterialsWorkbook` (Task 2), `excelFileName` (Task 1), `coverInfo` from `useEstimate()` (already provided by `EstimateContext` — used the same way in `src/app/(estimator)/summary/page.tsx:46`).

- [ ] **Step 1: Add the imports**

In `src/app/(estimator)/materials/page.tsx`, after line 10 (`import type { MaterialCategory } from '@/lib/calc';`), add:

```tsx
import { buildMaterialsWorkbook } from '@/lib/export/materialsWorkbook';
import { excelFileName } from '@/lib/utils/pdfFileName';
```

- [ ] **Step 2: Pull `coverInfo` out of the context and compute whether any row qualifies**

Replace line 19:

```tsx
  const { referenceData, input, result, setMaterialQuantity, setContingencyPct, setShippingHandling } = useEstimate();
```

with:

```tsx
  const { referenceData, input, result, setMaterialQuantity, setContingencyPct, setShippingHandling, coverInfo } = useEstimate();
```

Then, immediately after line 28 (`);` closing the `presentCategories` assignment), add:

```tsx
  const hasExportableRows = referenceData.materialItems.some(
    (item) =>
      (item.category === 'Consumable' || item.category === 'DAS Materials') &&
      (qtyByKey.get(item.key) ?? 0) > 0,
  );

  async function handleExport() {
    const workbook = buildMaterialsWorkbook(referenceData.materialItems, result.materials.lines, input.materials);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = excelFileName(coverInfo.client, coverInfo.project);
    link.click();
    URL.revokeObjectURL(url);
  }
```

- [ ] **Step 3: Add the button next to the category chips**

Replace the chips container (currently lines 34-45):

```tsx
        <div className="flex flex-wrap items-center gap-2">
          {presentCategories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => scrollToCategory(category)}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-slate hover:border-navy hover:text-navy transition-colors"
            >
              {category}
            </button>
          ))}
        </div>
```

with:

```tsx
        <div className="flex flex-wrap items-center gap-2">
          {presentCategories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => scrollToCategory(category)}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-slate hover:border-navy hover:text-navy transition-colors"
            >
              {category}
            </button>
          ))}
          <button
            type="button"
            onClick={handleExport}
            disabled={!hasExportableRows}
            title={hasExportableRows ? undefined : 'Set a quantity on at least one material to export'}
            className="rounded bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1.5 transition-colors"
          >
            Export to Excel
          </button>
        </div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manually verify in the browser**

Run: `PORT=4000 npm run dev` (ports 3000/3001 are excluded by Windows on this machine — see prior session notes), then in a browser:
1. Navigate to `http://localhost:4000/materials` with a fresh/empty estimate. Confirm the "Export to Excel" button is disabled and its tooltip explains why.
2. Set a quantity on at least one Consumable item and one DAS Materials item. Confirm the button becomes enabled.
3. Click it. Confirm a `.xlsx` file downloads (named `Estimate-YYYY-MM-DD.xlsx` if Cover Info's client/project are blank, or `<Client>-<Project>-Estimate.xlsx` otherwise). Open it and confirm: two sheets named exactly `Consumable` and `DAS Materials`, bold header row, currency-formatted Unit Cost/Ext Cost columns, only the rows you set a quantity on, and a bold Total row at the bottom of each sheet summing that sheet's Ext Cost.
4. Zero out every quantity again. Confirm the button becomes disabled again.
5. Set a quantity on only a Consumable item (leave all DAS Materials at 0). Export again and confirm the downloaded workbook has only a `Consumable` sheet — no empty `DAS Materials` sheet.

- [ ] **Step 6: Run the full test suite, type-check, and build**

Run: `npx vitest run`
Expected: all tests pass (previous count plus the 9 new tests from Tasks 1-2).

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds, same route count as before (this task adds no new route).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(estimator)/materials/page.tsx"
git commit -m "feat: add Export to Excel button to the Materials page"
```
