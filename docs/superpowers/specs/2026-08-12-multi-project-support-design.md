# Multi-Project Support — Design

## Context

This is sub-project A of a larger three-part request from the user (sub-projects B — calc audit + editable Mark-Up % — and C — Materials Excel export — are both complete and merged; this is the last and largest piece). The user's request, verbatim:

> "the landing page needs to be a page that gives you two options: Create New Project or Explore Current Projects. Create New Project should open the current layout with the sidebar with Cover Info, Materials, Labor, etc tabs and a tab needs to be added below Admin which should be All Projects which opens a page where a table displays All Projects with their Name and their Client and an edit and delete button. A filter bar should also be added on top with a searchable Name bar and a searchable client. This should also be the page that opens when you click on Explore Current Projects on the landing page. Keep in mind this page should open without the sidebar as it's own separate page entirely. Also when you go from a current project's side bar and click on All Projects, it should present a popup that asks whether you wish to save changes to your current project or not before moving to that All Projects page.
>
> Also, remove username and password from Admin page and allow everyone to access it freely. But the default values for all projects should be the current ones. If I make changes in values of items in the Admin page on one project, it shouldn't affect the values in other projects."

Three points were clarified and settled during brainstorming, all of which materially shape this design:

1. **There is no `Project` entity today.** The estimate (materials/labor quantities, cover info, pass-throughs, markups) lives only in browser `localStorage`, and all 9 reference-data tables (`MaterialItem`, `LaborTask`, `LaborRate`, `CrewSizeRow`, `LaborProjectionSettings`, `PassThroughRoleRate`, `RentalRate`, `SoftCostRate`, `EstimateDefaults`) are queried with zero scoping anywhere. This is new infrastructure, not a migration of existing multi-project data.
2. **Two distinct Admin surfaces, not one.** A password-gated "Master Defaults" area (the existing `/admin`, essentially unchanged) that new projects clone from, reachable only via a button on the All Projects page — plus a new, unauthenticated per-project Admin reachable from within an open project's sidebar, editing only that project's own copy.
3. **Estimate data becomes server-persisted per project** (not just reference-data scoping), so "Edit" on the All Projects page reliably reopens real data from any browser/device. This also means the "unsaved changes" popup originally requested is no longer needed for its original purpose (preventing data loss) — leaving a project instead immediately flushes the pending autosave and navigates, with no popup.

## Data Model

### `Project`

```prisma
model Project {
  id        String   @id @default(cuid())
  name      String   @default("")
  client    String   @default("")
  draftJson Json?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  materialItems           ProjectMaterialItem[]
  laborTasks              ProjectLaborTask[]
  laborRates               ProjectLaborRate[]
  crewSizeTable            ProjectCrewSizeRow[]
  laborProjectionSettings  ProjectLaborProjectionSettings?
  passThroughRoleRates     ProjectPassThroughRoleRate[]
  rentalRates              ProjectRentalRate[]
  softCostRates            ProjectSoftCostRate[]
  estimateDefaults         ProjectEstimateDefaults?
}
```

- `name` / `client` are real, queryable columns — denormalized from `coverInfo.project` / `coverInfo.client` — so the All Projects page can filter/search without parsing `draftJson` on every row. They're kept in sync automatically: every autosave write updates them from the current `coverInfo` in the same transaction.
- `draftJson` holds the exact same shape as today's `PersistedDraft` interface in `EstimateContext.tsx` (cover info, materials, contingency/S&H, LOE/SOW tasks, technician count, pass-throughs, markups) — just moved from `localStorage` to the database. `null` until the first autosave fires.
- A freshly-created project has blank `name`/`client`; the All Projects table displays "Untitled Project" as a fallback when `name` is blank (display-only — not stored specially).

### Nine project-scoped reference-data tables

One new model per existing reference-data table, each with a `projectId` FK (`onDelete: Cascade`, so deleting a `Project` cleanly removes all its scoped data) and the same fields as its master counterpart:

