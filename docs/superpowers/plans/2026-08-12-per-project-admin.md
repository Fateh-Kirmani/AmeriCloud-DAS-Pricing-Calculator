# Per-Project Admin Implementation Plan (Phase 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new, unauthenticated `/project/[projectId]/admin/...` area mirroring the existing 5 master admin sections (Materials, Labor Tasks, Rates, Pass Throughs, Defaults), but reading/writing the `Project*` tables added in Phase 1 instead of the master tables — completing sub-project A (multi-project support) per `docs/superpowers/specs/2026-08-12-multi-project-support-design.md`.

**Architecture:** The estimator's pages first move into a nested `(estimator)` route group under `/project/[projectId]/` so the new admin area — sharing the same `/project/[projectId]/*` URL prefix — does not inherit the estimator's `EstimateProvider`/`AppShell`/Sidebar chrome, matching how the existing master admin already has its own distinct header rather than sharing any estimator UI. Five new page/action/component groups mirror the five existing master admin sections almost line-for-line, with three differences applied uniformly: every mutating action takes `projectId` as an explicit parameter (Server Actions can't read route params directly), every `requireAdminSession()` call is dropped (no auth, per the design), and every multi-row update/delete uses a compound `{ id, projectId }` (or, for the two project-scoped singleton tables, plain `{ projectId }`) `where` filter so a request can never mutate a row belonging to a different project. A new shared `src/lib/admin/validation.ts` holds the `ActionResult`/`ValidationErr` types and the three numeric parsers that are otherwise duplicated across the master admin's 5 action files (already flagged as a known deferred item in this project's notes) — extracted now specifically to avoid tripling that duplication as this phase adds a second copy of the same patterns.

**Tech Stack:** Next.js 14 App Router, Prisma, Vitest (integration tests against the real local dev Postgres).

## Global Constraints

- The new admin area has **no authentication** — every `requireAdminSession()` call from the master admin's pattern is omitted entirely in the per-project versions, per the design's explicit "unauthenticated per-project Admin" requirement.
- Every per-project mutating action's `where` clause must include `projectId` (directly as the row's primary key for the two singleton tables `ProjectLaborProjectionSettings`/`ProjectEstimateDefaults`, or alongside `id` via `updateMany`/`deleteMany` for the other 7 tables) so a request can never read or mutate a different project's data.
- `revalidatePath` in every per-project action scopes to that project's own route tree (`` revalidatePath(`/project/${projectId}`, 'layout') ``), not the global `revalidatePath('/', 'layout')` the master admin uses — narrower invalidation is correct here since nothing outside one project's own pages could be affected by an edit to that project's own admin data.
- The existing 9 master tables, their 17 existing Server Actions' *behavior*, and the existing password-gated `/admin` area are unchanged in outcome — Task 1's refactor only relocates shared helper code, it does not change what any master action does, and every existing test for those 5 files must keep passing unmodified.
- The `AdminTable` component (`src/components/admin/AdminTable.tsx`) is reused completely unmodified — it is already generic over any `Row extends { id: string }` with `(id, values) => Promise<{error?}>`-shaped handlers, which the per-project actions satisfy via a closure over `projectId` at the call site.
- A freshly-created project's admin data starts as an exact clone of the master tables (already true since Phase 1's `createProject()`); editing one project's admin data must never change another project's data or the master tables.

---

### Task 1: Isolate the estimator under a nested `(estimator)` route group

**Files:**
- Move: `src/app/project/[projectId]/layout.tsx` → `src/app/project/[projectId]/(estimator)/layout.tsx` (content unchanged)
- Move: `src/app/project/[projectId]/page.tsx` → `src/app/project/[projectId]/(estimator)/page.tsx` (content unchanged)
- Move: `src/app/project/[projectId]/materials/` → `src/app/project/[projectId]/(estimator)/materials/` (content unchanged)
- Move: `src/app/project/[projectId]/labor/` → `src/app/project/[projectId]/(estimator)/labor/` (content unchanged)
- Move: `src/app/project/[projectId]/pass-throughs/` → `src/app/project/[projectId]/(estimator)/pass-throughs/` (content unchanged)
- Move: `src/app/project/[projectId]/summary/` → `src/app/project/[projectId]/(estimator)/summary/` (content unchanged)

**Interfaces:**
- Produces: no interface changes — every existing estimator URL (`/project/[projectId]`, `/project/[projectId]/materials`, etc.) is unaffected, since Next.js route groups (parenthesized directory names) never appear in the URL. This task exists purely so Task 8's new `/project/[projectId]/admin/layout.tsx` does not inherit the estimator's `EstimateProvider`/`AppShell` (there will be nothing left at the `project/[projectId]/` level to inherit from once this move is done).

- [ ] **Step 1: Move the files**

```bash
mkdir -p "src/app/project/[projectId]/(estimator)"
git mv "src/app/project/[projectId]/layout.tsx" "src/app/project/[projectId]/(estimator)/layout.tsx"
git mv "src/app/project/[projectId]/page.tsx" "src/app/project/[projectId]/(estimator)/page.tsx"
git mv "src/app/project/[projectId]/materials" "src/app/project/[projectId]/(estimator)/materials"
git mv "src/app/project/[projectId]/labor" "src/app/project/[projectId]/(estimator)/labor"
git mv "src/app/project/[projectId]/pass-throughs" "src/app/project/[projectId]/(estimator)/pass-throughs"
git mv "src/app/project/[projectId]/summary" "src/app/project/[projectId]/(estimator)/summary"
```

No file content changes at all — this step is a pure relocation.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (nothing referenced these files by their old on-disk path — only by URL, which is unchanged).

- [ ] **Step 3: Run the full test suite and build**

Run: `npx vitest run`
Expected: all tests still pass, same count as before this task (no test imports these files by path).

