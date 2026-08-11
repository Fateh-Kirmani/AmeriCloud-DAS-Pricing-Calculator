# Editable Mark-Up % (Pre-Tweak and Post-Tweak) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Executive Summary page's "Mark-Up %" row editable (back-solving the three category markup rates), and add a new editable "Mark-Up % Post Tweak" row (back-solving the existing `marginTweak` dollar field) — matching workbook rows 25 and 30, both currently display-only (row 30 is entirely absent from the UI).

**Architecture:** Two pure, unit-tested back-solve helper functions in a new `src/lib/calc/markupBackSolve.ts` (calc-engine layer, no React) compute new `MarkupInputs` values from a typed-in percentage. The Summary page wires both percent fields to controlled `<input>`s that call the helpers and feed results into the existing `setMarkups()` context setter. The post-tweak percent's *displayed* value is a one-line derived ratio computed locally in the page component (`projectedGrossMarginTotal / totalDirectCostBreakEven − 1`), matching the page's existing convention of computing simple display-only ratios inline (e.g. the venue $/sqft metric) rather than adding a new field to the calc engine's return type.

**Tech Stack:** TypeScript, Vitest, React (Next.js App Router client component), existing `EstimateContext` / `setMarkups`.

## Global Constraints

- No Prisma schema changes. `laborMarkupPct`, `passThroughMarkupPct`, `materialMarkupPct`, `marginTweak` already exist on `MarkupInputs` (`src/lib/calc/types.ts:180-187`).
- No changes to `src/lib/calc/executiveSummary.ts` — `projectedGrossMarginTotal`, `totalDirectCost`, and `totalDirectCostBreakEven` are already computed and returned; the post-tweak percent is new UI-level display logic layered on top of existing fields, not a new calc-engine field.
- No changes to the Labor page, seed data, Bill of Materials, or Pass Throughs calculations — confirmed correct by the audit in `docs/superpowers/specs/2026-08-11-calc-audit-editable-markup-design.md`.
- Pre-Tweak Mark-Up % edit: setting the typed percent `m` sets `laborMarkupPct = passThroughMarkupPct = materialMarkupPct = m` exactly (all three category rates become equal). This is an intentional overwrite of any pre-existing per-category differences — confirmed acceptable with the user.
- Post-Tweak Mark-Up % edit: back-solves `marginTweak = (entered% + 1) × totalDirectCostBreakEven − totalDirectCost`. This field and the existing "Tweak for Margin Target ($)" input both read/write the same `marginTweak` value.
- Edge case: if `totalDirectCostBreakEven` is `0`, editing either percent field must be a no-op (do not call `setMarkups` at all) rather than dividing by zero or writing `NaN`/`Infinity`.
- Displayed value of Pre-Tweak Mark-Up % stays `(totalDirectCost / totalDirectCostBreakEven) − 1` (unchanged, from `es.markupPercent`). Displayed value of the new Post-Tweak Mark-Up % is `(projectedGrossMarginTotal / totalDirectCostBreakEven) − 1`, computed locally in the page.

---

### Task 1: Back-solve helper functions

**Files:**
- Create: `src/lib/calc/markupBackSolve.ts`
- Test: `src/lib/calc/markupBackSolve.test.ts`

**Interfaces:**
- Consumes: `calculateExecutiveSummary` from `./executiveSummary` (round-trip test only), `LaborResult`/`CrewPlanResult`/`PassThroughResult`/`MaterialResult` from `./types` (round-trip test fixtures only).
- Produces:
  - `backSolveCategoryMarkupsFromPreTweakPercent(enteredPercent: number, totalDirectCostBreakEven: number): { laborMarkupPct: number; passThroughMarkupPct: number; materialMarkupPct: number } | null`
  - `backSolveMarginTweakFromPostTweakPercent(enteredPercent: number, totalDirectCostBreakEven: number, totalDirectCost: number): number | null`
  - Both return `null` when `totalDirectCostBreakEven === 0` (no-op signal). Tasks 2/3 check for `null`/non-null before calling `setMarkups`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/calc/markupBackSolve.test.ts`:

```ts
// src/lib/calc/markupBackSolve.test.ts
import { describe, it, expect } from 'vitest';
import {
  backSolveCategoryMarkupsFromPreTweakPercent,
  backSolveMarginTweakFromPostTweakPercent,
} from './markupBackSolve';
import { calculateExecutiveSummary } from './executiveSummary';
import type { LaborResult, CrewPlanResult, PassThroughResult, MaterialResult } from './types';