- `ProjectMaterialItem`, `ProjectLaborTask`, `ProjectLaborRate`, `ProjectCrewSizeRow`, `ProjectPassThroughRoleRate`, `ProjectRentalRate`, `ProjectSoftCostRate` — each keeps the master table's business-key uniqueness, rescoped to be per-project instead of global (e.g. master `LaborRate.role @unique` becomes `ProjectLaborRate`'s `@@unique([projectId, role])`; master `MaterialItem.key @unique` becomes `ProjectMaterialItem`'s `@@unique([projectId, key])`).
- `ProjectLaborProjectionSettings` and `ProjectEstimateDefaults` — the master versions are singletons (`id: 'singleton'`); their project-scoped versions are naturally one-per-project, so `projectId` itself is the primary key (`@id`) rather than a synthetic `id` + unique constraint.

The **existing 9 tables are untouched** — schema, data, and all 17 existing mutating Server Actions in `src/app/admin/(sections)/*/actions.ts` keep working exactly as they do today. They now serve as the "Master Defaults" template that `createProject()` clones from.

### Creating a project

A single Server Action, `createProject()`, in one transaction:
1. Creates the `Project` row (blank `name`/`client`, `draftJson: null`).
2. Reads every row from all 9 master tables (`prisma.materialItem.findMany()`, etc. — the exact same queries `loadReferenceData()`/`loadEstimateDefaults()` already make) and bulk-inserts (`createMany`) matching rows into the 9 project-scoped tables, stamped with the new `projectId`.
3. Returns the new project's `id`.

The landing page's "Create New Project" button calls this, then navigates to `/project/[id]`.

## Master Defaults vs. Per-Project Admin

| | Master Defaults | Per-Project Admin |
|---|---|---|
| Route | `/admin/...` (unchanged) | `/project/[projectId]/admin/...` (new) |
| Auth | Existing password gate (`middleware.ts` + `adminAuth.ts`), unchanged | None — open to everyone, per the original request |
| Reachable from | A "Master Defaults" button, top-right corner of `/projects` | That project's sidebar, in place of today's global "Admin" link |
| Edits affect | The template future projects clone from | Only that one project's own scoped tables |
| Tables | The existing 9 (`MaterialItem`, `LaborTask`, …) | The new 9 `Project*` tables, filtered to `where: { projectId }` |

Because `/project/[projectId]/admin` lives under a completely different top-level path than `/admin`, `middleware.ts`'s existing matcher (`['/admin', '/admin/:path*']`) naturally does not gate it — no middleware changes needed, and no risk of the new per-project routes accidentally inheriting (or missing) the password gate.

The new per-project admin pages/actions mirror the shape of the existing 5 sections (materials, labor tasks, rates, pass-throughs, defaults) and reuse the existing shared `AdminTable` component — same validation rules, same UI, just targeting the `Project*` tables with a `projectId` in scope and no `requireAdminSession()` call. Where the existing per-file `ActionResult`/`ValidationErr`/`parseNonNegative`/`parsePercent` helpers are identical between a master action file and its per-project counterpart, share them rather than duplicating a third time (they were already flagged as duplicated across the 5 master files in the Admin Area retro — this is a natural point to stop that duplication from tripling).

## Routing & Page Structure

- **`/`** — new landing page. Two buttons: "Create New Project" (calls `createProject()`, navigates to `/project/[id]`) and "Explore Current Projects" (navigates to `/projects`). Replaces today's root, which is currently the Cover Info page itself.
- **`/projects`** — All Projects page. Sidebar-less, standalone (its own route, not nested under any layout that renders `AppShell`). Table columns: Name, Client, Edit, Delete. A filter bar with two independent text inputs (Name, Client) does client-side substring filtering — same pattern as the existing Materials/Labor page search boxes. "Master Defaults" button, top-right.
- **`/project/[projectId]/...`** — today's entire `(estimator)` route group (Cover Info, Materials, Labor, Pass Throughs, Summary) moves here, nested under the dynamic segment, preserving the existing page files and their relative structure almost exactly. `project/[projectId]/layout.tsx` replaces `(estimator)/layout.tsx`: it loads that project's own reference data and saved draft (instead of global reference data + a `localStorage` rehydrate) and wraps children in `EstimateProvider`.
- **`/project/[projectId]/admin/...`** — new per-project admin, as described above.
- **`/admin/...`** — unchanged, just no longer linked from any project's sidebar.
- Sidebar (`src/components/Sidebar.tsx`) gains an "All Projects" item below "Admin"; "Admin" now points at `/project/[projectId]/admin` instead of the old global `/admin`. Every existing internal navigation helper that currently hardcodes a path (`Sidebar`'s `NAV_ITEMS`, `MoveToButton`, `scrollToCategory`'s use of `document.getElementById`, which is unaffected) gets prefixed with `/project/${projectId}`.