Run: `npm run build`
Expected: succeeds, same 16 routes as before (route groups don't add routes).

- [ ] **Step 4: Manually verify the estimator still works identically**

Run: `PORT=4000 npm run dev`, create a test project (`npx tsx -e "import('./src/lib/project/createProject').then(m => m.createProject()).then(p => console.log(p.id))"`), and click through Cover Info → Materials → Labor → Pass Throughs → Executive Summary at `/project/<id>/...` exactly as before. Confirm nothing changed.

- [ ] **Step 5: Commit**

```bash
git add "src/app/project"
git commit -m "refactor: move estimator routes into a nested (estimator) group, isolating them from the upcoming per-project admin area"
```

---

### Task 2: Shared admin validation helpers

**Files:**
- Create: `src/lib/admin/validation.ts`
- Modify: `src/app/admin/(sections)/materials/actions.ts`
- Modify: `src/app/admin/(sections)/labor-tasks/actions.ts`
- Modify: `src/app/admin/(sections)/rates/actions.ts`
- Modify: `src/app/admin/(sections)/pass-throughs/actions.ts`
- Modify: `src/app/admin/(sections)/defaults/actions.ts`

**Interfaces:**
- Produces: `ActionResult`, `ValidationErr`, `parseNonNegative(raw: string | undefined): number | null`, `parsePercent(raw: string | undefined): number | null`, `parseNonNegativeInt(raw: string | undefined): number | null` — every task from here on imports these from `@/lib/admin/validation` instead of re-declaring them.

- [ ] **Step 1: Create the shared module**

Create `src/lib/admin/validation.ts`:

```ts
// src/lib/admin/validation.ts

export interface ActionResult {
  error?: string;
}

export interface ValidationErr {
  ok: false;
  error: string;
}

export function parseNonNegative(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null;
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0) return null;
  return value;
}

export function parsePercent(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null;
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0 || value > 100) return null;
  return value / 100;
}

export function parseNonNegativeInt(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null;
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0 || !Number.isInteger(value)) return null;
  return value;
}
```

- [ ] **Step 2: Refactor `materials/actions.ts`**

In `src/app/admin/(sections)/materials/actions.ts`, replace lines 1-10:

```ts
'use server';

import { prisma } from '@/lib/db';
import { Prisma, type MaterialCategory } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/adminAuth';

interface ActionResult {
  error?: string;
}
```

with:

```ts
'use server';

import { prisma } from '@/lib/db';
import { Prisma, type MaterialCategory } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/adminAuth';
import type { ActionResult, ValidationErr } from '@/lib/admin/validation';
```

Then delete the now-duplicate local `interface ValidationErr { ok: false; error: string; }` block (currently lines 25-28, immediately after the `MaterialOk` interface).

- [ ] **Step 3: Refactor `labor-tasks/actions.ts`**

Same shape of change: replace the `interface ActionResult { error?: string; }` block (lines 9-11) and the `interface ValidationErr { ok: false; error: string; }` block (lines 29-32) with a single import line added to the existing import block:

```ts
import type { ActionResult, ValidationErr } from '@/lib/admin/validation';
```

- [ ] **Step 4: Refactor `rates/actions.ts`**

Replace lines 1-30 (the `'use server'` through the end of the `parseNonNegativeInt` function) with:

```ts
'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/adminAuth';
import { parseNonNegative, parsePercent, parseNonNegativeInt, type ActionResult, type ValidationErr } from '@/lib/admin/validation';
```

Then delete the now-duplicate local `interface ValidationErr { ok: false; error: string; }` block (currently lines 63-66, right before `function validateSettingsValues`).

- [ ] **Step 5: Refactor `pass-throughs/actions.ts`**

Replace lines 1-17 (the `'use server'` through the end of the local `parseNonNegative` function) with:

```ts
'use server';

import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/adminAuth';
import { parseNonNegative, type ActionResult, type ValidationErr } from '@/lib/admin/validation';
```

Then delete the now-duplicate local `interface ValidationErr { ok: false; error: string; }` block (currently lines 36-39, right before `function validateRentalValues`).

- [ ] **Step 6: Refactor `defaults/actions.ts`**

Replace lines 1-9 (the `'use server'` through the end of the local `interface ActionResult`) with:

```ts
'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/adminAuth';
import type { ActionResult, ValidationErr } from '@/lib/admin/validation';
```

Then delete the now-duplicate local `interface ValidationErr { ok: false; error: string; }` block (currently lines 20-23, right after `DefaultsOk`). Leave the file's own bespoke `function parsePercent(raw: string | undefined, label: string): number | { error: string }` exactly as-is — it has a different signature than the shared `parsePercent` (it takes a field label and returns a labeled error object instead of `null`), so it is not part of this extraction; only the two types moved.

- [ ] **Step 7: Run the existing test suite for all 5 sections**

Run: `npx vitest run "src/app/admin/(sections)"`
Expected: PASS — every existing test in `materials/actions.test.ts`, `labor-tasks/actions.test.ts`, `rates/actions.test.ts`, `pass-throughs/actions.test.ts`, `defaults/actions.test.ts` still passes unchanged. This refactor must not change any action's observable behavior.

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/admin/validation.ts "src/app/admin/(sections)"
git commit -m "refactor: extract shared admin validation helpers, removing 5x-duplicated ActionResult/ValidationErr and 2x-duplicated parseNonNegative"
```

---

### Task 3: Per-project Materials admin

**Files:**
- Create: `src/app/project/[projectId]/admin/materials/actions.ts`
- Test: `src/app/project/[projectId]/admin/materials/actions.test.ts`
- Create: `src/app/project/[projectId]/admin/materials/MaterialsAdminClient.tsx`
- Create: `src/app/project/[projectId]/admin/materials/page.tsx`

**Interfaces:**
- Consumes: `createProject` (Phase 1, for the test), `ActionResult`/`ValidationErr` (Task 2), `AdminTable`/`AdminColumn` (existing, unmodified), `formatCurrency` (existing, unmodified).
- Produces: `createProjectMaterial(projectId: string, values: Record<string,string>): Promise<ActionResult>`, `updateProjectMaterial(projectId: string, id: string, values: Record<string,string>): Promise<ActionResult>`, `deleteProjectMaterial(projectId: string, id: string): Promise<ActionResult>`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/project/[projectId]/admin/materials/actions.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createProject } from '@/lib/project/createProject';
import { createProjectMaterial, updateProjectMaterial, deleteProjectMaterial } from './actions';

describe('project material admin actions (integration — requires a live, seeded local Postgres)', () => {
  const projectIds: string[] = [];

  afterEach(async () => {
    for (const id of projectIds.splice(0)) {
      await prisma.project.deleteMany({ where: { id } });
    }
  });

  it('creates a material scoped to one project', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const result = await createProjectMaterial(projectId, {
      key: 'test-proj-material-1', type: 'Test Type', manufacturer: 'Test Mfr', model: 'TM-1',
      description: 'A test material', vendor: 'Test Vendor', category: 'Consumable', unitCost: '12.5',
    });
    expect(result.error).toBeUndefined();

    const created = await prisma.projectMaterialItem.findUnique({
      where: { projectId_key: { projectId, key: 'test-proj-material-1' } },
    });
    expect(created).toMatchObject({ type: 'Test Type', unitCost: 12.5, category: 'Consumable' });
  });

  it('rejects a duplicate key within the same project', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const first = await createProjectMaterial(projectId, {
      key: 'test-proj-material-dup', type: 'T', description: 'D', category: 'Consumable', unitCost: '1',
      manufacturer: '', model: '', vendor: '',
    });
    expect(first.error).toBeUndefined();

    const second = await createProjectMaterial(projectId, {
      key: 'test-proj-material-dup', type: 'T2', description: 'D2', category: 'Consumable', unitCost: '2',
      manufacturer: '', model: '', vendor: '',
    });
    expect(second.error).toMatch(/already exists/);
  });

  it('allows the same key in two different projects', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const resultA = await createProjectMaterial(projectA, {
      key: 'test-proj-material-shared', type: 'T', description: 'D', category: 'Consumable', unitCost: '1',
      manufacturer: '', model: '', vendor: '',
    });
    const resultB = await createProjectMaterial(projectB, {
      key: 'test-proj-material-shared', type: 'T', description: 'D', category: 'Consumable', unitCost: '1',
      manufacturer: '', model: '', vendor: '',
    });
    expect(resultA.error).toBeUndefined();
    expect(resultB.error).toBeUndefined();
  });

  it('updates a material without affecting a different project holding the same key', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    await createProjectMaterial(projectA, {
      key: 'test-proj-material-update', type: 'T', description: 'D', category: 'Consumable', unitCost: '1',
      manufacturer: '', model: '', vendor: '',
    });
    await createProjectMaterial(projectB, {
      key: 'test-proj-material-update', type: 'T', description: 'D', category: 'Consumable', unitCost: '1',
      manufacturer: '', model: '', vendor: '',
    });
    const rowA = await prisma.projectMaterialItem.findUnique({
      where: { projectId_key: { projectId: projectA, key: 'test-proj-material-update' } },
    });

    const result = await updateProjectMaterial(projectA, rowA!.id, {
      key: 'test-proj-material-update', type: 'Updated Type', description: 'Updated',
      category: 'DAS_Materials', unitCost: '99.99', manufacturer: '', model: '', vendor: '',
    });
    expect(result.error).toBeUndefined();

    const updatedA = await prisma.projectMaterialItem.findUnique({ where: { id: rowA!.id } });
    expect(updatedA).toMatchObject({ type: 'Updated Type', unitCost: 99.99, category: 'DAS_Materials' });

    const untouchedB = await prisma.projectMaterialItem.findUnique({
      where: { projectId_key: { projectId: projectB, key: 'test-proj-material-update' } },
    });
    expect(untouchedB).toMatchObject({ type: 'T', unitCost: 1 });
  });

  it('deletes a material scoped to its own project', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const created = await prisma.projectMaterialItem.create({
      data: { projectId, key: 'test-proj-material-delete', type: 'T', description: 'D', category: 'Consumable', unitCost: 1 },
    });

    const result = await deleteProjectMaterial(projectId, created.id);
    expect(result.error).toBeUndefined();

    const gone = await prisma.projectMaterialItem.findUnique({ where: { id: created.id } });
    expect(gone).toBeNull();
  });

  it('rejects a negative unit cost', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const result = await createProjectMaterial(projectId, {
      key: 'test-proj-material-negative', type: 'T', description: 'D', category: 'Consumable', unitCost: '-5',
      manufacturer: '', model: '', vendor: '',
    });
    expect(result.error).toMatch(/non-negative/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "src/app/project/[projectId]/admin/materials/actions.test.ts"`
Expected: FAIL — `Cannot find module './actions'`.

- [ ] **Step 3: Implement the actions**

Create `src/app/project/[projectId]/admin/materials/actions.ts`:

```ts
'use server';

import { prisma } from '@/lib/db';
import { Prisma, type MaterialCategory } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import type { ActionResult, ValidationErr } from '@/lib/admin/validation';

const VALID_CATEGORIES: MaterialCategory[] = ['Consumable', 'DAS_Materials', 'BAT_Materials'];

interface MaterialOk {
  ok: true;
  key: string;
  type: string;
  description: string;
  category: MaterialCategory;
  unitCost: number;
  manufacturer: string | null;
  model: string | null;
  vendor: string | null;
}

function validateMaterialValues(values: Record<string, string>): MaterialOk | ValidationErr {
  const key = values.key?.trim();
  if (!key) return { ok: false, error: 'Key is required.' };
  const type = values.type?.trim();
  if (!type) return { ok: false, error: 'Type is required.' };
  const description = values.description?.trim();
  if (!description) return { ok: false, error: 'Description is required.' };
  const category = values.category as MaterialCategory;
  if (!VALID_CATEGORIES.includes(category)) return { ok: false, error: 'Category is invalid.' };
  const unitCost = Number(values.unitCost);
  if (values.unitCost === undefined || values.unitCost === '' || Number.isNaN(unitCost) || unitCost < 0) {
    return { ok: false, error: 'Unit cost must be a non-negative number.' };
  }
  return {
    ok: true,
    key,
    type,
    description,
    category,
    unitCost,
    manufacturer: values.manufacturer?.trim() || null,
    model: values.model?.trim() || null,
    vendor: values.vendor?.trim() || null,
  };
}

export async function createProjectMaterial(projectId: string, values: Record<string, string>): Promise<ActionResult> {
  const parsed = validateMaterialValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const existing = await prisma.projectMaterialItem.findUnique({
    where: { projectId_key: { projectId, key: parsed.key } },
  });
  if (existing) return { error: `A material with key "${parsed.key}" already exists.` };

  try {
    await prisma.projectMaterialItem.create({
      data: {
        projectId,
        key: parsed.key,
        type: parsed.type,
        manufacturer: parsed.manufacturer,
        model: parsed.model,
        description: parsed.description,
        vendor: parsed.vendor,
        category: parsed.category,
        unitCost: parsed.unitCost,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A material with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

export async function updateProjectMaterial(projectId: string, id: string, values: Record<string, string>): Promise<ActionResult> {
  const parsed = validateMaterialValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const keyOwner = await prisma.projectMaterialItem.findUnique({
    where: { projectId_key: { projectId, key: parsed.key } },
  });
  if (keyOwner && keyOwner.id !== id) return { error: `A material with key "${parsed.key}" already exists.` };

  try {
    const result = await prisma.projectMaterialItem.updateMany({
      where: { id, projectId },
      data: {
        key: parsed.key,
        type: parsed.type,
        manufacturer: parsed.manufacturer,
        model: parsed.model,
        description: parsed.description,
        vendor: parsed.vendor,
        category: parsed.category,
        unitCost: parsed.unitCost,
      },
    });
    if (result.count === 0) return { error: 'Material not found in this project.' };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A material with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

export async function deleteProjectMaterial(projectId: string, id: string): Promise<ActionResult> {
  await prisma.projectMaterialItem.deleteMany({ where: { id, projectId } });
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "src/app/project/[projectId]/admin/materials/actions.test.ts"`
Expected: PASS (6 tests).

- [ ] **Step 5: Implement the client component**

Create `src/app/project/[projectId]/admin/materials/MaterialsAdminClient.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { MaterialCategory } from '@prisma/client';
import { AdminTable, type AdminColumn } from '@/components/admin/AdminTable';
import { formatCurrency } from '@/lib/utils/formatCurrency';
import { createProjectMaterial, updateProjectMaterial, deleteProjectMaterial } from './actions';

interface ProjectMaterialRow {
  id: string;
  key: string;
  type: string;
  manufacturer: string | null;
  model: string | null;
  description: string;
  vendor: string | null;
  category: MaterialCategory;
  unitCost: number;
}

const CATEGORY_OPTIONS: { value: MaterialCategory; label: string }[] = [
  { value: 'Consumable', label: 'Consumable' },
  { value: 'DAS_Materials', label: 'DAS Materials' },
  { value: 'BAT_Materials', label: 'BAT Materials' },
];

const columns: AdminColumn<ProjectMaterialRow>[] = [
  { key: 'key', label: 'Key', type: 'text', required: true },
  { key: 'type', label: 'Type', type: 'text', required: true },
  { key: 'manufacturer', label: 'Manufacturer', type: 'text' },
  { key: 'model', label: 'Model', type: 'text' },
  { key: 'description', label: 'Description', type: 'text', required: true },
  { key: 'vendor', label: 'Vendor', type: 'text' },
  { key: 'category', label: 'Category', type: 'select', options: CATEGORY_OPTIONS, required: true },
  { key: 'unitCost', label: 'Unit Cost', type: 'number', align: 'right', required: true, format: (row) => formatCurrency(row.unitCost) },
];

const emptyValues = {
  key: '', type: '', manufacturer: '', model: '', description: '', vendor: '',
  category: 'Consumable', unitCost: '0',
};

export function MaterialsAdminClient({ projectId, rows }: { projectId: string; rows: ProjectMaterialRow[] }) {
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();

  const groups = CATEGORY_OPTIONS.map(({ value, label }) => {
    const categoryRows = rows.filter((r) => r.category === value);
    const filtered = needle
      ? categoryRows.filter((r) =>
          [r.key, r.type, r.manufacturer, r.model, r.description, r.vendor]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(needle),
        )
      : categoryRows;
    return { value, label, categoryRows, filtered };
  }).filter((g) => g.categoryRows.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight text-navy">Material Catalog</h1>
        <input
          type="search"
          placeholder="Search key, type, manufacturer, model, description…"
          className="w-80 max-w-full border border-line rounded px-3 py-1.5 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {groups.map(({ value, label, categoryRows, filtered }) => (
        <AdminTable<ProjectMaterialRow>
          key={value}
          columns={columns}
          rows={filtered}
          onCreate={(values) => createProjectMaterial(projectId, values)}
          onUpdate={(id, values) => updateProjectMaterial(projectId, id, values)}
          onDelete={(id) => deleteProjectMaterial(projectId, id)}
          emptyValues={{ ...emptyValues, category: value }}
          maxBodyHeightClassName="max-h-[28rem]"
          header={
            <div className="bg-navy-2 text-white px-4 py-3 font-display flex justify-between items-center">
              <span>{label}</span>
              <span className="text-white/70 text-sm font-body">
                {filtered.length} of {categoryRows.length}
              </span>
            </div>
          }
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Implement the page**

Create `src/app/project/[projectId]/admin/materials/page.tsx`:

```tsx
import { prisma } from '@/lib/db';
import { MaterialsAdminClient } from './MaterialsAdminClient';

export default async function ProjectMaterialsAdminPage({ params }: { params: { projectId: string } }) {
  const materials = await prisma.projectMaterialItem.findMany({
    where: { projectId: params.projectId },
    orderBy: { key: 'asc' },
  });
  return <MaterialsAdminClient projectId={params.projectId} rows={materials} />;
}
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add "src/app/project/[projectId]/admin/materials"
git commit -m "feat: add per-project Materials admin section"
```

---

### Task 4: Per-project Labor Tasks admin

**Files:**
- Create: `src/app/project/[projectId]/admin/labor-tasks/actions.ts`
- Test: `src/app/project/[projectId]/admin/labor-tasks/actions.test.ts`
- Create: `src/app/project/[projectId]/admin/labor-tasks/LaborTasksAdminClient.tsx`
- Create: `src/app/project/[projectId]/admin/labor-tasks/page.tsx`

**Interfaces:**
- Consumes: `createProject` (Phase 1), `ActionResult`/`ValidationErr` (Task 2), `parseDerivedFrom` (existing, unmodified, from `@/lib/data/loadReferenceData`).
- Produces: `createProjectLaborTask(projectId, values)`, `updateProjectLaborTask(projectId, id, values)`, `deleteProjectLaborTask(projectId, id)`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/project/[projectId]/admin/labor-tasks/actions.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createProject } from '@/lib/project/createProject';
import { createProjectLaborTask, updateProjectLaborTask, deleteProjectLaborTask } from './actions';

describe('project labor task admin actions (integration — requires a live, seeded local Postgres)', () => {
  const projectIds: string[] = [];

  afterEach(async () => {
    for (const id of projectIds.splice(0)) {
      await prisma.project.deleteMany({ where: { id } });
    }
  });

  it('creates a labor task scoped to one project', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const result = await createProjectLaborTask(projectId, {
      key: 'test-proj-task-1', sheet: 'LOE', category: 'Test Category', name: 'Test Task',
      minutesPerUnit: '30', unit: 'Each', laborRole: 'Technician', includedInSubtotal: 'true',
    });
    expect(result.error).toBeUndefined();

    const created = await prisma.projectLaborTask.findUnique({
      where: { projectId_key: { projectId, key: 'test-proj-task-1' } },
    });
    expect(created).toMatchObject({ sheet: 'LOE', minutesPerUnit: 30, laborRole: 'Technician' });
  });

  it('allows the same key in two different projects', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const resultA = await createProjectLaborTask(projectA, {
      key: 'test-proj-task-shared', sheet: 'LOE', category: 'C', name: 'N',
      minutesPerUnit: '10', unit: 'Each', laborRole: 'Technician', includedInSubtotal: 'true',
    });
    const resultB = await createProjectLaborTask(projectB, {
      key: 'test-proj-task-shared', sheet: 'LOE', category: 'C', name: 'N',
      minutesPerUnit: '10', unit: 'Each', laborRole: 'Technician', includedInSubtotal: 'true',
    });
    expect(resultA.error).toBeUndefined();
    expect(resultB.error).toBeUndefined();
  });

  it('updates a labor task without affecting a different project', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    await createProjectLaborTask(projectA, {
      key: 'test-proj-task-update', sheet: 'LOE', category: 'C', name: 'Original',
      minutesPerUnit: '10', unit: 'Each', laborRole: 'Technician', includedInSubtotal: 'true',
    });
    await createProjectLaborTask(projectB, {
      key: 'test-proj-task-update', sheet: 'LOE', category: 'C', name: 'Original',
      minutesPerUnit: '10', unit: 'Each', laborRole: 'Technician', includedInSubtotal: 'true',
    });
    const rowA = await prisma.projectLaborTask.findUnique({
      where: { projectId_key: { projectId: projectA, key: 'test-proj-task-update' } },
    });

    const result = await updateProjectLaborTask(projectA, rowA!.id, {
      key: 'test-proj-task-update', sheet: 'SOW', category: 'C', name: 'Renamed',
      minutesPerUnit: '20', unit: 'Each', laborRole: 'RF_Engineer', includedInSubtotal: 'false',
    });
    expect(result.error).toBeUndefined();

    const updatedA = await prisma.projectLaborTask.findUnique({ where: { id: rowA!.id } });
    expect(updatedA).toMatchObject({ sheet: 'SOW', name: 'Renamed', minutesPerUnit: 20 });

    const untouchedB = await prisma.projectLaborTask.findUnique({
      where: { projectId_key: { projectId: projectB, key: 'test-proj-task-update' } },
    });
    expect(untouchedB).toMatchObject({ sheet: 'LOE', name: 'Original' });
  });

  it('deletes a labor task scoped to its own project', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const created = await prisma.projectLaborTask.create({
      data: {
        projectId, key: 'test-proj-task-delete', sheet: 'LOE', category: 'C', name: 'N',
        minutesPerUnit: 10, unit: 'Each', laborRole: 'Technician',
      },
    });

    const result = await deleteProjectLaborTask(projectId, created.id);
    expect(result.error).toBeUndefined();

    const gone = await prisma.projectLaborTask.findUnique({ where: { id: created.id } });
    expect(gone).toBeNull();
  });

  it('blocks deleting a task that another task in the same project derives its quantity from', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const base = await prisma.projectLaborTask.create({
      data: {
        projectId, key: 'test-proj-task-base', sheet: 'LOE', category: 'C', name: 'Base',
        minutesPerUnit: 10, unit: 'Each', laborRole: 'Technician',
      },
    });
    await prisma.projectLaborTask.create({
      data: {
        projectId, key: 'test-proj-task-derived', sheet: 'LOE', category: 'C', name: 'Derived',
        minutesPerUnit: 10, unit: 'Each', laborRole: 'Technician',
        derivedFromJson: { terms: [{ key: 'test-proj-task-base', coeff: 1 }], divisor: 1 },
      },
    });

    const result = await deleteProjectLaborTask(projectId, base.id);
    expect(result.error).toMatch(/referenced by the derived quantity formula/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "src/app/project/[projectId]/admin/labor-tasks/actions.test.ts"`
Expected: FAIL — `Cannot find module './actions'`.

- [ ] **Step 3: Implement the actions**

Create `src/app/project/[projectId]/admin/labor-tasks/actions.ts`:

```ts
'use server';

import { prisma } from '@/lib/db';
import { Prisma, type LaborRoleName, type LaborSheet } from '@prisma/client';
import { parseDerivedFrom } from '@/lib/data/loadReferenceData';
import { revalidatePath } from 'next/cache';
import type { ActionResult, ValidationErr } from '@/lib/admin/validation';

const VALID_SHEETS: LaborSheet[] = ['LOE', 'SOW'];
const VALID_ROLES: LaborRoleName[] = [
  'Technician', 'Construction_Manager', 'RF_Engineer', 'RF_Technician', 'Project_Coordinator', 'Project_Manager',
];

interface LaborTaskOk {
  ok: true;
  key: string;
  sheet: LaborSheet;
  category: string;
  name: string;
  minutesPerUnit: number;
  unit: string;
  laborRole: LaborRoleName;
  includedInSubtotal: boolean;
}

function validateLaborTaskValues(values: Record<string, string>): LaborTaskOk | ValidationErr {
  const key = values.key?.trim();
  if (!key) return { ok: false, error: 'Key is required.' };
  const sheet = values.sheet as LaborSheet;
  if (!VALID_SHEETS.includes(sheet)) return { ok: false, error: 'Sheet must be LOE or SOW.' };
  const category = values.category?.trim();
  if (!category) return { ok: false, error: 'Category is required.' };
  const name = values.name?.trim();
  if (!name) return { ok: false, error: 'Name is required.' };
  const minutesPerUnit = Number(values.minutesPerUnit);
  if (values.minutesPerUnit === undefined || values.minutesPerUnit === '' || Number.isNaN(minutesPerUnit) || minutesPerUnit < 0) {
    return { ok: false, error: 'Minutes per unit must be a non-negative number.' };
  }
  const unit = values.unit?.trim();
  if (!unit) return { ok: false, error: 'Unit is required.' };
  const laborRole = values.laborRole as LaborRoleName;
  if (!VALID_ROLES.includes(laborRole)) return { ok: false, error: 'Labor role is invalid.' };
  const includedInSubtotal = values.includedInSubtotal === 'true';
  return { ok: true, key, sheet, category, name, minutesPerUnit, unit, laborRole, includedInSubtotal };
}

export async function createProjectLaborTask(projectId: string, values: Record<string, string>): Promise<ActionResult> {
  const parsed = validateLaborTaskValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const existing = await prisma.projectLaborTask.findUnique({
    where: { projectId_key: { projectId, key: parsed.key } },
  });
  if (existing) return { error: `A labor task with key "${parsed.key}" already exists.` };

  try {
    await prisma.projectLaborTask.create({
      data: {
        projectId,
        key: parsed.key,
        sheet: parsed.sheet,
        category: parsed.category,
        name: parsed.name,
        minutesPerUnit: parsed.minutesPerUnit,
        unit: parsed.unit,
        laborRole: parsed.laborRole,
        includedInSubtotal: parsed.includedInSubtotal,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A labor task with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

export async function updateProjectLaborTask(projectId: string, id: string, values: Record<string, string>): Promise<ActionResult> {
  const parsed = validateLaborTaskValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const keyOwner = await prisma.projectLaborTask.findUnique({
    where: { projectId_key: { projectId, key: parsed.key } },
  });
  if (keyOwner && keyOwner.id !== id) return { error: `A labor task with key "${parsed.key}" already exists.` };

  try {
    const result = await prisma.projectLaborTask.updateMany({
      where: { id, projectId },
      data: {
        key: parsed.key,
        sheet: parsed.sheet,
        category: parsed.category,
        name: parsed.name,
        minutesPerUnit: parsed.minutesPerUnit,
        unit: parsed.unit,
        laborRole: parsed.laborRole,
        includedInSubtotal: parsed.includedInSubtotal,
      },
    });
    if (result.count === 0) return { error: 'Task not found in this project.' };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A labor task with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

export async function deleteProjectLaborTask(projectId: string, id: string): Promise<ActionResult> {
  const target = await prisma.projectLaborTask.findFirst({ where: { id, projectId } });
  if (!target) return { error: 'Task not found in this project.' };

  const allTasks = await prisma.projectLaborTask.findMany({
    where: { projectId },
    select: { key: true, derivedFromJson: true },
  });

  const referencingTasks: string[] = [];
  const unparseableTasks: string[] = [];
  for (const t of allTasks) {
    let derived: ReturnType<typeof parseDerivedFrom>;
    try {
      derived = parseDerivedFrom(t.derivedFromJson, t.key);
    } catch {
      unparseableTasks.push(t.key);
      continue;
    }
    if (derived?.terms.some((term) => term.key === target.key)) {
      referencingTasks.push(t.key);
    }
  }

  if (unparseableTasks.length > 0) {
    const names = unparseableTasks.join(', ');
    return { error: `Cannot verify it's safe to delete "${target.key}" — the following task(s) have malformed derivation data and could not be checked: ${names}. Fix their data first.` };
  }
  if (referencingTasks.length > 0) {
    const names = referencingTasks.join(', ');
    return { error: `Cannot delete "${target.key}" — it is referenced by the derived quantity formula of: ${names}.` };
  }

  await prisma.projectLaborTask.deleteMany({ where: { id, projectId } });
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "src/app/project/[projectId]/admin/labor-tasks/actions.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 5: Implement the client component**

