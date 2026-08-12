# Multi-Project Data Model & Persistence Implementation Plan (Phase 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `Project` entity, nine project-scoped reference-data tables, a `createProject()` action that clones the existing master reference data into a new project, and a `saveProjectDraft()` action that persists a project's estimate draft — all as new, additive, independently-testable backend pieces with zero changes to any existing route, page, or the current (still-`localStorage`-based) `EstimateContext`.

**Architecture:** Nine new Prisma models (`Project*`) mirror the shape of the nine existing master reference-data tables, each scoped by a `projectId` foreign key with cascading delete. `createProject()` reads every row from the master tables and bulk-inserts matching rows into the new tables inside one transaction. `saveProjectDraft()` writes a project's estimate draft (the same shape already used for `localStorage` persistence today) into a new `Project.draftJson` column, keeping `Project.name`/`Project.client` in sync from the draft's cover info in the same write. This is Phase 1 of 3 (per `docs/superpowers/specs/2026-08-12-multi-project-support-design.md`'s Implementation Note) — routing, the landing page, the All Projects page, and wiring `EstimateContext` to actually use this persistence are Phase 2; the new per-project Admin UI is Phase 3.

**Tech Stack:** Prisma 5.16, PostgreSQL, Vitest (integration tests against the real local dev Postgres, per this project's existing convention — see `vitest.config.ts`'s `fileParallelism: false`).

## Global Constraints

- The existing 9 master reference-data tables (`MaterialItem`, `LaborTask`, `LaborRate`, `CrewSizeRow`, `LaborProjectionSettings`, `PassThroughRoleRate`, `RentalRate`, `SoftCostRate`, `EstimateDefaults`) and all 17 existing Server Actions that read/write them are untouched.
- No changes to any file under `src/app/` (routing, pages, layouts) in this phase.
- `EstimateContext.tsx` gets exactly one change: exporting its existing `PersistedDraft` interface (adding the `export` keyword — no behavioral change) so the new persistence code can share its shape instead of duplicating it.
- Deleting a `Project` row must cascade-delete all of its project-scoped reference-data rows (`onDelete: Cascade` on every `Project*` table's relation to `Project`).
- `createProject()` clones inside a single transaction — if any step fails, no partial project is left behind.

---

### Task 1: `Project` model and nine project-scoped reference-data tables

**Files:**
- Modify: `prisma/schema.prisma` (append new models after the existing `EstimateDefaults` model, which currently ends the file)

**Interfaces:**
- Produces: Prisma Client models `Project`, `ProjectMaterialItem`, `ProjectLaborTask`, `ProjectLaborRate`, `ProjectCrewSizeRow`, `ProjectLaborProjectionSettings`, `ProjectPassThroughRoleRate`, `ProjectRentalRate`, `ProjectSoftCostRate`, `ProjectEstimateDefaults` — Tasks 2 and 3 read/write these via `prisma.project*` / `prisma.project`.

- [ ] **Step 1: Append the new models to the schema**

Add this to the end of `prisma/schema.prisma`:

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
  laborRates              ProjectLaborRate[]
  crewSizeTable           ProjectCrewSizeRow[]
  laborProjectionSettings ProjectLaborProjectionSettings?
  passThroughRoleRates    ProjectPassThroughRoleRate[]
  rentalRates             ProjectRentalRate[]
  softCostRates           ProjectSoftCostRate[]
  estimateDefaults        ProjectEstimateDefaults?
}

model ProjectMaterialItem {
  id           String           @id @default(cuid())
  projectId    String
  project      Project          @relation(fields: [projectId], references: [id], onDelete: Cascade)
  key          String
  type         String
  manufacturer String?
  model        String?
  description  String
  vendor       String?
  category     MaterialCategory
  unitCost     Float
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  @@unique([projectId, key])
}

model ProjectLaborTask {
  id                 String        @id @default(cuid())
  projectId          String
  project            Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  key                String
  sheet              LaborSheet
  category           String
  name               String
  minutesPerUnit     Float
  unit               String
  laborRole          LaborRoleName
  includedInSubtotal Boolean       @default(true)
  derivedFromJson    Json?
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt

  @@unique([projectId, key])
}

model ProjectLaborRate {
  id          String        @id @default(cuid())
  projectId   String
  project     Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  role        LaborRoleName
  hourlyRate  Float
  rawWageRate Float
  updatedAt   DateTime      @updatedAt

  @@unique([projectId, role])
}

model ProjectCrewSizeRow {
  id              String  @id @default(cuid())
  projectId       String
  project         Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  technicianCount Int
  cmsNeeded       Int

  @@unique([projectId, technicianCount])
}

model ProjectLaborProjectionSettings {
  projectId                     String   @id
  project                       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  hoursPerManDay                Float
  hoursPerManWeek               Float
  stagingMaterialMultiplier     Float
  cmPercentOfTechHours          Float
  pmPercentOfTechHours          Float
  coordinatorPercentOfTechHours Float
  updatedAt                     DateTime @updatedAt
}

model ProjectPassThroughRoleRate {
  id        String              @id @default(cuid())
  projectId String
  project   Project             @relation(fields: [projectId], references: [id], onDelete: Cascade)
  kind      PassThroughRateKind
  role      LaborRoleName
  amount    Float

  @@unique([projectId, kind, role])
}

model ProjectRentalRate {
  id        String  @id @default(cuid())
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  key       String
  name      String
  rate      Float
  unit      String

  @@unique([projectId, key])
}

model ProjectSoftCostRate {
  id        String  @id @default(cuid())
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  key       String
  name      String
  fee       Float

  @@unique([projectId, key])
}

model ProjectEstimateDefaults {
  projectId            String   @id
  project              Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  laborMarkupPct       Float
  passThroughMarkupPct Float
  materialMarkupPct    Float
  corporateMarkupPct   Float
  taxRate              Float
  contingencyPct       Float
  updatedAt            DateTime @updatedAt
}
```

- [ ] **Step 2: Run the migration**

Run: `npx prisma migrate dev --name add_project_support`
Expected: a new migration folder appears under `prisma/migrations/`, the local dev database gets the 10 new tables, and Prisma Client is regenerated (this command runs `prisma generate` automatically).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (this is a purely additive schema change — nothing existing references the new models yet).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Project entity and project-scoped reference-data tables"
```

---

### Task 2: `createProject()`

**Files:**
- Create: `src/lib/project/createProject.ts`
- Test: `src/lib/project/createProject.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/db`; the master `MaterialItem`/`LaborTask`/`LaborRate`/`CrewSizeRow`/`LaborProjectionSettings`/`PassThroughRoleRate`/`RentalRate`/`SoftCostRate`/`EstimateDefaults` tables (unchanged, read-only).
- Produces: `createProject(): Promise<{ id: string }>` — Phase 2's landing page will call this directly from a Client Component (it's a `'use server'` action), then navigate to `/project/[id]`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/project/createProject.test.ts`:

```ts
// src/lib/project/createProject.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createProject } from './createProject';

