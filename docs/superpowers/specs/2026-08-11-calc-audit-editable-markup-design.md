# Calculation Engine Correctness Audit + Editable Mark-Up % — Design

## Context

This is sub-project B of a larger set of requested changes (the others — multi-project support and a Materials Excel export — are tracked separately). The user raised two concerns:

1. A specific labor derived-quantity relationship ("Labeling for splitter" should reflect "Install combiner/splitter") appeared broken.
2. "Mark-Up %" on the Executive Summary page doesn't factor into the PGM Grand Total or Grand Total to Bid, and should be editable.

The request also asked for a full audit of the source `DAS Construction Bidding Workbook.xlsx` against the app's current calculation engine, not just these two specific items.

## Audit Findings

Every sheet in the source workbook was checked for derived-quantity formulas (cells that compute a quantity from another task's quantity, as opposed to plain manual-input cells) and cross-checked against the app's current data/calc engine:

- **LOE Sheet**: 8 derived-quantity formulas exist (`Labeling Coax and Category Cable`, `Labeling for splitter`, `Test Category Cable (per Drop)`, `Sweep Test per line`, `Labeling Fiber`, `Labeling Fiber Housing`, `Labeling DAS Equipment`, `Labeling for Grounding`). All 8 are already correctly captured in `prisma/seed-data/labor-tasks.json` and the live database, exactly matching the Excel formulas — including "Labeling for splitter" `= Install combiner/splitters × 4` (confirmed live in the running app: entering `1` for "Install combiner/splitters" correctly produces `4.00` for "Labeling for splitter"). **No fix needed here.** The original report's expectation of a 1:1 ratio doesn't match the workbook itself, which uses ×4.
- **Additional SOW's, Bill of Materials, Pass Throughs**: zero derived-quantity formulas in any of these sheets. All quantity-like inputs are manual in the source workbook, matching the app's current behavior. **No fix needed.**
- **Executive Summary → Grand Total to Bid chain**: every formula from `Total Direct Cost` through `Total Labor to Bid` / `Total Material to Bid` / `Grand Total to Bid` (tax-exempt and tax-included) was traced cell-by-cell against `src/lib/calc/executiveSummary.ts`. All match exactly. **No fix needed.**
- **The one real gap**: the workbook has two markup-percentage display rows in the Projected Gross Margins section — "Mark-Up%" (pre-tweak, row 25) and "Mark-Up% Post Tweak" (row 30). Both are computed *display* values in the original workbook with zero downstream effect on any total — confirmed by checking that no other formula in the sheet references either cell. The app currently shows only the pre-tweak one, and it is read-only. The workbook's actual mechanism for adjusting the total is the separate dollar-denominated "Tweak for Margin Target," which the app already implements correctly.

Given this, editable Mark-Up % is a **new capability** the source workbook never had, not a bug fix — the design below covers exactly what "editable" should mean, since there's no existing formula to copy.

## Design: Editable Pre-Tweak and Post-Tweak Mark-Up %

### Pre-Tweak Mark-Up % (existing row, becomes editable)

- Displayed value is unchanged: `(Total Direct Cost / Total Direct Cost Break-Even) − 1` — matches workbook row 25 exactly.
- Editing this field sets `laborMarkupPct = passThroughMarkupPct = materialMarkupPct = <entered value>`, i.e. all three category markup rates become equal to the typed percentage.
- Why this works exactly: `Total Direct Cost` is the sum of three category costs, each multiplied by `(1 + its own markup rate)`. When all three rates equal a single value `m`, `Total Direct Cost = Total Direct Cost Break-Even × (1 + m)` exactly, so the blended percentage `(Total Direct Cost / Break-Even) − 1` reduces to exactly `m`. This is an exact, not approximate, back-solve.
- This intentionally overwrites any pre-existing difference between the three category rates (e.g. if material markup was previously set lower than labor markup). Confirmed acceptable — the user chose this over a proportional-scaling alternative that would have preserved relative differences at the cost of producing untidy per-category numbers.

### Post-Tweak Mark-Up % (new row, matching workbook row 30 — currently absent from the UI)

- Added to the Projected Gross Margins section, near "Tweak for Margin Target ($)" and "PGM Grand Total."
- Displayed value: `(PGM Grand Total / Total Direct Cost Break-Even) − 1`.
- Editing this field back-solves the dollar tweak: `marginTweak = (entered% + 1) × Total Direct Cost Break-Even − Total Direct Cost`, then calls the existing `setMarkups({ marginTweak })`.
- This field and the existing "Tweak for Margin Target ($)" input both read from and write to the same underlying `marginTweak` value — editing either one updates the other to match.

### Edge case

If `Total Direct Cost Break-Even` is `$0` (no line items entered yet — an empty estimate), editing either percentage field is a no-op: there's nothing to meaningfully back-solve against, so the edit is silently ignored rather than producing a division-by-zero or a nonsensical result. This mirrors the workbook's own `IF(K23, ..., 0)` guard pattern used throughout the Executive Summary sheet.

### What does NOT change

- No Prisma schema changes. `laborMarkupPct`, `passThroughMarkupPct`, `materialMarkupPct`, and `marginTweak` already exist on `MarkupInputs`.
- No changes to `src/lib/calc/executiveSummary.ts` — `projectedGrossMarginTotal`, `totalDirectCost`, and `totalDirectCostBreakEven` are already computed and returned; this is new UI-level read/write logic layered on top of existing state setters (`setMarkups`).
- No changes anywhere in the Labor page, seed data, or Bill of Materials / Pass Throughs calculations — the audit confirmed these are already correct.

## Testing

- Unit tests for the two new back-solve helper functions (pre-tweak → three equal rates; post-tweak → marginTweak), covering the exact-math case and the `$0` break-even no-op case.
- A component/integration-level check that editing one of the paired fields (% vs $ tweak) updates the other to a matching value.