Create `src/app/project/[projectId]/admin/labor-tasks/LaborTasksAdminClient.tsx`:

```tsx
'use client';

import type { LaborRoleName, LaborSheet } from '@prisma/client';
import { AdminTable, type AdminColumn } from '@/components/admin/AdminTable';
import { parseDerivedFrom } from '@/lib/data/loadReferenceData';
import { createProjectLaborTask, updateProjectLaborTask, deleteProjectLaborTask } from './actions';

interface ProjectLaborTaskRow {
  id: string;
  key: string;
  sheet: LaborSheet;
  category: string;
  name: string;
  minutesPerUnit: number;
  unit: string;
  laborRole: LaborRoleName;
  includedInSubtotal: boolean;
  derivedFromJson: unknown;
}

const SHEET_OPTIONS = [
  { value: 'LOE', label: 'LOE' },
  { value: 'SOW', label: 'SOW' },
];

const ROLE_OPTIONS: { value: LaborRoleName; label: string }[] = [
  { value: 'Technician', label: 'Technician' },
  { value: 'Construction_Manager', label: 'Construction Manager' },
  { value: 'RF_Engineer', label: 'RF-Engineer' },
  { value: 'RF_Technician', label: 'RF-Technician' },
  { value: 'Project_Coordinator', label: 'Project Coordinator' },
  { value: 'Project_Manager', label: 'Project Manager' },
];

function formatDerivation(row: ProjectLaborTaskRow): string {
  try {
    const derived = parseDerivedFrom(row.derivedFromJson, row.key);
    if (!derived) return '—';
    const termsText = derived.terms.map((t) => (t.coeff === 1 ? t.key : `${t.coeff}×${t.key}`)).join(' + ');
    return derived.divisor === 1 ? `= ${termsText}` : `= (${termsText}) ÷ ${derived.divisor}`;
  } catch {
    return '⚠ malformed';
  }
}

const columns: AdminColumn<ProjectLaborTaskRow>[] = [
  { key: 'key', label: 'Key', type: 'text', required: true },
  { key: 'sheet', label: 'Sheet', type: 'select', options: SHEET_OPTIONS, required: true },
  { key: 'category', label: 'Category', type: 'text', required: true },
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'minutesPerUnit', label: 'Minutes/Unit', type: 'number', align: 'right', required: true },
  { key: 'unit', label: 'Unit', type: 'text', required: true },
  { key: 'laborRole', label: 'Labor Role', type: 'select', options: ROLE_OPTIONS, required: true },
  { key: 'includedInSubtotal', label: 'In Subtotal', type: 'checkbox' },
  { key: 'derivedFromJson', label: 'Derived Quantity', type: 'readonly', format: formatDerivation },
];

const emptyValues = {
  key: '', sheet: 'LOE', category: '', name: '', minutesPerUnit: '0', unit: '',
  laborRole: 'Technician', includedInSubtotal: 'false',
};

export function LaborTasksAdminClient({ projectId, rows }: { projectId: string; rows: ProjectLaborTaskRow[] }) {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold tracking-tight text-navy">Labor Task Library</h1>
      <AdminTable<ProjectLaborTaskRow>
        columns={columns}
        rows={rows}
        onCreate={(values) => createProjectLaborTask(projectId, values)}
        onUpdate={(id, values) => updateProjectLaborTask(projectId, id, values)}
        onDelete={(id) => deleteProjectLaborTask(projectId, id)}
        emptyValues={emptyValues}
        searchable
        searchPlaceholder="Search key, category, name…"
        maxBodyHeightClassName="max-h-[32rem]"
      />
    </div>
  );
}
```

