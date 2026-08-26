# Site Tracker → BOM Estimator Import — Design

**Date:** 2026-08-26
**Scope:** Cross-repo feature spanning two separate Next.js apps/repos:
- `AmeriCloud-Site-Tracker` (Site Tracker Tool) — origin of the data
- `AmeriCloud-DAS-Pricing-Calculator` (this repo, the "BOM and Construction Estimator" / DAS Pricing Calculator) — destination

This document is the shared design for both sides and is committed identically to both repos' `docs/superpowers/specs/` so each repo's history is self-contained. Each repo gets its own implementation plan and its own commits — there is no shared codebase or shared deploy.

## Problem

Users currently re-type a new BOM estimate's Cover Info (Client, Project, Job Site Address, Project Overview) by hand, even though that data already exists on the matching Site Tracker project. This creates duplicate data entry and a chance for the two records to drift out of sync at creation time.

## Goal

Add an "Import to BOM Estimator" button on each individual Site Tracker project's General Information tab. Clicking it:
1. Opens the BOM Estimator app in a new browser tab.
2. Creates a brand-new BOM project (same underlying mechanism as the existing "+ Create New Project" button).
3. Pre-fills that new project's Cover Info page with four fields sourced from the Site Tracker project:
   - **Client** ← Site Tracker `client`
   - **Project** ← Site Tracker `site_name` ("Project Name" field)
   - **Job Site Address** ← Site Tracker `street`, `city`, `state`, `zip_code` joined into one string
   - **Project Overview** ← Site Tracker `project_scope`

All other Cover Info fields (RFP Received Date, Bid Due Date, Estimated By, Customer Type, Customer Contact Name/Phone/Email) and all other estimator data (materials, labor, pass-throughs, markups) start blank/default, exactly as they do for a normal new project.

## Non-goals

- No link is stored back to the Site Tracker project. Each click creates an independent, brand-new BOM project — confirmed acceptable by the user; clicking the button twice for the same Site Tracker project produces two separate BOM projects, with no reuse/dedup logic.
- No changes to either app's authentication posture. Both apps currently allow unauthenticated project creation; this feature does not change that.
- No new database schema in either app.

## Design

### Why a plain link + server redirect (not a cross-app API call)

Both apps are separately deployed on Vercel with no shared auth and no existing API contract between them. A plain GET link avoids CORS entirely, avoids popup-blocker issues (the tab opens synchronously from the user's click via a real `<a target="_blank">`, not from an async `fetch` callback), and lets the BOM side reuse its existing, already-tested project-creation and draft-saving code paths instead of adding a new mutation surface.

### BOM Estimator side (this repo)

New route handler: `src/app/import/route.ts` (GET).

```
GET /import?client=...&project=...&jobSiteAddress=...&projectOverview=...
```

Behavior:
1. Read the four query params (each optional — missing ones just mean an empty Cover Info field, same as a normal blank project).
2. Call the existing `createProject()` (`src/lib/project/createProject.ts`) — unchanged, clones the 9 master reference tables into a new project exactly as the "+ Create New Project" button does.
3. Load that project's own scoped estimate defaults via the existing `loadProjectEstimateDefaults(projectId)`.
4. Build a draft with `buildBlankDraft(estimateDefaults)` (`src/lib/estimate/draft.ts`), then override `coverInfo.client`, `coverInfo.project`, `coverInfo.jobSiteAddress`, `coverInfo.projectOverview` with the query param values (falling back to `''` for any missing param — `buildBlankDraft`'s own default).
5. Persist it with the existing `saveProjectDraft(projectId, draft)` (`src/lib/project/saveProjectDraft.ts`) — this also syncs `Project.name`/`Project.client` from the draft, same as every other draft save.
6. `redirect(`/project/${projectId}`)` — lands the user on that project's Cover Info page, now pre-filled.

No new Prisma models, no new Server Actions — this route is a thin composition of three functions that already exist and are already tested.

### Site Tracker side

New component: `components/forms/ImportToBomButton.tsx` (`'use client'`).

- Props: the current `Project` (or the individual fields it needs).
- Builds the target URL from `NEXT_PUBLIC_BOM_ESTIMATOR_URL` (new env var, defaulting to `https://americloud-das-pricing-calculator.vercel.app`) + `/import` + a `URLSearchParams` built from:
  - `client` = `project.client`
  - `project` = `project.site_name`
  - `jobSiteAddress` = a new small helper, e.g. `formatJobSiteAddress(street, city, state, zip_code)`, that joins non-empty parts as `"street, city, state zip"` (e.g. `"123 Main St, New York, NY 10001"`), gracefully omitting any missing optional part (state/zip) without stray commas.
  - `projectOverview` = `project.project_scope ?? ''`
- Renders as `<a href={url} target="_blank" rel="noopener noreferrer">Import to BOM Estimator</a>`, styled consistently with the existing tab's action buttons.

Wired into `components/forms/EditProjectForm.tsx`'s "General Information" tab — placed alongside the existing Cancel/Save Changes actions at the bottom of the form (a peer of those buttons, not inside a `FormCard`, since it doesn't submit the Site Tracker form).

Because it reads live form values (the user may have just edited Client/Project Name/Address/Scope without saving yet), the button reads from the same `watch()`-backed form state as the rest of the form, not from the original `project` prop — so the imported values match what's currently on screen, not stale saved data. If this turns out to be surprising (e.g. user expects it to reflect only saved data), that's a one-line change (switch from `watch()` values to the `project` prop) to revisit after first use.

### Data flow diagram

```
Site Tracker (EditProjectForm, General Information tab)
  [Import to BOM Estimator] --click-->
    new tab: GET https://…vercel.app/import?client=…&project=…&jobSiteAddress=…&projectOverview=…
      --> BOM app's /import route handler
            createProject()                (existing)
            loadProjectEstimateDefaults()  (existing)
            buildBlankDraft() + override coverInfo fields
            saveProjectDraft()             (existing)
            redirect(/project/{id})
      --> BOM Cover Info page, pre-filled
```

## Testing

**BOM side:** a route test for `src/app/import/route.ts` (integration-style, hitting the real test DB per this repo's existing pattern) asserting: a project is created, its saved `draftJson.coverInfo` has the four fields set from query params and the rest blank/default, `Project.name`/`Project.client` are synced, and the response redirects to `/project/{id}`. Also cover the missing-query-param case (empty string, not a crash).

**Site Tracker side:** a component test for `ImportToBomButton` (and/or `formatJobSiteAddress`) asserting the generated URL/query string is correct for a project with all fields present, and for one missing `state`/`zip_code` (no stray comma/space).

## Open items / accepted tradeoffs

- Cover Info values travel in a plain URL query string — visible in browser history and Vercel access logs on the BOM side. Acceptable: neither app is authenticated today, and none of the four fields (client name, project name, jobsite address, scope text) are secret.
- No size/length guard on `projectOverview` in the URL. In practice Project Scope text is short-to-medium free text; if a truly long scope ever caused URL-length issues, the fix would be to switch to a `POST` (e.g. a same-origin form submit from Site Tracker, or a short-lived server-side handoff) — not needed for the current expected content.
