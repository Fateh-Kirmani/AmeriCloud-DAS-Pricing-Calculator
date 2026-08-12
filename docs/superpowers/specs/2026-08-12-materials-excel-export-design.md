# Materials → Excel Export — Design

## Context

This is sub-project C of a larger three-part request from the user (the others — a calc-engine correctness audit + editable Mark-Up %, and multi-project support — are tracked separately; sub-project B is complete, this is next in the user's confirmed order B → C → A). The user's request, verbatim:

> "for Materials tab specifically there should be a Export to Excel green button that exports only materials that we have selected (the ones who's quantity isn't 0) in the form of two sheets in Excel one being Consumable and the other being DAS Materials and the materials themselves in a formatted table complete with headings i.e TYPE, MANUFACTURER / MODEL, DESCRIPTION, UNIT COST, QTY, and EXT COST."

## Scope Confirmation

The app's `MaterialCategory` type has three values (`Consumable`, `DAS Materials`, `BAT Materials`), but the current seed data (`prisma/seed-data/material-items.json`) has zero `BAT Materials` items (62 `DAS Materials`, 22 `Consumable`). This matches the user's literal request of exactly two sheets. If `BAT Materials` items are ever added later via the Admin area, they will not appear in this export — that's an explicit, accepted scope boundary, not an oversight.

## Data & Scope

On button click, build the export from three already-available client-side sources (no new data fetching):
- `referenceData.materialItems` — filtered to `category === 'Consumable'` or `category === 'DAS Materials'`
- `input.materials` — to find each item's `quantity`; only rows with `quantity > 0` are included
- `result.materials.lines` — to find each qualifying row's `extCost`

Row order follows `referenceData.materialItems`' existing order (the same order already shown on the Materials page) — no re-sorting. A category sheet is skipped entirely if it has zero qualifying rows (e.g., an estimate with no `DAS Materials` items selected produces a workbook with only a `Consumable` sheet).

Columns, in order, with these exact header labels:

| Header | Source |
|---|---|
| TYPE | `item.type` |
| MANUFACTURER / MODEL | `[item.manufacturer, item.model].filter(Boolean).join(' / ')` — identical logic to the existing on-screen table (`src/app/(estimator)/materials/page.tsx:101`) |
| DESCRIPTION | `item.description` |
| UNIT COST | `item.unitCost` (numeric cell, currency-formatted) |
| QTY | `quantity` (numeric cell) |
| EXT COST | `line.extCost` (numeric cell, currency-formatted) |

## Workbook Structure & Styling

Built with `exceljs` (new dependency — chosen over `xlsx`/SheetJS specifically because current SheetJS Community Edition releases have dropped most cell-styling support behind their paid Pro tier, and this feature explicitly asks for a "formatted table," not just a data dump; the known SheetJS security advisories are about *parsing* untrusted files and don't bear on this choice since this feature only ever *writes* the app's own generated data).

Per sheet (`Consumable`, `DAS Materials`):
- Row 1: header row, bold font, light-gray fill, matching the column list above
- One row per qualifying material line, in catalog order
- Unit Cost and Ext Cost cells use a real Excel number format (`"$"#,##0.00`) on numeric cell values — not pre-formatted strings — so a recipient can total/recompute in Excel
- Column widths sized so header text and typical description lengths aren't truncated
- Final row: bold **Total** row, with "Total" in the TYPE column and a `SUM` (or pre-computed sum, see Testing) of that sheet's EXT COST column, currency-formatted

Sheet names are exactly `Consumable` and `DAS Materials`.

## UI

A green "Export to Excel" button placed next to the existing category filter chips at the top of `src/app/(estimator)/materials/page.tsx` (near the `presentCategories.map(...)` chip row).

- **Disabled state:** when there are zero qualifying rows (quantity > 0) across both categories, the button is disabled with a `title` tooltip explaining why (e.g. "Set a quantity on at least one material to export"). This avoids downloading a useless empty file.
- **Generation timing:** the workbook is built and downloaded synchronously inside the button's `onClick` handler — built fresh only on click, not regenerated on every render/keystroke. This deliberately avoids the PDF export's known flaw (`BlobProvider` regenerating on every summary-page keystroke, noted as deferred technical debt in `CLAUDE.md`).
- **Download mechanism:** `workbook.xlsx.writeBuffer()` → wrap in a `Blob` with the correct `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` MIME type → create a temporary `<a>` element with `download={excelFileName(...)}` → `.click()` → revoke the object URL. Same "generate a blob, trigger a download" shape already used for PDF export, but imperative (click-triggered) rather than a persistently-rendered `BlobProvider`.

## File Naming

`src/lib/utils/pdfFileName.ts` gains a sibling export, `excelFileName(client: string, project: string): string`, reusing the file's existing (already-correct) `sanitizeFileNamePart` helper. Same shape as `pdfFileName`: `${client}-${project}-Estimate.xlsx` when both are present, else `Estimate-${date}.xlsx`. This is a small, directly-relevant addition to code the feature already needs — not a broader refactor of that file.

## What Does NOT Change

- No Prisma schema changes, no new data fetching — everything needed is already in `EstimateContext`'s `referenceData`/`input`/`result`.
- No changes to the Materials page's existing table, search, category chips, or contingency/S&H footer.
- `BAT Materials` is out of scope per the Scope Confirmation section above.

## Testing

- Unit tests for a new pure function, `buildMaterialsWorkbook(materialItems: MaterialItem[], lines: MaterialLineResult[], quantities: MaterialLineInput[]): ExcelJS.Workbook`, covering:
  - Filters out zero-quantity and not-yet-quantified rows
  - Skips a category sheet entirely when it has zero qualifying rows
  - Correct header row, cell values, and number formats
  - Correct bold Total row summing Ext Cost
  - Reads back cell values/styles via `exceljs`'s own workbook reader (round-trip through `writeBuffer`/`load`) rather than asserting on internal object shape, so the tests exercise the actual serialized file
- Unit tests for `excelFileName`, mirroring the existing `pdfFileName.test.ts` coverage (client+project present, one/both missing, unsafe characters stripped).
- No new integration/browser test infra is introduced beyond what Sub-project B already established (manual browser verification via the dev server, since download-triggering `<a>.click()` behavior isn't meaningfully unit-testable in `jsdom`).