describe('backSolveCategoryMarkupsFromPreTweakPercent', () => {
  it('sets all three category markup rates equal to the entered percent', () => {
    const result = backSolveCategoryMarkupsFromPreTweakPercent(0.3, 100000);
    expect(result).toEqual({
      laborMarkupPct: 0.3,
      passThroughMarkupPct: 0.3,
      materialMarkupPct: 0.3,
    });
  });

  it('returns null (no-op) when break-even is $0', () => {
    const result = backSolveCategoryMarkupsFromPreTweakPercent(0.3, 0);
    expect(result).toBeNull();
  });
});

describe('backSolveMarginTweakFromPostTweakPercent', () => {
  it('back-solves the dollar tweak from a target post-tweak percent', () => {
    // breakEven = 100000, totalDirectCost = 125000 (25% pre-tweak markup already applied).
    // Target post-tweak percent = 30% -> PGM Grand Total should be 130000 -> tweak = 5000.
    const result = backSolveMarginTweakFromPostTweakPercent(0.3, 100000, 125000);
    expect(result).toBeCloseTo(5000, 6);
  });

  it('returns null (no-op) when break-even is $0', () => {
    const result = backSolveMarginTweakFromPostTweakPercent(0.3, 0, 0);
    expect(result).toBeNull();
  });
});

describe('markup back-solve round trip through calculateExecutiveSummary', () => {
  const labor: LaborResult = { taskResults: [], categorySubtotals: [], roleTotals: [], grandHours: 1000, grandCost: 85000 };
  const crewPlan: CrewPlanResult = {
    totalHoursInProject: 1000, stagingHours: 50, totalProjectTime: 1050,
    manDays: 131.25, manWeeks: 26.25, calendarDays: 32.8125, calendarWeeks: 6.5625,
    cmsNeeded: 2, totalCmHours: 525, averageOpsLaborRate: 85,
    opsAdminLaborByRole: [
      { role: 'Construction Manager', hours: 262.5, cost: 262.5 * 95 },
      { role: 'Project Manager', hours: 131.25, cost: 131.25 * 100 },
      { role: 'Project Coordinator', hours: 78.75, cost: 78.75 * 55 },
    ],
    opsAdminLaborTotal: { hours: 472.5, cost: 262.5 * 95 + 131.25 * 100 + 78.75 * 55 },
  };
  const passThroughs: PassThroughResult = {
    perDiemTotal: 2000, lodgingTotal: 4800, travelTotal: 2040, travelHours: 24,
    airfareTotal: 1000, rentalsTotal: 3600, softCostsTotal: 4500,
    grandTotal: 2000 + 4800 + 2040 + 1000 + 3600 + 4500,
  };
  const materials: MaterialResult = {
    lines: [],
    categoryTotals: [
      { category: 'Consumable', total: 500 },
      { category: 'DAS Materials', total: 40000 },
      { category: 'BAT Materials', total: 0 },
    ],
    contingency: 4050,
    shippingHandling: 200,
    hardwareTotal: 500 + 40000 + 0 + 4050 + 200,
  };
  const settings = {
    hoursPerManDay: 8, hoursPerManWeek: 40, stagingMaterialMultiplier: 0.05,
    cmPercentOfTechHours: 0.5, pmPercentOfTechHours: 0.25, coordinatorPercentOfTechHours: 0.15,
  };
  const baseMarkups = {
    laborMarkupPct: 0.1, passThroughMarkupPct: 0.4, materialMarkupPct: 0.2,
    corporateMarkupPct: 0.05, marginTweak: 0, taxRate: 0.0825,
  };

  it('editing the pre-tweak percent produces a result whose displayed pre-tweak percent matches exactly', () => {
    const rates = backSolveCategoryMarkupsFromPreTweakPercent(0.22, 999999);
    expect(rates).not.toBeNull();
    const updatedMarkups = { ...baseMarkups, ...rates! };
    const result = calculateExecutiveSummary(labor, crewPlan, passThroughs, materials, settings, updatedMarkups);
    expect(result.markupPercent).toBeCloseTo(0.22, 6);
  });

  it('editing the post-tweak percent produces a PGM Grand Total whose implied post-tweak percent matches, and the dollar tweak agrees', () => {
    const base = calculateExecutiveSummary(labor, crewPlan, passThroughs, materials, settings, baseMarkups);
    const tweak = backSolveMarginTweakFromPostTweakPercent(0.35, base.totalDirectCostBreakEven, base.totalDirectCost);
    expect(tweak).not.toBeNull();
    const updatedMarkups = { ...baseMarkups, marginTweak: tweak! };
    const result = calculateExecutiveSummary(labor, crewPlan, passThroughs, materials, settings, updatedMarkups);
    const impliedPostTweakPercent = result.projectedGrossMarginTotal / result.totalDirectCostBreakEven - 1;
    expect(impliedPostTweakPercent).toBeCloseTo(0.35, 6);
    expect(result.projectedGrossMarginTotal).toBeCloseTo(base.totalDirectCostBreakEven * 1.35, 6);
  });
});
```

This round-trip suite is the "component/integration-level check that editing one of the paired fields updates the other" called for in the design spec's Testing section, implemented at the pure-function level (helper → `calculateExecutiveSummary` → assert the implied displayed value matches) rather than as a DOM-rendering test — the Summary page's `BlobProvider`/`@react-pdf/renderer` dynamic import makes full-page rendering in `jsdom` its own separate concern, not needed to prove this specific behavior.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/calc/markupBackSolve.test.ts`
Expected: FAIL — `Cannot find module './markupBackSolve'`.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/calc/markupBackSolve.ts`:

```ts
// src/lib/calc/markupBackSolve.ts

