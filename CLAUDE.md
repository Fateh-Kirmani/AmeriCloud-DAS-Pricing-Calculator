# DAS Construction Bidding Estimator — Project Notes

## What this is

A web app that ports the `DAS Construction Bidding Workbook.xlsx` spreadsheet into a Next.js application: select materials/equipment, estimate labor, add pass-through expenses, and get an Executive Summary with pricing, margins, and a Grand Total to Bid — matching the workbook's calculations exactly. Built for AmeriCloud Telecom (design follows their brand colors/fonts, see below).

Source of truth for requirements: `docs/superpowers/specs/2026-07-21-das-bid-estimator-webapp-design.md`.

## Tech Stack

- **Framework:** Next.js 14 (App Router) + TypeScript, deployed on Vercel
- **Styling:** Tailwind CSS, themed to AmeriCloud brand tokens (extracted from americloudtelecom.com's shipped CSS): navy `#0f1e42`/`#0a1530`/`#16284f`, red `#d8202b`/`#b5121d`, slate `#48566f`/`#64748b`, mist `#f4f6fa`/`#eef1f7`; fonts Archivo (display) + Manrope (body)
- **Database:** Postgres via Prisma ORM (Neon/Vercel Postgres in production; a local Docker Postgres container is used for dev — see below)
- **Testing:** Vitest
- **PDF export (planned):** `@react-pdf/renderer`, client-side, no server round-trip
- **One-time data conversion:** Python 3 + `openpyxl`, converts the source `.xlsx` into `prisma/seed-data/*.json` (checked into the repo) — avoids hand-transcribing ~200 catalog/labor rows

## Local dev database

A local Postgres 16 container provides `DATABASE_URL` for development (see `.env`, gitignored):
```
docker run -d --name das-estimator-postgres -e POSTGRES_USER=das -e POSTGRES_PASSWORD=das -e POSTGRES_DB=das_estimator -p 5433:5432 postgres:16-alpine
```
If the container isn't running: `docker start das-estimator-postgres` (Docker Desktop must be running first — on Windows, launch `C:\Program Files\Docker\Docker\Docker Desktop.exe` if needed).

`.env.example` documents the shape; copy to `.env` and adjust before running `npx prisma migrate dev` or `npm run seed`.

## Status: Foundation & Calculation Engine — COMPLETE (merged to master)

Plan: `docs/superpowers/plans/2026-07-21-foundation-calc-engine.md` (includes a "Plan Amendments" section documenting decisions made mid-implementation — read it before touching the calc engine or schema).

Delivered:
- Next.js/TypeScript/Tailwind scaffold with the brand theme
- Prisma schema + migrations for all reference data (material catalog, labor tasks, labor rates, crew-size table, pass-through rates, estimate defaults)
- `scripts/xlsx_to_seed.py` — converts the workbook to `prisma/seed-data/*.json`; `prisma/seed.ts` loads it into Postgres
- A fully unit-tested, framework-free calculation engine (`src/lib/calc/`) reproducing the workbook's math: `calculateMaterials`, `calculateLabor`, `calculateCrewPlan`, `calculatePassThroughs`, `calculateExecutiveSummary`, orchestrated by `buildEstimateResult()` — 32/32 tests passing, `tsc --noEmit` clean

Notable correctness findings made and fixed during this phase (see the plan's "Plan Amendments" section for full detail):
- Labor roles have TWO distinct hourly rates in the source workbook — a billing rate and a raw wage — which differ specifically for RF-Engineer ($100 billing vs $75 raw wage). LOE/SOW task costs use billing rate; Pass Throughs' Travel section uses raw wage. Both are carried through the schema (`LaborRate.hourlyRate` / `.rawWageRate`) and the engine.
- The workbook's own "Net Profit $$" and "Break-Even" panel formulas have apparent copy-paste bugs (reference pre-corporate-markup figures instead of post-markup ones). Per explicit user decision, this port computes the economically-consistent version instead of replicating the bug — this does **not** affect the Grand Total to Bid chain, which is traced and reproduced exactly.
- `LaborProjectionSettings` and `EstimateDefaults` use a fixed `id: 'singleton'` (not `cuid()`) for deterministic upserts, since each holds exactly one row.

## Status: Estimating Workflow UI — COMPLETE (merged to master)

Plan: `docs/superpowers/plans/2026-07-22-estimating-workflow-ui.md` (amended mid-implementation to record the `BlobProvider`/`PDFDownloadLink` decision below — read its "Plan Amendments" for full detail).

Delivered, built as 9 sequential tasks (each independently task-reviewed, then a final whole-branch review on all 9 together):
- Cover Info (landing page), Materials, Labor (LOE + Additional SOW's + Crew Planner), Pass Throughs, and Executive Summary pages, all reading/writing one shared `EstimateInput` via `EstimateContext` — every displayed number (page bodies, sticky summary strip, PDF) derives from a single `buildEstimateResult(input, referenceData)` memo, so there's no duplicated math or state drift between pages
- Collapsible sidebar nav + sticky summary strip app shell
- Client-side PDF export via `@react-pdf/renderer`
- Both Plan 1 follow-ups closed: a real-seed-data integration test through `buildEstimateResult()`, and an explicitly validated `derivedFromJson` (Prisma `Json?`) → `LaborTaskDerivation` round-trip in the Prisma-to-`ReferenceData` loader
- Verified: `tsc --noEmit` clean, 54/54 tests passing (14 files), `npm run build` succeeds (8 routes)

Notable finding from the final whole-branch review (architectural, not a bug — read before starting Plan 3):
- `src/app/layout.tsx` fetches reference data in an `async` Server Component with no `dynamic`/`revalidate` export, so `npm run build` **prerenders all routes as fully static**, with the material/labor catalog baked into the RSC payload at build time. This is fine for Plan 2's read-only scope, but once Plan 3's Admin Area lets users edit reference data, those edits will **not** appear on the estimating pages until a full redeploy. Add `export const dynamic = 'force-dynamic'` (or a `revalidate` value) to `src/app/layout.tsx` when Plan 3 lands, before wiring up any admin CRUD screens.

Deferred (Minor, non-blocking, noted for future polish): PDF generation (`BlobProvider`) regenerates on every summary-page keystroke instead of gating behind the Export click; `pdfFileName.ts` doesn't sanitize filesystem-unsafe characters from client/project names; `Number(e.target.value)` produces `NaN` on empty/partial numeric input across several pages (a shared `parseNumericInput` helper would close this in one place); `EstimateContext`'s value/setters aren't memoized (confirmed low blast radius at the current one-page-per-route structure, revisit if that changes).

## Status: Admin Area — COMPLETE (merged to master)

Plan: `docs/superpowers/plans/2026-07-22-admin-area.md`.

Delivered, built as 7 sequential tasks (each independently task-reviewed, then a final whole-branch review):
- Password-gated `/admin` area (shared session cookie, no per-user accounts) with CRUD screens for the material catalog, labor task library, labor rates + crew-size table + projection settings, pass-through rate defaults (role rates, rentals, soft costs), and estimate defaults (markup/tax)
- Applied the Plan 2 whole-branch review's static-data note: `src/app/layout.tsx` now has `export const dynamic = 'force-dynamic'`, so admin edits reach the estimating pages without a redeploy
- Shared `AdminTable` component driving all 5 CRUD sections
- Every mutating Server Action revalidates the root layout (`revalidatePath('/', 'layout')`) and `next.config.mjs` sets `experimental.staleTimes.dynamic = 0`, so edits are fresh on soft (sidebar `<Link>`) navigation, not just hard reloads — Next 14.2's client Router Cache otherwise serves stale pricing/markup data for up to 30s
- Verified: `tsc --noEmit` clean, 101/101 tests passing (22 files, `vitest.config.ts` sets `fileParallelism: false` since integration tests share one real local Postgres), `npm run build` succeeds (15 routes, all correctly dynamic)

Notable finding from the final whole-branch review, fixed before merge:
- Authentication was enforced only in `src/middleware.ts` via pathname matching. Server Actions dispatch via an encrypted `next-action` header independent of pathname matching, so every mutating action trusted the gate without checking itself — a matcher typo or future route/rewrite could have silently stripped authorization from all admin mutations. Fixed by adding `requireAdminSession()` (`src/lib/auth/adminAuth.ts`) as the first statement of all 17 mutating Server Actions across the 5 admin sections; verified end-to-end via a captured-and-replayed Server Action request (blocked with no cookie, succeeds with a valid session).

Deferred (Minor, non-blocking): `src/lib/auth/adminAuth.ts` top-level-imports `next/headers`, now reached transitively by the Edge `middleware.ts` — confirmed non-breaking on Next 14.2.35 but undoes Task 1's deliberate edge-clean isolation; splitting `requireAdminSession()` into its own module would restore it. Non-constant-time password comparison and a static non-expiring session cookie (no rotation) — an accepted tradeoff for a single shared internal password, revisit if this ever protects more than internal pricing. `deleteMaterial`/`deleteRental`/`deleteSoftCost` and the singleton updates don't catch Prisma P2025 (record-not-found). `ActionResult`/`ValidationErr`/`parseNonNegative`/`parsePercent` helpers are redefined per-file across the 5 admin action files rather than shared. Markup percent fields are hard-capped at 100% — confirm with the stakeholder this is always correct for construction markups.

## Status: Deployment — COMPLETE

The app is live in production on Vercel, backed by Prisma Postgres (pooled `DATABASE_URL` for runtime, direct `DIRECT_URL` for migrations/CLI — see the `datasource db` block in `prisma/schema.prisma`). GitHub repo: `MintCookies04/AmeriCloud-DAS-Pricing-Calculator`, default/production branch `main`.

## Status: Calculation Audit + Editable Mark-Up % — COMPLETE (merged to main)

Spec: `docs/superpowers/specs/2026-08-11-calc-audit-editable-markup-design.md`. Plan: `docs/superpowers/plans/2026-08-11-editable-markup-percentage.md`.

This was sub-project B of a larger three-part request from the user (the other two — a Materials-page Excel export, and multi-project support with a landing page/Admin-password removal — are tracked below under "What to do next", in the user's confirmed order: B then C then A).

- Audited every sheet of `DAS Construction Bidding Workbook.xlsx` against the app's calc engine and seed data. Found the app's existing Coax "Labeling for splitter" derivation (`× 4` of "Install combiner/splitter") and the full Grand-Total-to-Bid chain in `src/lib/calc/executiveSummary.ts` were **already correct** — the user's two reported "bugs" were not bugs. The one real gap: the workbook's "Mark-Up%" (pre-tweak) and "Mark-Up% Post Tweak" rows were both display-only in the original workbook with zero downstream effect, and the post-tweak row was entirely missing from the UI.
- Added `src/lib/calc/markupBackSolve.ts` — two pure, unit-tested helpers (`backSolveCategoryMarkupsFromPreTweakPercent`, `backSolveMarginTweakFromPostTweakPercent`) that back-solve `MarkupInputs` from a typed-in percentage, each returning `null` as a no-op when `totalDirectCostBreakEven` is `$0`.
- Made "Mark-Up %" editable on the Executive Summary page (sets `laborMarkupPct = passThroughMarkupPct = materialMarkupPct` to the typed value) and added a new editable "Mark-Up % Post Tweak" row that reads/writes the same `marginTweak` as the existing "Tweak for Margin Target ($)" field — the post-tweak percent itself is a one-line derived value computed inline in `summary/page.tsx`, not a new calc-engine field, per the spec's explicit "no changes to `executiveSummary.ts`" constraint.
- Verified: 119/119 tests passing (24 files), `tsc --noEmit` clean, `npm run build` succeeds (16 routes), and the paired-field sync ($ tweak ↔ post-tweak %) and both $0-break-even no-op cases were confirmed live in-browser via Playwright.

## Status: Materials → Excel Export — COMPLETE (merged to main)

Spec: `docs/superpowers/specs/2026-08-12-materials-excel-export-design.md`. Plan: `docs/superpowers/plans/2026-08-12-materials-excel-export.md`.

This was sub-project C of the same three-part request as above (B is done; A — multi-project support — remains, see "What to do next").

- Added a green "Export to Excel" button to the Materials page. Building block: `src/lib/export/materialsWorkbook.ts`'s pure `buildMaterialsWorkbook(materialItems, lines, quantities)`, unit-tested by round-tripping through `exceljs`'s own `writeBuffer`/`load` rather than asserting on internal object shape.
- Only `Consumable` and `DAS Materials` sheets are ever produced (currently the only two categories with seed data — `BAT Materials` is an accepted, explicit scope boundary, not an oversight), each containing only `quantity > 0` rows, with a bold header row, a `"$"#,##0.00` number format on Unit Cost/Ext Cost, and a bold "Total" row summing Ext Cost. A sheet is omitted entirely if it has zero qualifying rows. The button is disabled with an explanatory tooltip when nothing qualifies across both categories.
- `src/lib/utils/pdfFileName.ts` gained a sibling `excelFileName()` export reusing its existing `sanitizeFileNamePart` helper.
- `exceljs` is dynamically imported (`await import('@/lib/export/materialsWorkbook')`) inside the click handler, not statically at module scope — mirrors the existing PDF export's dynamic import and keeps the ~255 kB library out of the Materials page's base bundle (confirmed via `npm run build`: `/materials` stayed at ~2.8 kB / 102 kB First Load JS instead of ballooning to 258 kB / 357 kB).
- Verified: 128/128 tests passing (25 files), `tsc --noEmit` clean, `npm run build` succeeds (16 routes), and the actual downloaded `.xlsx` file's sheets/headers/values/formatting were inspected directly (via a Node script reading the file with `exceljs`) after driving the button through a live browser with Playwright — not just DOM assertions.
- `exceljs`'s dependency tree adds one **moderate** transitive `npm audit` finding (an old `uuid` with a buffer-bounds bug that requires a caller-supplied buffer, which `exceljs` never does — it's internal-only ID generation). Not fixed, and deliberately not run through `npm audit fix --force`, which would downgrade `exceljs` to an ancient 3.x release and bump `next` 14→16 — both far outside this task's scope. The remaining high/critical `npm audit` findings (`next`, `postcss`, `esbuild`/`vite`) predate this work entirely.

## Status: Multi-Project Support — IN PROGRESS (Phase 1 of 3 merged to main)

Spec: `docs/superpowers/specs/2026-08-12-multi-project-support-design.md`. This is sub-project A, the last of the user's original three-part request (B and C above are both complete). Given its size, the spec's own Implementation Note calls for 3 sequential plans; only Phase 1 is done so far.

**Phase 1 — Data model & persistence — COMPLETE.** Plan: `docs/superpowers/plans/2026-08-12-multi-project-data-model.md`.
- Added a `Project` model plus 9 project-scoped reference-data tables (`ProjectMaterialItem`, `ProjectLaborTask`, `ProjectLaborRate`, `ProjectCrewSizeRow`, `ProjectLaborProjectionSettings`, `ProjectPassThroughRoleRate`, `ProjectRentalRate`, `ProjectSoftCostRate`, `ProjectEstimateDefaults`) — each scoped by `projectId` with `onDelete: Cascade`. The existing 9 master tables (and all 17 existing Admin Server Actions) are completely untouched; they're now the "Master Defaults" template.
- `src/lib/project/createProject.ts` clones every row from the 9 master tables into a new project's scoped copies inside one transaction; returns `{ id }`.
- `src/lib/project/saveProjectDraft.ts` persists a project's full estimate draft (same shape as the `PersistedDraft` interface already used for today's `localStorage` persistence, now exported from `EstimateContext.tsx`) into `Project.draftJson`, syncing `Project.name`/`Project.client` from the draft's cover info in the same write.
- Deliberately **not yet wired up to anything** — no routes, pages, or `EstimateContext` changes. `EstimateContext.tsx` still persists to `localStorage` exactly as before; the live app is unchanged. This was a scoping refinement made during implementation (see the plan's header) — rewiring `EstimateContext` to actually use this persistence belongs with the routing move in Phase 2, not before it.
- Verified: 132/132 tests passing (27 files, new integration tests against the real local Postgres following this project's established pattern), `tsc --noEmit` clean, `npm run build` succeeds (still 16 routes — purely additive).

**Phase 2 — Routing, landing page & All Projects page — COMPLETE.** Plan: `docs/superpowers/plans/2026-08-12-multi-project-routing-ui.md`, executed via `superpowers:subagent-driven-development` (7 tasks, each independently implemented and reviewed, plus a final whole-branch review).
- Moved the entire estimator (Cover Info, Materials, Labor, Pass Throughs, Summary) from the old `(estimator)` route group to `/project/[projectId]/...`; `project/[projectId]/layout.tsx` loads that project's own reference data (`loadProjectReferenceData`/`loadProjectEstimateDefaults`, new project-scoped siblings of the master loaders, sharing their row-mapping logic via extracted `buildReferenceData`/`buildEstimateDefaults` helpers) and its saved draft, `notFound()`-ing on an invalid project id.
- `EstimateContext.tsx` no longer touches `localStorage` at all: `EstimateProvider` now takes `projectId`/`initialDraft`, autosaves via a debounced `saveProjectDraft()`, and exposes `flushSave()`. A loaded draft is passed through `normalizeDraft()` (in the new, deliberately plain — no `'use client'` — `src/lib/estimate/draft.ts`) so a future `PersistedDraft` shape change degrades missing fields to defaults instead of crashing.
- Added `/` (landing: Create New Project / Explore Current Projects) and `/projects` (All Projects table, Name/Client filters, Edit/Delete via new `src/lib/project/deleteProject.ts`, Master Defaults button linking to the unchanged `/admin`).
- Sidebar gained a flush-then-navigate "All Projects" button (no confirmation popup — autosave already covers the "don't lose work" concern) and lost the old global "Admin" link (Phase 3 reintroduces it pointing at the new per-project route).
- Verified: 151/151 tests passing (31 files), `tsc --noEmit` clean, `npm run build` succeeds (16 routes).
- **Notable: the final whole-branch review caught a real Critical bug empirically** (a failed autosave was marking the draft as saved anyway, disarming the unsaved-changes warning with no retry — a real silent-data-loss risk now that `localStorage` is gone) **and, after the fix for that plus 5 other approved findings landed, a second review pass caught a regression the fix itself introduced**: `normalizeDraft` lived in the `'use client'`-marked `EstimateContext.tsx` but was called from the `project/[projectId]/layout.tsx` Server Component — in Next's RSC model this resolves to a client-reference proxy at runtime, not a callable function, which would have 500'd every project page. `npm run build` could not catch this (`/project/[projectId]` is `force-dynamic`, never rendered at build time); only an actual live page load could. Fixed by moving `buildBlankDraft`/`normalizeDraft` into `draft.ts`. **Lesson for future work crossing the server/client boundary in this app: a green build and passing unit tests are not sufficient evidence — a real rendered-page check is required.**
- Deferred (Minor, non-blocking): a few narrow, self-healing races in the autosave/flush logic (harmless given `saveProjectDraft`'s idempotent `upsert`-by-id shape); the backward-compat re-export of `normalizeDraft`/`buildBlankDraft` from `EstimateContext.tsx` preserves the exact import path that caused the regression above (a future Server Component importing from there instead of `draft.ts` would silently reintroduce it — worth removing the re-export once nothing still relies on it); no `select`/pagination on the All Projects query; no `error.tsx`/`loading.tsx` boundaries anywhere in the app.
- **Security note carried into Phase 3, not yet a stakeholder-confirmed decision:** `/projects`, every `/project/[projectId]/*` route, and the `createProject`/`saveProjectDraft`/`deleteProject` Server Actions are fully unauthenticated — this matches the app's pre-existing posture (only `/admin` was ever password-gated) and was harmless when drafts lived in each browser's own `localStorage`, but now that drafts are server-side, anyone reaching the deployment can read or delete any project. Deliberate per the user's explicit "no auth on per-project Admin" request, but the exposure class changed with this phase and should get an explicit stakeholder decision (recorded here) before Phase 3 inherits it silently.

**Phase 3 — Per-project Admin — not started.** New unauthenticated `/project/[projectId]/admin/...` mirroring the existing 5 admin sections, targeting the `Project*` tables instead of the master ones.

## What to do next

Continue sub-project A: write and execute Phase 3's implementation plan (per-project Admin) — the last piece of multi-project support. Before starting, get an explicit stakeholder decision on the security note above (routes/actions left unauthenticated by design, or should Phase 3 add some form of gate) so Phase 3 doesn't inherit the current posture silently.

Minor items noted for later (non-blocking, carried over from earlier phases): the Materials `percentOfTotal` display field's denominator should be reconciled against the workbook's display column; the crew-size technician-count input should be constrained to 1–20 in the UI; consider `next/font` instead of the current Google Fonts `@import` in `globals.css`; PDF generation (`BlobProvider`) regenerates on every summary-page keystroke instead of gating behind the Export click; `Number(e.target.value)` produces `NaN` on empty/partial numeric input across several pages.

(Correction to an earlier note: `pdfFileName.ts` was previously flagged here as not sanitizing filesystem-unsafe characters — re-checked while building `excelFileName()` for sub-project C, and it already does, via `sanitizeFileNamePart`. That deferred item was stale.)