describe('createProject (integration — requires a live, seeded local Postgres)', () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    for (const id of createdIds.splice(0)) {
      await prisma.project.deleteMany({ where: { id } });
    }
  });

  it('creates a blank project and clones every master reference-data row into project-scoped copies', async () => {
    const [
      masterMaterialCount, masterLaborTaskCount, masterLaborRateCount, masterCrewSizeCount,
      masterPassThroughCount, masterRentalCount, masterSoftCostCount,
    ] = await Promise.all([
      prisma.materialItem.count(),
      prisma.laborTask.count(),
      prisma.laborRate.count(),
      prisma.crewSizeRow.count(),
      prisma.passThroughRoleRate.count(),
      prisma.rentalRate.count(),
      prisma.softCostRate.count(),
    ]);

    const { id } = await createProject();
    createdIds.push(id);

    const project = await prisma.project.findUnique({ where: { id } });
    expect(project).toMatchObject({ name: '', client: '', draftJson: null });

    const [
      projectMaterialCount, projectLaborTaskCount, projectLaborRateCount, projectCrewSizeCount,
      projectPassThroughCount, projectRentalCount, projectSoftCostCount,
    ] = await Promise.all([
      prisma.projectMaterialItem.count({ where: { projectId: id } }),
      prisma.projectLaborTask.count({ where: { projectId: id } }),
      prisma.projectLaborRate.count({ where: { projectId: id } }),
      prisma.projectCrewSizeRow.count({ where: { projectId: id } }),
      prisma.projectPassThroughRoleRate.count({ where: { projectId: id } }),
      prisma.projectRentalRate.count({ where: { projectId: id } }),
      prisma.projectSoftCostRate.count({ where: { projectId: id } }),
    ]);

    expect(projectMaterialCount).toBe(masterMaterialCount);
    expect(projectLaborTaskCount).toBe(masterLaborTaskCount);
    expect(projectLaborRateCount).toBe(masterLaborRateCount);
    expect(projectCrewSizeCount).toBe(masterCrewSizeCount);
    expect(projectPassThroughCount).toBe(masterPassThroughCount);
    expect(projectRentalCount).toBe(masterRentalCount);
    expect(projectSoftCostCount).toBe(masterSoftCostCount);

    const projectSettings = await prisma.projectLaborProjectionSettings.findUnique({ where: { projectId: id } });
    const masterSettings = await prisma.laborProjectionSettings.findUnique({ where: { id: 'singleton' } });
    expect(projectSettings).toMatchObject({
      hoursPerManDay: masterSettings!.hoursPerManDay,
      hoursPerManWeek: masterSettings!.hoursPerManWeek,
      stagingMaterialMultiplier: masterSettings!.stagingMaterialMultiplier,
      cmPercentOfTechHours: masterSettings!.cmPercentOfTechHours,
      pmPercentOfTechHours: masterSettings!.pmPercentOfTechHours,
      coordinatorPercentOfTechHours: masterSettings!.coordinatorPercentOfTechHours,
    });

    const projectDefaults = await prisma.projectEstimateDefaults.findUnique({ where: { projectId: id } });
    const masterDefaults = await prisma.estimateDefaults.findUnique({ where: { id: 'singleton' } });
    expect(projectDefaults).toMatchObject({
      laborMarkupPct: masterDefaults!.laborMarkupPct,
      passThroughMarkupPct: masterDefaults!.passThroughMarkupPct,
      materialMarkupPct: masterDefaults!.materialMarkupPct,
      corporateMarkupPct: masterDefaults!.corporateMarkupPct,
      taxRate: masterDefaults!.taxRate,
      contingencyPct: masterDefaults!.contingencyPct,
    });

    // Spot-check one real value survives the clone correctly, not just the row count.
    const clonedBom3 = await prisma.projectMaterialItem.findUnique({
      where: { projectId_key: { projectId: id, key: 'bom-3' } },
    });
    expect(clonedBom3).toMatchObject({ unitCost: 4685, category: 'DAS_Materials', manufacturer: 'Vertiv' });
  });

  it('cascades deletion: deleting a project removes all its project-scoped rows', async () => {
    const { id } = await createProject();

    await prisma.project.delete({ where: { id } });

    const remaining = await prisma.projectMaterialItem.count({ where: { projectId: id } });
    expect(remaining).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/project/createProject.test.ts`
Expected: FAIL — `Cannot find module './createProject'`.

- [ ] **Step 3: Implement `createProject`**

Create `src/lib/project/createProject.ts`:

```ts
// src/lib/project/createProject.ts
'use server';

import { prisma } from '@/lib/db';

export async function createProject(): Promise<{ id: string }> {
  const [
    materialItems, laborTasks, laborRates, crewSizeTable, settings,
    passThroughRoleRates, rentalRates, softCostRates, estimateDefaults,
  ] = await Promise.all([
    prisma.materialItem.findMany(),
    prisma.laborTask.findMany(),
    prisma.laborRate.findMany(),
    prisma.crewSizeRow.findMany(),
    prisma.laborProjectionSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.passThroughRoleRate.findMany(),
    prisma.rentalRate.findMany(),
    prisma.softCostRate.findMany(),
    prisma.estimateDefaults.findUnique({ where: { id: 'singleton' } }),
  ]);

  if (!settings) throw new Error('LaborProjectionSettings singleton row not found — run `npm run seed`.');
  if (!estimateDefaults) throw new Error('EstimateDefaults singleton row not found — run `npm run seed`.');

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({ data: {} });

    await tx.projectMaterialItem.createMany({
      data: materialItems.map((m) => ({
        projectId: created.id, key: m.key, type: m.type, manufacturer: m.manufacturer,
        model: m.model, description: m.description, vendor: m.vendor,
        category: m.category, unitCost: m.unitCost,
      })),
    });

    await tx.projectLaborTask.createMany({
      data: laborTasks.map((t) => ({
        projectId: created.id, key: t.key, sheet: t.sheet, category: t.category, name: t.name,
        minutesPerUnit: t.minutesPerUnit, unit: t.unit, laborRole: t.laborRole,
        includedInSubtotal: t.includedInSubtotal, derivedFromJson: t.derivedFromJson ?? undefined,
      })),
    });

    await tx.projectLaborRate.createMany({
      data: laborRates.map((r) => ({
        projectId: created.id, role: r.role, hourlyRate: r.hourlyRate, rawWageRate: r.rawWageRate,
      })),
    });

    await tx.projectCrewSizeRow.createMany({
      data: crewSizeTable.map((c) => ({
        projectId: created.id, technicianCount: c.technicianCount, cmsNeeded: c.cmsNeeded,
      })),
    });

    await tx.projectLaborProjectionSettings.create({
      data: {
        projectId: created.id,
        hoursPerManDay: settings.hoursPerManDay,
        hoursPerManWeek: settings.hoursPerManWeek,
        stagingMaterialMultiplier: settings.stagingMaterialMultiplier,
        cmPercentOfTechHours: settings.cmPercentOfTechHours,
        pmPercentOfTechHours: settings.pmPercentOfTechHours,
        coordinatorPercentOfTechHours: settings.coordinatorPercentOfTechHours,
      },
    });

    await tx.projectPassThroughRoleRate.createMany({
      data: passThroughRoleRates.map((r) => ({
        projectId: created.id, kind: r.kind, role: r.role, amount: r.amount,
      })),
    });

    await tx.projectRentalRate.createMany({
      data: rentalRates.map((r) => ({
        projectId: created.id, key: r.key, name: r.name, rate: r.rate, unit: r.unit,
      })),
    });

    await tx.projectSoftCostRate.createMany({
      data: softCostRates.map((r) => ({
        projectId: created.id, key: r.key, name: r.name, fee: r.fee,
      })),
    });

    await tx.projectEstimateDefaults.create({
      data: {
        projectId: created.id,
        laborMarkupPct: estimateDefaults.laborMarkupPct,
        passThroughMarkupPct: estimateDefaults.passThroughMarkupPct,
        materialMarkupPct: estimateDefaults.materialMarkupPct,
        corporateMarkupPct: estimateDefaults.corporateMarkupPct,
        taxRate: estimateDefaults.taxRate,
        contingencyPct: estimateDefaults.contingencyPct,
      },
    });

    return created;
  }, { timeout: 20000 });

  return { id: project.id };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/project/createProject.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/project/createProject.ts src/lib/project/createProject.test.ts
git commit -m "feat: add createProject, cloning master reference data into a new project"
```

---

### Task 3: `saveProjectDraft()`

**Files:**
- Modify: `src/lib/estimate/EstimateContext.tsx:15` (add `export` to the `PersistedDraft` interface declaration)
- Create: `src/lib/project/saveProjectDraft.ts`
- Test: `src/lib/project/saveProjectDraft.test.ts`

**Interfaces:**
- Consumes: `createProject` (Task 2, to seed a project for the test), `PersistedDraft` (now-exported from `EstimateContext.tsx`).
- Produces: `saveProjectDraft(projectId: string, draft: PersistedDraft): Promise<void>` — Phase 2's rewrite of `EstimateContext`'s autosave effect will call this instead of `localStorage.setItem`.

- [ ] **Step 1: Export `PersistedDraft`**

In `src/lib/estimate/EstimateContext.tsx`, change line 15 from:

```ts
interface PersistedDraft {
```

to:

```ts
export interface PersistedDraft {
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/project/saveProjectDraft.test.ts`:

```ts
// src/lib/project/saveProjectDraft.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createProject } from './createProject';
import { saveProjectDraft } from './saveProjectDraft';
import type { PersistedDraft } from '@/lib/estimate/EstimateContext';

const SAMPLE_DRAFT: PersistedDraft = {
  coverInfo: {
    client: 'Acme Corp', project: 'Downtown Stadium DAS', rfpDate: '', bidDueDate: '', estimator: '',
    contactName: '', contactPhone: '', contactEmail: '', customerType: '',
    jobSiteAddress: '', projectOverview: '',
  },
  materials: [{ key: 'bom-3', quantity: 2 }],
  contingencyPct: 0.1,
  shippingHandling: 200,
  loeTasks: [],
  sowTasks: [],
  technicianCount: 4,
  passThroughs: { perDiem: [], lodging: [], travel: [], airfare: [], rentals: [], softCosts: [] },
  markups: {
    laborMarkupPct: 0.25, passThroughMarkupPct: 0.25, materialMarkupPct: 0.25,
    corporateMarkupPct: 0.05, marginTweak: 0, taxRate: 0.0825,
  },
};

describe('saveProjectDraft (integration — requires a live, seeded local Postgres)', () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    for (const id of createdIds.splice(0)) {
      await prisma.project.deleteMany({ where: { id } });
    }
  });

  it('persists the draft and syncs Project.name/client from coverInfo', async () => {
    const { id } = await createProject();
    createdIds.push(id);

    await saveProjectDraft(id, SAMPLE_DRAFT);

    const project = await prisma.project.findUnique({ where: { id } });
    expect(project?.name).toBe('Downtown Stadium DAS');
    expect(project?.client).toBe('Acme Corp');
    expect(project?.draftJson).toEqual(SAMPLE_DRAFT);
  });

  it('overwrites a previous draft on a second call', async () => {
    const { id } = await createProject();
    createdIds.push(id);

    await saveProjectDraft(id, SAMPLE_DRAFT);
    const updatedDraft: PersistedDraft = {
      ...SAMPLE_DRAFT,
      coverInfo: { ...SAMPLE_DRAFT.coverInfo, project: 'Renamed Project', client: 'New Client' },
    };
    await saveProjectDraft(id, updatedDraft);

    const project = await prisma.project.findUnique({ where: { id } });
    expect(project?.name).toBe('Renamed Project');
    expect(project?.client).toBe('New Client');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/project/saveProjectDraft.test.ts`
Expected: FAIL — `Cannot find module './saveProjectDraft'`.

- [ ] **Step 4: Implement `saveProjectDraft`**

Create `src/lib/project/saveProjectDraft.ts`:

```ts
// src/lib/project/saveProjectDraft.ts
'use server';

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type { PersistedDraft } from '@/lib/estimate/EstimateContext';

export async function saveProjectDraft(projectId: string, draft: PersistedDraft): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: {
      // Cast needed because Prisma's InputJsonValue type is stricter about nested optional
      // fields than a plain TS interface like PersistedDraft — the actual value is always
      // plain JSON-serializable data (strings, numbers, arrays, nested objects).
      draftJson: draft as unknown as Prisma.InputJsonValue,
      name: draft.coverInfo.project,
      client: draft.coverInfo.client,
    },
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/project/saveProjectDraft.test.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (previous count plus the 4 new tests from Tasks 2-3).

- [ ] **Step 8: Commit**

```bash
git add src/lib/estimate/EstimateContext.tsx src/lib/project/saveProjectDraft.ts src/lib/project/saveProjectDraft.test.ts
git commit -m "feat: add saveProjectDraft, persisting a project's estimate draft"
```