## Persistence & Autosave

- `EstimateContext.tsx`'s existing `localStorage`-based mechanism (`DRAFT_STORAGE_KEY`, `loadDraft()`, the rehydrate-on-mount effect, the debounced `localStorage.setItem` effect) is removed entirely and replaced by:
  - `EstimateProvider` takes a `projectId: string` and an `initialDraft: PersistedDraft | null` prop (loaded server-side by `project/[projectId]/layout.tsx` from `Project.draftJson`), seeding state from it instead of the empty defaults.
  - A debounced (500ms, same interval as today) Server Action, `saveProjectDraft(projectId, draft)`, replaces the debounced `localStorage.setItem` — writes `draftJson` and, in the same call, updates `Project.name`/`Project.client` from `draft.coverInfo.project`/`draft.coverInfo.client`.
  - `EstimateContext`'s value gains `flushSave(): Promise<void>` — cancels any pending debounce timer and immediately awaits `saveProjectDraft` with the current state.
- The `beforeunload` warning (for a genuine browser-level tab close/refresh, where a save still mid-debounce could be lost) is kept as-is — it's orthogonal to in-app navigation.
- The Sidebar's new "All Projects" item is a button, not a plain `<Link>`: `onClick` calls `await flushSave()`, then `router.push('/projects')`. This satisfies the original "don't lose work when leaving" request with no popup, since the flush guarantees the save completes before navigation.

## What Does NOT Change

- The calculation engine (`src/lib/calc/`), the shape of `EstimateInput`/`ReferenceData`/`ExecutiveSummaryResult`, and every page's rendering logic (Materials, Labor, Pass Throughs, Summary) are untouched — they already only depend on `useEstimate()`, which continues to work the same way regardless of where its data came from.
- The existing 9 master reference-data tables, their schema, their seed data, and all 17 existing Server Actions in `src/app/admin/(sections)/*/actions.ts`.
- `middleware.ts` and `adminAuth.ts` — no changes; the existing password gate keeps protecting exactly the routes it protects today.

## Testing

- Unit test for `createProject()`'s clone step: verify row counts and values copied from each of the 9 master tables into the new project's scoped tables match exactly.
- Unit tests for `saveProjectDraft()`: writes `draftJson` correctly, and updates `Project.name`/`Project.client` from the draft's cover info in the same call.
- Unit tests for the All Projects page's Name/Client filter logic (client-side substring match, case-insensitive, matching the existing Materials/Labor search pattern).
- Integration test: seed a `Project` with a known `draftJson`, load it through `project/[projectId]/layout.tsx`'s data-loading path, and confirm `EstimateProvider` initializes with that exact data (replacing today's `localStorage`-rehydration test with a DB-backed equivalent).
- Integration test confirming per-project Admin edits on one project's `Project*` tables have zero effect on a second project's tables or on the master tables.
- Manual browser verification of the full flow: create a project → enter some data → confirm autosave persists it (reload and see it survive) → navigate to All Projects → confirm it's listed with the right Name/Client → Edit → confirm data reloads → edit that project's per-project Admin and confirm a second project is unaffected → Delete → confirm cascade removes its scoped tables → Master Defaults button reaches the existing password gate.

## Implementation Note

Given the size of this — a new entity, 9 new tables, a routing restructure, a new persistence/autosave mechanism, and a full second Admin surface — the resulting implementation plan should be split into a small number of sequential plans rather than attempted as one (e.g., data model + `createProject`/autosave first, then the routing move + landing/All Projects pages, then the per-project Admin section). Each phase should leave the app in a working, testable state, per this project's usual plan-sizing convention.