- [ ] **Step 6: Implement the page**

Create `src/app/project/[projectId]/admin/labor-tasks/page.tsx`:

```tsx
import { prisma } from '@/lib/db';
import { LaborTasksAdminClient } from './LaborTasksAdminClient';

export default async function ProjectLaborTasksAdminPage({ params }: { params: { projectId: string } }) {
  const tasks = await prisma.projectLaborTask.findMany({
    where: { projectId: params.projectId },
    orderBy: [{ sheet: 'asc' }, { category: 'asc' }, { key: 'asc' }],
  });
  return <LaborTasksAdminClient projectId={params.projectId} rows={tasks} />;
}
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add "src/app/project/[projectId]/admin/labor-tasks"
git commit -m "feat: add per-project Labor Tasks admin section"
```

---

### Task 5: Per-project Rates admin

**Files:**
- Create: `src/app/project/[projectId]/admin/rates/actions.ts`
- Test: `src/app/project/[projectId]/admin/rates/actions.test.ts`
- Create: `src/app/project/[projectId]/admin/rates/LaborRatesSection.tsx`
- Create: `src/app/project/[projectId]/admin/rates/CrewSizeSection.tsx`
- Modify: `src/app/admin/(sections)/rates/LaborProjectionSettingsForm.tsx` (genericize to accept `onSave` as a prop)
- Modify: `src/app/admin/(sections)/rates/page.tsx:18` (pass `onSave={updateLaborProjectionSettings}` explicitly)
- Create: `src/app/project/[projectId]/admin/rates/page.tsx`

**Interfaces:**
- Consumes: `createProject` (Phase 1), `ActionResult`/`ValidationErr`/`parseNonNegative`/`parsePercent`/`parseNonNegativeInt` (Task 2), the now-generic `LaborProjectionSettingsForm`.
- Produces: `updateProjectLaborRate(projectId, id, values)`, `updateProjectCrewSizeRow(projectId, id, values)`, `updateProjectLaborProjectionSettings(projectId, values)`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/project/[projectId]/admin/rates/actions.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createProject } from '@/lib/project/createProject';
import { updateProjectLaborRate, updateProjectCrewSizeRow, updateProjectLaborProjectionSettings } from './actions';

