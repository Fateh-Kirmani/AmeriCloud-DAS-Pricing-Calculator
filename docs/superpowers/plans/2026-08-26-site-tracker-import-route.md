# Site Tracker Import Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `GET /import` route that creates a new BOM project pre-filled with Cover Info values passed as query params, then redirects to it — the landing point for the Site Tracker Tool's new "Import to BOM Estimator" button.

**Architecture:** A single Next.js Route Handler composes three existing, already-tested functions (`createProject()`, `loadProjectEstimateDefaults()`, `saveProjectDraft()`) plus the existing `buildBlankDraft()` helper. No new Prisma models, no new Server Actions, no client-side code.

**Tech Stack:** Next.js 14 App Router Route Handler, Prisma, Vitest (integration-style, against the real dev/test Postgres per this repo's existing pattern — see `CLAUDE.md`'s "Local dev database" section).

**Spec:** `docs/superpowers/specs/2026-08-26-site-tracker-import-design.md`

## Global Constraints

- Every Cover Info query param is optional; a missing one must default to `''`, never crash the route (spec: "Behavior" step 1).
- Reuse `createProject()`, `loadProjectEstimateDefaults()`, `buildBlankDraft()`, `saveProjectDraft()` exactly as they exist today — do not modify their signatures or behavior.
- No new Prisma schema/migration.

---

### Task 1: `GET /import` route handler

**Files:**
- Create: `src/app/import/route.ts`
- Test: `src/app/import/route.test.ts`

**Interfaces:**
- Consumes (all pre-existing, unchanged):
  - `createProject(): Promise<{ id: string }>` — `src/lib/project/createProject.ts`
  - `loadProjectEstimateDefaults(projectId: string): Promise<EstimateDefaultsData>` — `src/lib/data/loadProjectReferenceData.ts`
  - `buildBlankDraft(estimateDefaults: EstimateDefaultsData): PersistedDraft` — `src/lib/estimate/draft.ts`
  - `saveProjectDraft(projectId: string, draft: PersistedDraft): Promise<void>` — `src/lib/project/saveProjectDraft.ts`
- Produces: the `GET` export from `src/app/import/route.ts`, a standard Next.js Route Handler `(request: NextRequest) => Promise<NextResponse>`. Nothing else in this repo depends on it (it's the entry point the other repo's browser navigates to).

- [ ] **Step 1: Write the failing integration test**

Create `src/app/import/route.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { GET } from './route';

describe('GET /import (integration — requires a live, seeded local Postgres)', () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    for (const id of createdIds.splice(0)) {
      await prisma.project.deleteMany({ where: { id } });
    }
  });

  it('creates a project, pre-fills Cover Info from query params, and redirects to it', async () => {
    const url = 'http://localhost/import?' + new URLSearchParams({
      client: 'Beacon Corp',
      project: 'Beacon Test Site',
      jobSiteAddress: '123 Main St, New York, NY 10001',
      projectOverview: 'Install new DAS equipment.',
    }).toString();
    const request = new NextRequest(url);

    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const projectId = new URL(location!).pathname.split('/').pop()!;
    createdIds.push(projectId);

    expect(new URL(location!).pathname).toBe(`/project/${projectId}`);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    expect(project?.name).toBe('Beacon Test Site');
    expect(project?.client).toBe('Beacon Corp');

    const draft = project?.draftJson as { coverInfo: Record<string, string> };
    expect(draft.coverInfo).toEqual({
      client: 'Beacon Corp',
      project: 'Beacon Test Site',
      rfpDate: '',
      bidDueDate: '',
      estimator: '',
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      customerType: '',
      jobSiteAddress: '123 Main St, New York, NY 10001',
      projectOverview: 'Install new DAS equipment.',
    });
  });

  it('defaults missing query params to empty strings instead of crashing', async () => {
    const request = new NextRequest('http://localhost/import');

    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    const projectId = new URL(location).pathname.split('/').pop()!;
    createdIds.push(projectId);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    const draft = project?.draftJson as { coverInfo: Record<string, string> };
    expect(draft.coverInfo.client).toBe('');
    expect(draft.coverInfo.project).toBe('');
    expect(draft.coverInfo.jobSiteAddress).toBe('');
    expect(draft.coverInfo.projectOverview).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/import/route.test.ts`
Expected: FAIL — `Cannot find module './route'` (the route file doesn't exist yet).

- [ ] **Step 3: Write the route handler**

Create `src/app/import/route.ts`:

```ts
// src/app/import/route.ts
//
// Landing point for the Site Tracker Tool's "Import to BOM Estimator" button — a plain link
// (not a fetch/API call), so this reads its input from query params and responds with a redirect,
// same shape as any other GET navigation. See
// docs/superpowers/specs/2026-08-26-site-tracker-import-design.md for the full cross-repo design.

import { NextRequest, NextResponse } from 'next/server';
import { createProject } from '@/lib/project/createProject';
import { loadProjectEstimateDefaults } from '@/lib/data/loadProjectReferenceData';
import { buildBlankDraft } from '@/lib/estimate/draft';
import { saveProjectDraft } from '@/lib/project/saveProjectDraft';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const client = searchParams.get('client') ?? '';
  const project = searchParams.get('project') ?? '';
  const jobSiteAddress = searchParams.get('jobSiteAddress') ?? '';
  const projectOverview = searchParams.get('projectOverview') ?? '';

  const { id } = await createProject();
  const estimateDefaults = await loadProjectEstimateDefaults(id);
  const draft = buildBlankDraft(estimateDefaults);
  draft.coverInfo = { ...draft.coverInfo, client, project, jobSiteAddress, projectOverview };
  await saveProjectDraft(id, draft);

  return NextResponse.redirect(new URL(`/project/${id}`, request.url));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/import/route.test.ts`
Expected: PASS (2/2 tests)

- [ ] **Step 5: Full verification**

Run: `npx tsc --noEmit` — expect clean.
Run: `npm run build` — expect success, with `/import` listed among the routes.

- [ ] **Step 6: Commit**

```bash
git add src/app/import/route.ts src/app/import/route.test.ts
git commit -m "feat: add /import route to create a pre-filled project from query params"
```