export function backSolveCategoryMarkupsFromPreTweakPercent(
  enteredPercent: number,
  totalDirectCostBreakEven: number,
): { laborMarkupPct: number; passThroughMarkupPct: number; materialMarkupPct: number } | null {
  if (totalDirectCostBreakEven === 0) return null;
  return {
    laborMarkupPct: enteredPercent,
    passThroughMarkupPct: enteredPercent,
    materialMarkupPct: enteredPercent,
  };
}

export function backSolveMarginTweakFromPostTweakPercent(
  enteredPercent: number,
  totalDirectCostBreakEven: number,
  totalDirectCost: number,
): number | null {
  if (totalDirectCostBreakEven === 0) return null;
  return (enteredPercent + 1) * totalDirectCostBreakEven - totalDirectCost;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/calc/markupBackSolve.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/calc/markupBackSolve.ts src/lib/calc/markupBackSolve.test.ts
git commit -m "feat: add markup percent back-solve helpers"
```

---

### Task 2: Make Pre-Tweak Mark-Up % editable on the Summary page

**Files:**
- Modify: `src/app/(estimator)/summary/page.tsx:1-11` (imports), `:109` (the existing `Mark-Up %` row)

**Interfaces:**
- Consumes: `backSolveCategoryMarkupsFromPreTweakPercent` (Task 1), `parseNumericInput` from `@/lib/utils/parseNumericInput` (already imported at line 8), `setMarkups` from `useEstimate()` (already destructured at line 46), `es.markupPercent` / `es.totalDirectCostBreakEven` (already available via `result.executiveSummary`).

- [ ] **Step 1: Add the import**

In `src/app/(estimator)/summary/page.tsx`, after line 8 (`import { parseNumericInput } from '@/lib/utils/parseNumericInput';`), add:

```tsx
import { backSolveCategoryMarkupsFromPreTweakPercent } from '@/lib/calc/markupBackSolve';
```

- [ ] **Step 2: Replace the read-only row with an editable one**

Replace line 109:

```tsx
        <Row label="Mark-Up %" value={`${(es.markupPercent * 100).toFixed(1)}%`} />
```

with:

```tsx
        <label className="flex justify-between items-center py-1">
          <span className="text-sm text-slate">Mark-Up %</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              className="w-20 border border-line rounded px-2 py-1 text-right"
              value={(es.markupPercent * 100).toFixed(1)}
              onChange={(e) => {
                const rates = backSolveCategoryMarkupsFromPreTweakPercent(
                  parseNumericInput(e.target.value) / 100,
                  es.totalDirectCostBreakEven,
                );
                if (rates) setMarkups(rates);
              }}
            />
            <span className="text-sm text-slate">%</span>
          </div>
        </label>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manually verify in the browser**

Run: `PORT=4000 npm run dev` (ports 3000/3001 are excluded by Windows on this machine — see prior session notes), then in a browser:
1. Navigate to `http://localhost:4000`, enter some materials/labor/pass-throughs so `Total Direct Cost Break-Even` is non-zero.
2. Go to the Executive Summary page. Note the current "Mark-Up %" value.
3. Type `30` into the "Mark-Up %" field.
4. Confirm: "Gross Margin %" and "PGM Grand Total" recompute immediately, and the field itself redisplays `30.0` after the change settles.
5. With an empty estimate (Total Direct Cost Break-Even = $0), confirm typing into the field does not throw and does not change any other value (no-op).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(estimator)/summary/page.tsx"
git commit -m "feat: make pre-tweak Mark-Up % editable on the Executive Summary page"
```

---

### Task 3: Add editable Post-Tweak Mark-Up % row

**Files:**
- Modify: `src/app/(estimator)/summary/page.tsx:1-11` (imports), `:46-47` (local derived value), `:111-119` (insert new row between the `$` tweak input and the `PGM Grand Total` row)

**Interfaces:**
- Consumes: `backSolveMarginTweakFromPostTweakPercent` (Task 1), `es.projectedGrossMarginTotal`, `es.totalDirectCostBreakEven`, `es.totalDirectCost`, `setMarkups`, `Term` component (already imported at line 11).
- Produces: a local `markupPercentPostTweak` value in `SummaryPage`, computed the same way `venueSqft`'s derived metric is computed inline in this same component — not a new calc-engine field.

- [ ] **Step 1: Update the import**

In `src/app/(estimator)/summary/page.tsx`, change the import added in Task 2 to import both helpers together:

```tsx
import {
  backSolveCategoryMarkupsFromPreTweakPercent,
  backSolveMarginTweakFromPostTweakPercent,
} from '@/lib/calc/markupBackSolve';
```

- [ ] **Step 2: Add the local derived value**

In `SummaryPage`, immediately after line 47 (`const es = result.executiveSummary;`), add:

```tsx
  const markupPercentPostTweak = es.totalDirectCostBreakEven
    ? es.projectedGrossMarginTotal / es.totalDirectCostBreakEven - 1
    : 0;
```

- [ ] **Step 3: Insert the new row**

After the existing "Tweak for Margin Target ($)" `<label>` block (currently lines 111-119, ending with `</label>`) and before the `PGM Grand Total` `<Row>` (currently starting at line 120), insert:

```tsx
        <label className="flex justify-between items-center py-1">
          <span className="text-sm text-slate">
            <Term definition="The Mark-Up % after your manual margin tweak is applied — reflects the PGM Grand Total instead of the pre-tweak Total Direct Cost">
              Mark-Up % Post Tweak
            </Term>
          </span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              className="w-20 border border-line rounded px-2 py-1 text-right"
              value={(markupPercentPostTweak * 100).toFixed(1)}
              onChange={(e) => {
                const tweak = backSolveMarginTweakFromPostTweakPercent(
                  parseNumericInput(e.target.value) / 100,
                  es.totalDirectCostBreakEven,
                  es.totalDirectCost,
                );
                if (tweak !== null) setMarkups({ marginTweak: tweak });
              }}
            />
            <span className="text-sm text-slate">%</span>
          </div>
        </label>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manually verify the paired-field sync in the browser**

With the dev server running and a non-empty estimate open on the Executive Summary page:
1. Type `10000` into "Tweak for Margin Target ($)". Confirm "Mark-Up % Post Tweak" immediately updates to `(PGM Grand Total / Break-Even) − 1` for the new PGM Grand Total.
2. Clear that and instead type a percent (e.g. `40`) into "Mark-Up % Post Tweak". Confirm "Tweak for Margin Target ($)" updates to the equivalent dollar amount, and "PGM Grand Total" matches `Break-Even × 1.40`.
3. With an empty estimate (Break-Even = $0), confirm typing into "Mark-Up % Post Tweak" is a no-op.

- [ ] **Step 6: Run the full test suite and build**

Run: `npx vitest run`
Expected: all tests pass (previous count plus the 6 new tests from Task 1).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(estimator)/summary/page.tsx"
git commit -m "feat: add editable post-tweak Mark-Up % row to the Executive Summary page"
```