describe('project rates admin actions (integration — requires a live, seeded local Postgres)', () => {
  const projectIds: string[] = [];

  afterEach(async () => {
    for (const id of projectIds.splice(0)) {
      await prisma.project.deleteMany({ where: { id } });
    }
  });

  it('updates a labor rate without affecting a different project', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const rateA = await prisma.projectLaborRate.findUnique({
      where: { projectId_role: { projectId: projectA, role: 'Technician' } },
    });
    const rateB = await prisma.projectLaborRate.findUnique({
      where: { projectId_role: { projectId: projectB, role: 'Technician' } },
    });

    const result = await updateProjectLaborRate(projectA, rateA!.id, { hourlyRate: '999', rawWageRate: '888' });
    expect(result.error).toBeUndefined();

    const updatedA = await prisma.projectLaborRate.findUnique({ where: { id: rateA!.id } });
    expect(updatedA).toMatchObject({ hourlyRate: 999, rawWageRate: 888 });

    const untouchedB = await prisma.projectLaborRate.findUnique({ where: { id: rateB!.id } });
    expect(untouchedB!.hourlyRate).not.toBe(999);
  });

  it('rejects a negative hourly rate', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);
    const rate = await prisma.projectLaborRate.findUnique({
      where: { projectId_role: { projectId, role: 'Technician' } },
    });

    const result = await updateProjectLaborRate(projectId, rate!.id, { hourlyRate: '-5', rawWageRate: '10' });
    expect(result.error).toMatch(/non-negative/);
  });

  it('updates a crew-size row without affecting a different project', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const rowA = await prisma.projectCrewSizeRow.findUnique({
      where: { projectId_technicianCount: { projectId: projectA, technicianCount: 4 } },
    });
    const rowB = await prisma.projectCrewSizeRow.findUnique({
      where: { projectId_technicianCount: { projectId: projectB, technicianCount: 4 } },
    });

    const result = await updateProjectCrewSizeRow(projectA, rowA!.id, { cmsNeeded: '9' });
    expect(result.error).toBeUndefined();

    const updatedA = await prisma.projectCrewSizeRow.findUnique({ where: { id: rowA!.id } });
    expect(updatedA!.cmsNeeded).toBe(9);

    const untouchedB = await prisma.projectCrewSizeRow.findUnique({ where: { id: rowB!.id } });
    expect(untouchedB!.cmsNeeded).not.toBe(9);
  });

  it('updates labor projection settings without affecting a different project', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const result = await updateProjectLaborProjectionSettings(projectA, {
      hoursPerManDay: '10', hoursPerManWeek: '50', stagingMaterialMultiplier: '10',
      cmPercentOfTechHours: '60', pmPercentOfTechHours: '30', coordinatorPercentOfTechHours: '20',
    });
    expect(result.error).toBeUndefined();

    const updatedA = await prisma.projectLaborProjectionSettings.findUnique({ where: { projectId: projectA } });
    expect(updatedA).toMatchObject({ hoursPerManDay: 10, hoursPerManWeek: 50 });

    const untouchedB = await prisma.projectLaborProjectionSettings.findUnique({ where: { projectId: projectB } });
    expect(untouchedB!.hoursPerManDay).not.toBe(10);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "src/app/project/[projectId]/admin/rates/actions.test.ts"`
Expected: FAIL — `Cannot find module './actions'`.

- [ ] **Step 3: Implement the actions**

Create `src/app/project/[projectId]/admin/rates/actions.ts`:

```ts
'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { parseNonNegative, parsePercent, parseNonNegativeInt, type ActionResult, type ValidationErr } from '@/lib/admin/validation';

export async function updateProjectLaborRate(projectId: string, id: string, values: Record<string, string>): Promise<ActionResult> {
  const hourlyRate = parseNonNegative(values.hourlyRate);
  if (hourlyRate === null) return { error: 'Hourly rate must be a non-negative number.' };
  const rawWageRate = parseNonNegative(values.rawWageRate);
  if (rawWageRate === null) return { error: 'Raw wage rate must be a non-negative number.' };

  const result = await prisma.projectLaborRate.updateMany({
    where: { id, projectId },
    data: { hourlyRate, rawWageRate },
  });
  if (result.count === 0) return { error: 'Rate not found in this project.' };
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

export async function updateProjectCrewSizeRow(projectId: string, id: string, values: Record<string, string>): Promise<ActionResult> {
  const cmsNeeded = parseNonNegativeInt(values.cmsNeeded);
  if (cmsNeeded === null) return { error: 'CMs needed must be a non-negative whole number.' };

  const result = await prisma.projectCrewSizeRow.updateMany({
    where: { id, projectId },
    data: { cmsNeeded },
  });
  if (result.count === 0) return { error: 'Row not found in this project.' };
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

interface SettingsOk {
  ok: true;
  hoursPerManDay: number;
  hoursPerManWeek: number;
  stagingMaterialMultiplier: number;
  cmPercentOfTechHours: number;
  pmPercentOfTechHours: number;
  coordinatorPercentOfTechHours: number;
}

function validateSettingsValues(values: Record<string, string>): SettingsOk | ValidationErr {
  const hoursPerManDay = parseNonNegative(values.hoursPerManDay);
  if (hoursPerManDay === null) return { ok: false, error: 'Hours per man-day must be a non-negative number.' };
  const hoursPerManWeek = parseNonNegative(values.hoursPerManWeek);
  if (hoursPerManWeek === null) return { ok: false, error: 'Hours per man-week must be a non-negative number.' };
  const stagingMaterialMultiplier = parsePercent(values.stagingMaterialMultiplier);
  if (stagingMaterialMultiplier === null) return { ok: false, error: 'Staging/material multiplier must be 0-100%.' };
  const cmPercentOfTechHours = parsePercent(values.cmPercentOfTechHours);
  if (cmPercentOfTechHours === null) return { ok: false, error: 'Construction Manager % must be 0-100%.' };
  const pmPercentOfTechHours = parsePercent(values.pmPercentOfTechHours);
  if (pmPercentOfTechHours === null) return { ok: false, error: 'Project Manager % must be 0-100%.' };
  const coordinatorPercentOfTechHours = parsePercent(values.coordinatorPercentOfTechHours);
  if (coordinatorPercentOfTechHours === null) return { ok: false, error: 'Project Coordinator % must be 0-100%.' };
  return {
    ok: true,
    hoursPerManDay,
    hoursPerManWeek,
    stagingMaterialMultiplier,
    cmPercentOfTechHours,
    pmPercentOfTechHours,
    coordinatorPercentOfTechHours,
  };
}

export async function updateProjectLaborProjectionSettings(projectId: string, values: Record<string, string>): Promise<ActionResult> {
  const parsed = validateSettingsValues(values);
  if (!parsed.ok) return { error: parsed.error };

  await prisma.projectLaborProjectionSettings.update({
    where: { projectId },
    data: {
      hoursPerManDay: parsed.hoursPerManDay,
      hoursPerManWeek: parsed.hoursPerManWeek,
      stagingMaterialMultiplier: parsed.stagingMaterialMultiplier,
      cmPercentOfTechHours: parsed.cmPercentOfTechHours,
      pmPercentOfTechHours: parsed.pmPercentOfTechHours,
      coordinatorPercentOfTechHours: parsed.coordinatorPercentOfTechHours,
    },
  });
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "src/app/project/[projectId]/admin/rates/actions.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement `LaborRatesSection` and `CrewSizeSection`**

Create `src/app/project/[projectId]/admin/rates/LaborRatesSection.tsx`:

```tsx
'use client';

import type { LaborRoleName } from '@prisma/client';
import { AdminTable, type AdminColumn } from '@/components/admin/AdminTable';
import { formatCurrency } from '@/lib/utils/formatCurrency';
import { updateProjectLaborRate } from './actions';

interface ProjectLaborRateRow {
  id: string;
  role: LaborRoleName;
  hourlyRate: number;
  rawWageRate: number;
}

const ROLE_LABELS: Record<string, string> = {
  Technician: 'Technician',
  Construction_Manager: 'Construction Manager',
  RF_Engineer: 'RF-Engineer',
  RF_Technician: 'RF-Technician',
  Project_Coordinator: 'Project Coordinator',
  Project_Manager: 'Project Manager',
};

function formatHourly(amount: number): string {
  return `${formatCurrency(amount)}/hr`;
}

const columns: AdminColumn<ProjectLaborRateRow>[] = [
  { key: 'role', label: 'Role', type: 'readonly', format: (row) => ROLE_LABELS[row.role] ?? row.role },
  { key: 'hourlyRate', label: 'Hourly (Billing) Rate', type: 'number', align: 'right', required: true, format: (row) => formatHourly(row.hourlyRate) },
  { key: 'rawWageRate', label: 'Raw Wage Rate', type: 'number', align: 'right', required: true, format: (row) => formatHourly(row.rawWageRate) },
];

export function LaborRatesSection({ projectId, rows }: { projectId: string; rows: ProjectLaborRateRow[] }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-semibold text-navy">Labor Rates</h2>
      <AdminTable<ProjectLaborRateRow>
        columns={columns}
        rows={rows}
        onUpdate={(id, values) => updateProjectLaborRate(projectId, id, values)}
      />
    </section>
  );
}
```

Create `src/app/project/[projectId]/admin/rates/CrewSizeSection.tsx`:

```tsx
'use client';

import { AdminTable, type AdminColumn } from '@/components/admin/AdminTable';
import { updateProjectCrewSizeRow } from './actions';

interface ProjectCrewSizeRow {
  id: string;
  technicianCount: number;
  cmsNeeded: number;
}

const columns: AdminColumn<ProjectCrewSizeRow>[] = [
  { key: 'technicianCount', label: 'Technicians', type: 'readonly' },
  { key: 'cmsNeeded', label: 'CMs Needed', type: 'number', align: 'right', required: true },
];

export function CrewSizeSection({ projectId, rows }: { projectId: string; rows: ProjectCrewSizeRow[] }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-semibold text-navy">Crew-Size Table</h2>
      <AdminTable<ProjectCrewSizeRow>
        columns={columns}
        rows={rows}
        onUpdate={(id, values) => updateProjectCrewSizeRow(projectId, id, values)}
      />
    </section>
  );
}
```

- [ ] **Step 6: Genericize `LaborProjectionSettingsForm`**

Replace the entire contents of `src/app/admin/(sections)/rates/LaborProjectionSettingsForm.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface SettingsShape {
  hoursPerManDay: number;
  hoursPerManWeek: number;
  stagingMaterialMultiplier: number;
  cmPercentOfTechHours: number;
  pmPercentOfTechHours: number;
  coordinatorPercentOfTechHours: number;
}

function toDisplayValues(settings: SettingsShape): Record<string, string> {
  return {
    hoursPerManDay: String(settings.hoursPerManDay),
    hoursPerManWeek: String(settings.hoursPerManWeek),
    stagingMaterialMultiplier: String(settings.stagingMaterialMultiplier * 100),
    cmPercentOfTechHours: String(settings.cmPercentOfTechHours * 100),
    pmPercentOfTechHours: String(settings.pmPercentOfTechHours * 100),
    coordinatorPercentOfTechHours: String(settings.coordinatorPercentOfTechHours * 100),
  };
}

const FIELDS: { key: string; label: string; suffix: string }[] = [
  { key: 'hoursPerManDay', label: 'Hours per Man-Day', suffix: 'hrs' },
  { key: 'hoursPerManWeek', label: 'Hours per Man-Week', suffix: 'hrs' },
  { key: 'stagingMaterialMultiplier', label: 'Staging/Material Time Multiplier', suffix: '%' },
  { key: 'cmPercentOfTechHours', label: 'Construction Manager % of Tech Hours', suffix: '%' },
  { key: 'pmPercentOfTechHours', label: 'Project Manager % of Tech Hours', suffix: '%' },
  { key: 'coordinatorPercentOfTechHours', label: 'Project Coordinator % of Tech Hours', suffix: '%' },
];

export function LaborProjectionSettingsForm({
  settings,
  onSave,
}: {
  settings: SettingsShape;
  onSave: (values: Record<string, string>) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(toDisplayValues(settings));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSave() {
    setPending(true);
    setError(null);
    const result = await onSave(values);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-semibold text-navy">Labor Projection Settings</h2>
      <div className="bg-white rounded-lg shadow p-4 space-y-3 max-w-md">
        {error && <p className="text-red-700 text-sm">{error}</p>}
        {FIELDS.map((field) => (
          <label key={field.key} className="flex items-center justify-between gap-4">
            <span className="text-slate">{field.label}</span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                className="w-24 border border-line rounded px-2 py-1 text-right"
                value={values[field.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              />
              <span className="text-slate text-sm">{field.suffix}</span>
            </span>
          </label>
        ))}
        <button
          disabled={pending}
          onClick={handleSave}
          className="bg-red hover:bg-red-700 text-white font-display font-semibold px-4 py-2 rounded transition-colors"
        >
          Save
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Update the master admin's call site**

In `src/app/admin/(sections)/rates/page.tsx`, replace:

```tsx
      <LaborProjectionSettingsForm settings={settings} />
```

with:

```tsx
      <LaborProjectionSettingsForm settings={settings} onSave={updateLaborProjectionSettings} />
```

And add the import at the top of the file:

```tsx
import { updateLaborProjectionSettings } from './actions';
```

- [ ] **Step 8: Implement the per-project page**

Create `src/app/project/[projectId]/admin/rates/page.tsx`:

```tsx
import { prisma } from '@/lib/db';
import { LaborRatesSection } from './LaborRatesSection';
import { CrewSizeSection } from './CrewSizeSection';
import { LaborProjectionSettingsForm } from '@/app/admin/(sections)/rates/LaborProjectionSettingsForm';
import { updateProjectLaborProjectionSettings } from './actions';

export default async function ProjectRatesAdminPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const [laborRates, crewSizeRows, settings] = await Promise.all([
    prisma.projectLaborRate.findMany({ where: { projectId }, orderBy: { role: 'asc' } }),
    prisma.projectCrewSizeRow.findMany({ where: { projectId }, orderBy: { technicianCount: 'asc' } }),
    prisma.projectLaborProjectionSettings.findUniqueOrThrow({ where: { projectId } }),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-navy">Rates</h1>
      <LaborRatesSection projectId={projectId} rows={laborRates} />
      <CrewSizeSection projectId={projectId} rows={crewSizeRows} />
      <LaborProjectionSettingsForm
        settings={settings}
        onSave={(values) => updateProjectLaborProjectionSettings(projectId, values)}
      />
    </div>
  );
}
```

- [ ] **Step 9: Run the master admin's existing tests, then type-check**

Run: `npx vitest run "src/app/admin/(sections)/rates"`
Expected: PASS — unchanged behavior, only the form's prop wiring changed.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add "src/app/project/[projectId]/admin/rates" "src/app/admin/(sections)/rates/LaborProjectionSettingsForm.tsx" "src/app/admin/(sections)/rates/page.tsx"
git commit -m "feat: add per-project Rates admin section, genericize LaborProjectionSettingsForm"
```

---

### Task 6: Per-project Pass Throughs admin

**Files:**
- Create: `src/app/project/[projectId]/admin/pass-throughs/actions.ts`
- Test: `src/app/project/[projectId]/admin/pass-throughs/actions.test.ts`
- Create: `src/app/project/[projectId]/admin/pass-throughs/PassThroughRatesSection.tsx`
- Create: `src/app/project/[projectId]/admin/pass-throughs/RentalsSection.tsx`
- Create: `src/app/project/[projectId]/admin/pass-throughs/SoftCostsSection.tsx`
- Create: `src/app/project/[projectId]/admin/pass-throughs/page.tsx`

**Interfaces:**
- Consumes: `createProject` (Phase 1), `ActionResult`/`ValidationErr`/`parseNonNegative` (Task 2).
- Produces: `updateProjectPassThroughRoleRate(projectId, id, values)`, `createProjectRental(projectId, values)`, `updateProjectRental(projectId, id, values)`, `deleteProjectRental(projectId, id)`, `createProjectSoftCost(projectId, values)`, `updateProjectSoftCost(projectId, id, values)`, `deleteProjectSoftCost(projectId, id)`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/project/[projectId]/admin/pass-throughs/actions.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createProject } from '@/lib/project/createProject';
import {
  updateProjectPassThroughRoleRate, createProjectRental, updateProjectRental, deleteProjectRental,
  createProjectSoftCost, updateProjectSoftCost, deleteProjectSoftCost,
} from './actions';

describe('project pass-throughs admin actions (integration — requires a live, seeded local Postgres)', () => {
  const projectIds: string[] = [];

  afterEach(async () => {
    for (const id of projectIds.splice(0)) {
      await prisma.project.deleteMany({ where: { id } });
    }
  });

  it('updates a pass-through role rate without affecting a different project', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const rateA = await prisma.projectPassThroughRoleRate.findFirst({ where: { projectId: projectA, kind: 'PerDiem' } });
    const rateB = await prisma.projectPassThroughRoleRate.findFirst({ where: { projectId: projectB, kind: 'PerDiem', role: rateA!.role } });

    const result = await updateProjectPassThroughRoleRate(projectA, rateA!.id, { amount: '999' });
    expect(result.error).toBeUndefined();

    const updatedA = await prisma.projectPassThroughRoleRate.findUnique({ where: { id: rateA!.id } });
    expect(updatedA!.amount).toBe(999);

    const untouchedB = await prisma.projectPassThroughRoleRate.findUnique({ where: { id: rateB!.id } });
    expect(untouchedB!.amount).not.toBe(999);
  });

  it('creates, updates, and deletes a rental scoped to one project', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const created = await createProjectRental(projectId, { key: 'test-proj-rental-1', name: 'Test Rental', rate: '50', unit: 'day' });
    expect(created.error).toBeUndefined();

    const row = await prisma.projectRentalRate.findUnique({ where: { projectId_key: { projectId, key: 'test-proj-rental-1' } } });
    expect(row).toMatchObject({ name: 'Test Rental', rate: 50 });

    const updated = await updateProjectRental(projectId, row!.id, { key: 'test-proj-rental-1', name: 'Renamed', rate: '75', unit: 'day' });
    expect(updated.error).toBeUndefined();
    const afterUpdate = await prisma.projectRentalRate.findUnique({ where: { id: row!.id } });
    expect(afterUpdate).toMatchObject({ name: 'Renamed', rate: 75 });

    const deleted = await deleteProjectRental(projectId, row!.id);
    expect(deleted.error).toBeUndefined();
    const gone = await prisma.projectRentalRate.findUnique({ where: { id: row!.id } });
    expect(gone).toBeNull();
  });

  it('allows the same rental key in two different projects', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const resultA = await createProjectRental(projectA, { key: 'test-proj-rental-shared', name: 'N', rate: '1', unit: 'day' });
    const resultB = await createProjectRental(projectB, { key: 'test-proj-rental-shared', name: 'N', rate: '1', unit: 'day' });
    expect(resultA.error).toBeUndefined();
    expect(resultB.error).toBeUndefined();
  });

  it('creates, updates, and deletes a soft cost scoped to one project', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const created = await createProjectSoftCost(projectId, { key: 'test-proj-softcost-1', name: 'Test Soft Cost', fee: '25' });
    expect(created.error).toBeUndefined();

    const row = await prisma.projectSoftCostRate.findUnique({ where: { projectId_key: { projectId, key: 'test-proj-softcost-1' } } });
    expect(row).toMatchObject({ name: 'Test Soft Cost', fee: 25 });

    const updated = await updateProjectSoftCost(projectId, row!.id, { key: 'test-proj-softcost-1', name: 'Renamed', fee: '40' });
    expect(updated.error).toBeUndefined();
    const afterUpdate = await prisma.projectSoftCostRate.findUnique({ where: { id: row!.id } });
    expect(afterUpdate).toMatchObject({ name: 'Renamed', fee: 40 });

    const deleted = await deleteProjectSoftCost(projectId, row!.id);
    expect(deleted.error).toBeUndefined();
    const gone = await prisma.projectSoftCostRate.findUnique({ where: { id: row!.id } });
    expect(gone).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "src/app/project/[projectId]/admin/pass-throughs/actions.test.ts"`
Expected: FAIL — `Cannot find module './actions'`.

- [ ] **Step 3: Implement the actions**

Create `src/app/project/[projectId]/admin/pass-throughs/actions.ts`:

```ts
'use server';

import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { parseNonNegative, type ActionResult, type ValidationErr } from '@/lib/admin/validation';

export async function updateProjectPassThroughRoleRate(projectId: string, id: string, values: Record<string, string>): Promise<ActionResult> {
  const amount = parseNonNegative(values.amount);
  if (amount === null) return { error: 'Amount must be a non-negative number.' };

  const result = await prisma.projectPassThroughRoleRate.updateMany({
    where: { id, projectId },
    data: { amount },
  });
  if (result.count === 0) return { error: 'Rate not found in this project.' };
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

interface RentalOk {
  ok: true;
  key: string;
  name: string;
  rate: number;
  unit: string;
}

function validateRentalValues(values: Record<string, string>): RentalOk | ValidationErr {
  const key = values.key?.trim();
  if (!key) return { ok: false, error: 'Key is required.' };
  const name = values.name?.trim();
  if (!name) return { ok: false, error: 'Name is required.' };
  const rate = parseNonNegative(values.rate);
  if (rate === null) return { ok: false, error: 'Rate must be a non-negative number.' };
  const unit = values.unit?.trim();
  if (!unit) return { ok: false, error: 'Billing unit is required.' };
  return { ok: true, key, name, rate, unit };
}

export async function createProjectRental(projectId: string, values: Record<string, string>): Promise<ActionResult> {
  const parsed = validateRentalValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const existing = await prisma.projectRentalRate.findUnique({
    where: { projectId_key: { projectId, key: parsed.key } },
  });
  if (existing) return { error: `A rental with key "${parsed.key}" already exists.` };

  try {
    await prisma.projectRentalRate.create({
      data: { projectId, key: parsed.key, name: parsed.name, rate: parsed.rate, unit: parsed.unit },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A rental with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

export async function updateProjectRental(projectId: string, id: string, values: Record<string, string>): Promise<ActionResult> {
  const parsed = validateRentalValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const keyOwner = await prisma.projectRentalRate.findUnique({
    where: { projectId_key: { projectId, key: parsed.key } },
  });
  if (keyOwner && keyOwner.id !== id) return { error: `A rental with key "${parsed.key}" already exists.` };

  try {
    const result = await prisma.projectRentalRate.updateMany({
      where: { id, projectId },
      data: { key: parsed.key, name: parsed.name, rate: parsed.rate, unit: parsed.unit },
    });
    if (result.count === 0) return { error: 'Rental not found in this project.' };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A rental with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

export async function deleteProjectRental(projectId: string, id: string): Promise<ActionResult> {
  await prisma.projectRentalRate.deleteMany({ where: { id, projectId } });
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

interface SoftCostOk {
  ok: true;
  key: string;
  name: string;
  fee: number;
}

function validateSoftCostValues(values: Record<string, string>): SoftCostOk | ValidationErr {
  const key = values.key?.trim();
  if (!key) return { ok: false, error: 'Key is required.' };
  const name = values.name?.trim();
  if (!name) return { ok: false, error: 'Name is required.' };
  const fee = parseNonNegative(values.fee);
  if (fee === null) return { ok: false, error: 'Fee must be a non-negative number.' };
  return { ok: true, key, name, fee };
}

export async function createProjectSoftCost(projectId: string, values: Record<string, string>): Promise<ActionResult> {
  const parsed = validateSoftCostValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const existing = await prisma.projectSoftCostRate.findUnique({
    where: { projectId_key: { projectId, key: parsed.key } },
  });
  if (existing) return { error: `A soft cost with key "${parsed.key}" already exists.` };

  try {
    await prisma.projectSoftCostRate.create({
      data: { projectId, key: parsed.key, name: parsed.name, fee: parsed.fee },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A soft cost with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

export async function updateProjectSoftCost(projectId: string, id: string, values: Record<string, string>): Promise<ActionResult> {
  const parsed = validateSoftCostValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const keyOwner = await prisma.projectSoftCostRate.findUnique({
    where: { projectId_key: { projectId, key: parsed.key } },
  });
  if (keyOwner && keyOwner.id !== id) return { error: `A soft cost with key "${parsed.key}" already exists.` };

  try {
    const result = await prisma.projectSoftCostRate.updateMany({
      where: { id, projectId },
      data: { key: parsed.key, name: parsed.name, fee: parsed.fee },
    });
    if (result.count === 0) return { error: 'Soft cost not found in this project.' };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A soft cost with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

export async function deleteProjectSoftCost(projectId: string, id: string): Promise<ActionResult> {
  await prisma.projectSoftCostRate.deleteMany({ where: { id, projectId } });
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "src/app/project/[projectId]/admin/pass-throughs/actions.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 5: Implement the three section components**

Create `src/app/project/[projectId]/admin/pass-throughs/PassThroughRatesSection.tsx`:

```tsx
'use client';

import type { LaborRoleName, PassThroughRateKind } from '@prisma/client';
import { AdminTable, type AdminColumn } from '@/components/admin/AdminTable';
import { formatCurrency } from '@/lib/utils/formatCurrency';
import { updateProjectPassThroughRoleRate } from './actions';

interface ProjectPassThroughRoleRateRow {
  id: string;
  kind: PassThroughRateKind;
  role: LaborRoleName;
  amount: number;
}

const ROLE_LABELS: Record<string, string> = {
  Technician: 'Technician',
  Construction_Manager: 'Construction Manager',
  RF_Engineer: 'RF-Engineer',
  RF_Technician: 'RF-Technician',
  Project_Coordinator: 'Project Coordinator',
  Project_Manager: 'Project Manager',
};

const columns: AdminColumn<ProjectPassThroughRoleRateRow>[] = [
  { key: 'kind', label: 'Kind', type: 'readonly' },
  { key: 'role', label: 'Role', type: 'readonly', format: (row) => ROLE_LABELS[row.role] ?? row.role },
  { key: 'amount', label: 'Amount', type: 'number', align: 'right', required: true, format: (row) => formatCurrency(row.amount) },
];

export function PassThroughRatesSection({ projectId, rows }: { projectId: string; rows: ProjectPassThroughRoleRateRow[] }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-semibold text-navy">Per Diem / Lodging / Airfare Rates</h2>
      <AdminTable<ProjectPassThroughRoleRateRow>
        columns={columns}
        rows={rows}
        onUpdate={(id, values) => updateProjectPassThroughRoleRate(projectId, id, values)}
      />
    </section>
  );
}
```

Create `src/app/project/[projectId]/admin/pass-throughs/RentalsSection.tsx`:

```tsx
'use client';

import { AdminTable, type AdminColumn } from '@/components/admin/AdminTable';
import { formatCurrency } from '@/lib/utils/formatCurrency';
import { createProjectRental, updateProjectRental, deleteProjectRental } from './actions';

interface ProjectRentalRateRow {
  id: string;
  key: string;
  name: string;
  rate: number;
  unit: string;
}

const columns: AdminColumn<ProjectRentalRateRow>[] = [
  { key: 'key', label: 'Key', type: 'text', required: true },
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'rate', label: 'Rate', type: 'number', align: 'right', required: true, format: (row) => formatCurrency(row.rate) },
  { key: 'unit', label: 'Billing Unit', type: 'text', required: true },
];

const emptyValues = { key: '', name: '', rate: '0', unit: '' };

export function RentalsSection({ projectId, rows }: { projectId: string; rows: ProjectRentalRateRow[] }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-semibold text-navy">Rentals</h2>
      <AdminTable<ProjectRentalRateRow>
        columns={columns}
        rows={rows}
        onCreate={(values) => createProjectRental(projectId, values)}
        onUpdate={(id, values) => updateProjectRental(projectId, id, values)}
        onDelete={(id) => deleteProjectRental(projectId, id)}
        emptyValues={emptyValues}
      />
    </section>
  );
}
```

Create `src/app/project/[projectId]/admin/pass-throughs/SoftCostsSection.tsx`:

```tsx
'use client';

import { AdminTable, type AdminColumn } from '@/components/admin/AdminTable';
import { formatCurrency } from '@/lib/utils/formatCurrency';
import { createProjectSoftCost, updateProjectSoftCost, deleteProjectSoftCost } from './actions';

interface ProjectSoftCostRateRow {
  id: string;
  key: string;
  name: string;
  fee: number;
}

const columns: AdminColumn<ProjectSoftCostRateRow>[] = [
  { key: 'key', label: 'Key', type: 'text', required: true },
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'fee', label: 'Fee', type: 'number', align: 'right', required: true, format: (row) => formatCurrency(row.fee) },
];

const emptyValues = { key: '', name: '', fee: '0' };

export function SoftCostsSection({ projectId, rows }: { projectId: string; rows: ProjectSoftCostRateRow[] }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-semibold text-navy">Soft Costs</h2>
      <AdminTable<ProjectSoftCostRateRow>
        columns={columns}
        rows={rows}
        onCreate={(values) => createProjectSoftCost(projectId, values)}
        onUpdate={(id, values) => updateProjectSoftCost(projectId, id, values)}
        onDelete={(id) => deleteProjectSoftCost(projectId, id)}
        emptyValues={emptyValues}
      />
    </section>
  );
}
```

- [ ] **Step 6: Implement the page**

Create `src/app/project/[projectId]/admin/pass-throughs/page.tsx`:

```tsx
import { prisma } from '@/lib/db';
import { PassThroughRatesSection } from './PassThroughRatesSection';
import { RentalsSection } from './RentalsSection';
import { SoftCostsSection } from './SoftCostsSection';

export default async function ProjectPassThroughsAdminPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const [roleRates, rentals, softCosts] = await Promise.all([
    prisma.projectPassThroughRoleRate.findMany({ where: { projectId }, orderBy: [{ kind: 'asc' }, { role: 'asc' }] }),
    prisma.projectRentalRate.findMany({ where: { projectId }, orderBy: { key: 'asc' } }),
    prisma.projectSoftCostRate.findMany({ where: { projectId }, orderBy: { key: 'asc' } }),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-navy">Pass Throughs</h1>
      <PassThroughRatesSection projectId={projectId} rows={roleRates} />
      <RentalsSection projectId={projectId} rows={rentals} />
      <SoftCostsSection projectId={projectId} rows={softCosts} />
    </div>
  );
}
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add "src/app/project/[projectId]/admin/pass-throughs"
git commit -m "feat: add per-project Pass Throughs admin section"
```

---

### Task 7: Per-project Defaults admin

**Files:**
- Create: `src/app/project/[projectId]/admin/defaults/actions.ts`
- Test: `src/app/project/[projectId]/admin/defaults/actions.test.ts`
- Modify: `src/app/admin/(sections)/defaults/EstimateDefaultsForm.tsx` (genericize to accept `onSave` as a prop)
- Modify: `src/app/admin/(sections)/defaults/page.tsx` (pass `onSave={updateEstimateDefaults}` explicitly)
- Create: `src/app/project/[projectId]/admin/defaults/page.tsx`

**Interfaces:**
- Consumes: `createProject` (Phase 1), `ActionResult`/`ValidationErr` (Task 2), the now-generic `EstimateDefaultsForm`.
- Produces: `updateProjectEstimateDefaults(projectId, values)`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/project/[projectId]/admin/defaults/actions.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createProject } from '@/lib/project/createProject';
import { updateProjectEstimateDefaults } from './actions';

describe('project defaults admin actions (integration — requires a live, seeded local Postgres)', () => {
  const projectIds: string[] = [];

  afterEach(async () => {
    for (const id of projectIds.splice(0)) {
      await prisma.project.deleteMany({ where: { id } });
    }
  });

  it('updates estimate defaults without affecting a different project', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const result = await updateProjectEstimateDefaults(projectA, {
      laborMarkupPct: '30', passThroughMarkupPct: '30', materialMarkupPct: '30',
      corporateMarkupPct: '10', taxRate: '9', contingencyPct: '15',
    });
    expect(result.error).toBeUndefined();

    const updatedA = await prisma.projectEstimateDefaults.findUnique({ where: { projectId: projectA } });
    expect(updatedA).toMatchObject({ laborMarkupPct: 0.3, taxRate: 0.09 });

    const untouchedB = await prisma.projectEstimateDefaults.findUnique({ where: { projectId: projectB } });
    expect(untouchedB!.laborMarkupPct).not.toBe(0.3);
  });

  it('rejects a markup percent over 100', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const result = await updateProjectEstimateDefaults(projectId, {
      laborMarkupPct: '150', passThroughMarkupPct: '30', materialMarkupPct: '30',
      corporateMarkupPct: '10', taxRate: '9', contingencyPct: '15',
    });
    expect(result.error).toMatch(/between 0 and 100/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "src/app/project/[projectId]/admin/defaults/actions.test.ts"`
Expected: FAIL — `Cannot find module './actions'`.

- [ ] **Step 3: Implement the actions**

Create `src/app/project/[projectId]/admin/defaults/actions.ts`:

```ts
'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import type { ActionResult, ValidationErr } from '@/lib/admin/validation';

interface DefaultsOk {
  ok: true;
  laborMarkupPct: number;
  passThroughMarkupPct: number;
  materialMarkupPct: number;
  corporateMarkupPct: number;
  taxRate: number;
  contingencyPct: number;
}

function parsePercent(raw: string | undefined, label: string): number | { error: string } {
  if (raw === undefined || raw === '') return { error: `${label} is required.` };
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0 || value > 100) return { error: `${label} must be between 0 and 100.` };
  return value / 100;
}

function validateDefaultsValues(values: Record<string, string>): DefaultsOk | ValidationErr {
  const laborMarkupPct = parsePercent(values.laborMarkupPct, 'Labor markup %');
  if (typeof laborMarkupPct !== 'number') return { ok: false, error: laborMarkupPct.error };
  const passThroughMarkupPct = parsePercent(values.passThroughMarkupPct, 'Pass-through markup %');
  if (typeof passThroughMarkupPct !== 'number') return { ok: false, error: passThroughMarkupPct.error };
  const materialMarkupPct = parsePercent(values.materialMarkupPct, 'Material markup %');
  if (typeof materialMarkupPct !== 'number') return { ok: false, error: materialMarkupPct.error };
  const corporateMarkupPct = parsePercent(values.corporateMarkupPct, 'Corporate markup %');
  if (typeof corporateMarkupPct !== 'number') return { ok: false, error: corporateMarkupPct.error };
  const taxRate = parsePercent(values.taxRate, 'Tax rate');
  if (typeof taxRate !== 'number') return { ok: false, error: taxRate.error };
  const contingencyPct = parsePercent(values.contingencyPct, 'Contingency %');
  if (typeof contingencyPct !== 'number') return { ok: false, error: contingencyPct.error };
  return {
    ok: true, laborMarkupPct, passThroughMarkupPct, materialMarkupPct, corporateMarkupPct, taxRate, contingencyPct,
  };
}

export async function updateProjectEstimateDefaults(projectId: string, values: Record<string, string>): Promise<ActionResult> {
  const parsed = validateDefaultsValues(values);
  if (!parsed.ok) return { error: parsed.error };

  await prisma.projectEstimateDefaults.update({
    where: { projectId },
    data: {
      laborMarkupPct: parsed.laborMarkupPct,
      passThroughMarkupPct: parsed.passThroughMarkupPct,
      materialMarkupPct: parsed.materialMarkupPct,
      corporateMarkupPct: parsed.corporateMarkupPct,
      taxRate: parsed.taxRate,
      contingencyPct: parsed.contingencyPct,
    },
  });
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "src/app/project/[projectId]/admin/defaults/actions.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Genericize `EstimateDefaultsForm`**

Replace the entire contents of `src/app/admin/(sections)/defaults/EstimateDefaultsForm.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface DefaultsShape {
  laborMarkupPct: number;
  passThroughMarkupPct: number;
  materialMarkupPct: number;
  corporateMarkupPct: number;
  taxRate: number;
  contingencyPct: number;
}

function toDisplayValues(defaults: DefaultsShape): Record<string, string> {
  return {
    laborMarkupPct: String(defaults.laborMarkupPct * 100),
    passThroughMarkupPct: String(defaults.passThroughMarkupPct * 100),
    materialMarkupPct: String(defaults.materialMarkupPct * 100),
    corporateMarkupPct: String(defaults.corporateMarkupPct * 100),
    taxRate: String(defaults.taxRate * 100),
    contingencyPct: String(defaults.contingencyPct * 100),
  };
}

const FIELDS: { key: string; label: string }[] = [
  { key: 'laborMarkupPct', label: 'Labor Markup %' },
  { key: 'passThroughMarkupPct', label: 'Pass-Through Markup %' },
  { key: 'materialMarkupPct', label: 'Material Markup %' },
  { key: 'corporateMarkupPct', label: 'Corporate Markup %' },
  { key: 'taxRate', label: 'Tax Rate %' },
  { key: 'contingencyPct', label: 'Contingency %' },
];

export function EstimateDefaultsForm({
  defaults,
  onSave,
}: {
  defaults: DefaultsShape;
  onSave: (values: Record<string, string>) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(toDisplayValues(defaults));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSave() {
    setPending(true);
    setError(null);
    const result = await onSave(values);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-3 max-w-md">
      {error && <p className="text-red-700 text-sm">{error}</p>}
      {FIELDS.map((field) => (
        <label key={field.key} className="flex items-center justify-between gap-4">
          <span className="text-slate">{field.label}</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              className="w-24 border border-line rounded px-2 py-1 text-right"
              value={values[field.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
            />
            <span className="text-slate text-sm">%</span>
          </span>
        </label>
      ))}
      <button
        disabled={pending}
        onClick={handleSave}
        className="bg-red hover:bg-red-700 text-white font-display font-semibold px-4 py-2 rounded transition-colors"
      >
        Save
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Update the master admin's call site**

Replace the entire contents of `src/app/admin/(sections)/defaults/page.tsx` with:

```tsx
import { prisma } from '@/lib/db';
import { EstimateDefaultsForm } from './EstimateDefaultsForm';
import { updateEstimateDefaults } from './actions';

export default async function DefaultsAdminPage() {
  const defaults = await prisma.estimateDefaults.findUniqueOrThrow({ where: { id: 'singleton' } });
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold tracking-tight text-navy">Estimate Defaults</h1>
      <EstimateDefaultsForm defaults={defaults} onSave={updateEstimateDefaults} />
    </div>
  );
}
```

- [ ] **Step 7: Implement the per-project page**

Create `src/app/project/[projectId]/admin/defaults/page.tsx`:

```tsx
import { prisma } from '@/lib/db';
import { EstimateDefaultsForm } from '@/app/admin/(sections)/defaults/EstimateDefaultsForm';
import { updateProjectEstimateDefaults } from './actions';

export default async function ProjectDefaultsAdminPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const defaults = await prisma.projectEstimateDefaults.findUniqueOrThrow({ where: { projectId } });
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold tracking-tight text-navy">Estimate Defaults</h1>
      <EstimateDefaultsForm
        defaults={defaults}
        onSave={(values) => updateProjectEstimateDefaults(projectId, values)}
      />
    </div>
  );
}
```

- [ ] **Step 8: Run the master admin's existing tests, then type-check**

Run: `npx vitest run "src/app/admin/(sections)/defaults"`
Expected: PASS — unchanged behavior, only the form's prop wiring changed.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add "src/app/project/[projectId]/admin/defaults" "src/app/admin/(sections)/defaults/EstimateDefaultsForm.tsx" "src/app/admin/(sections)/defaults/page.tsx"
git commit -m "feat: add per-project Defaults admin section, genericize EstimateDefaultsForm"
```

---

### Task 8: Admin layout, index redirect, and Sidebar restoration

**Files:**
- Create: `src/app/project/[projectId]/admin/layout.tsx`
- Create: `src/app/project/[projectId]/admin/page.tsx`
- Modify: `src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: nothing new — this task only wires together the 5 sections built in Tasks 3-7.
- Produces: `/project/[projectId]/admin` as a working, navigable area; the Sidebar's "Admin" link, removed in Phase 2, now points here.

- [ ] **Step 1: Create the admin layout**

Create `src/app/project/[projectId]/admin/layout.tsx`:

```tsx
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const ADMIN_NAV_ITEMS = (projectId: string) => [
  { href: `/project/${projectId}/admin/materials`, label: 'Materials' },
  { href: `/project/${projectId}/admin/labor-tasks`, label: 'Labor Tasks' },
  { href: `/project/${projectId}/admin/rates`, label: 'Rates' },
  { href: `/project/${projectId}/admin/pass-throughs`, label: 'Pass Throughs' },
  { href: `/project/${projectId}/admin/defaults`, label: 'Defaults' },
];

export default function ProjectAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectId: string };
}) {
  const navItems = ADMIN_NAV_ITEMS(params.projectId);

  return (
    <div className="min-h-screen bg-mist">
      <header className="flex items-center justify-between bg-navy-deep text-white px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="font-display text-xs font-semibold uppercase tracking-wide text-white/50">
            Project Admin
          </span>
          <span className="font-display text-lg font-semibold text-white">DAS Bid Estimator</span>
        </div>
        <Link
          href={`/project/${params.projectId}`}
          className="font-body text-sm text-white/70 transition-colors hover:text-white"
        >
          ← Back to Estimator
        </Link>
      </header>
      <main className="p-6 space-y-6">
        <nav className="flex gap-2 border-b border-line pb-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-2 rounded font-body text-sm text-slate hover:bg-mist-2 hover:text-navy transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {children}
      </main>
    </div>
  );
}
```

(This nav intentionally uses plain always-`inactive` styling rather than the master admin's active-link highlighting — adding `usePathname()`-based active state would require making this a Client Component; the master admin's `(sections)/layout.tsx` does that specifically because it also needs client-side interactivity for the "Log Out" button, which this area has no equivalent of. Static nav styling is simpler here and no less functional. If active-state highlighting is wanted later, this file is a one-line-`'use client'` + `usePathname()` addition away from matching the master admin's exact pattern.)

- [ ] **Step 2: Create the admin index redirect**

Create `src/app/project/[projectId]/admin/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function ProjectAdminIndexPage({ params }: { params: { projectId: string } }) {
  redirect(`/project/${params.projectId}/admin/materials`);
}
```

- [ ] **Step 3: Restore the Sidebar's Admin link**

In `src/components/Sidebar.tsx`, replace the `navItems` array (currently lines 20-26):

```tsx
  const navItems = [
    { href: `/project/${projectId}`, label: 'Cover Info', icon: FileText },
    { href: `/project/${projectId}/materials`, label: 'Materials', icon: Package },
    { href: `/project/${projectId}/labor`, label: 'Labor', icon: HardHat },
    { href: `/project/${projectId}/pass-throughs`, label: 'Pass Throughs', icon: Receipt },
    { href: `/project/${projectId}/summary`, label: 'Executive Summary', icon: BarChart3 },
  ];
```

with:

```tsx
  const navItems = [
    { href: `/project/${projectId}`, label: 'Cover Info', icon: FileText },
    { href: `/project/${projectId}/materials`, label: 'Materials', icon: Package },
    { href: `/project/${projectId}/labor`, label: 'Labor', icon: HardHat },
    { href: `/project/${projectId}/pass-throughs`, label: 'Pass Throughs', icon: Receipt },
    { href: `/project/${projectId}/summary`, label: 'Executive Summary', icon: BarChart3 },
    { href: `/project/${projectId}/admin`, label: 'Admin', icon: Settings },
  ];
```

And add `Settings` to the existing `lucide-react` import (currently line 7):

```tsx
import {
  FileText, Package, HardHat, Receipt, BarChart3, Settings, Folder, ChevronLeft, ChevronRight,
} from 'lucide-react';
```

No change is needed to the active-link logic (line 74's `item.href === \`/project/${projectId}\` ? pathname === item.href : pathname.startsWith(item.href)` already handles the new item correctly as a `startsWith` case, same as Materials/Labor/etc.).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full test suite and build**

Run: `npx vitest run`
Expected: all tests pass (previous count plus every new test file added in Tasks 3-7).

Run: `npm run build`
Expected: succeeds. New routes: `/project/[projectId]/admin`, `/project/[projectId]/admin/materials`, `/project/[projectId]/admin/labor-tasks`, `/project/[projectId]/admin/rates`, `/project/[projectId]/admin/pass-throughs`, `/project/[projectId]/admin/defaults`.

- [ ] **Step 6: Manually verify the full flow in the browser, including cross-project isolation**

With the dev server running (`PORT=4000 npm run dev`):
1. Create two projects (via the landing page's "Create New Project", or the `npx tsx -e "..."` one-off script used in earlier phases). Call them Project A and Project B.
2. Open Project A. Confirm the Sidebar now shows "Admin" below "Executive Summary". Click it — confirm it redirects to `/project/<A>/admin/materials` and shows the distinct navy-deep header with "← Back to Estimator" (not the estimator's own Sidebar/AppShell — this is the whole point of Task 1's route-group move; confirm there is no sidebar visible on any admin page).
3. Edit a material's Unit Cost in Project A's admin. Confirm it saves (no error, table reflects the new value after refresh).
4. Open Project B's admin (`/project/<B>/admin/materials`) in a second tab. Confirm the SAME material's Unit Cost is unchanged from its original seeded value — proving the edit in Project A did not leak into Project B.
5. Click through all 5 nav items (Materials, Labor Tasks, Rates, Pass Throughs, Defaults) in Project A's admin and confirm each renders without error and its edits behave like the corresponding master `/admin` section.
6. Navigate to `/admin` directly (the master admin). Confirm the password gate is still in effect (or, if already logged in from earlier testing, confirm the master catalog's data is unaffected by any of the per-project edits made above).
7. Click "← Back to Estimator" from Project A's admin. Confirm it returns to `/project/<A>` (Cover Info) with the normal Sidebar/AppShell restored.

- [ ] **Step 7: Commit**

```bash
git add "src/app/project/[projectId]/admin/layout.tsx" "src/app/project/[projectId]/admin/page.tsx" src/components/Sidebar.tsx
git commit -m "feat: wire up per-project admin layout/index, restore Sidebar Admin link"
```
