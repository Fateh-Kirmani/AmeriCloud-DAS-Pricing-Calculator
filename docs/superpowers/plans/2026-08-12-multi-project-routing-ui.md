# Multi-Project Routing, Landing & All Projects Pages Implementation Plan (Phase 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the estimator (Cover Info/Materials/Labor/Pass Throughs/Summary) under `/project/[projectId]`, rewire `EstimateContext` off `localStorage` onto Phase 1's `saveProjectDraft`/`createProject`, and add the landing page (`/`) and All Projects page (`/projects`) — completing the user-visible half of multi-project support.

**Architecture:** Two new project-scoped loader functions mirror the existing master `loadReferenceData()`/`loadEstimateDefaults()` but read from Phase 1's `Project*` tables. `EstimateContext` is rewritten to take `projectId` and an `initialDraft` (loaded server-side from `Project.draftJson`) instead of rehydrating from `localStorage`, autosaving via a debounced `saveProjectDraft()` call and exposing a `flushSave()` for immediate, pre-navigation saves. The existing `(estimator)` route group moves under a new `project/[projectId]/layout.tsx` (which does the per-project data loading), the Sidebar gains a flush-then-navigate "All Projects" button (its old "Admin" link is removed for now — Phase 3 reintroduces it pointing at a new per-project admin route), and two new pages (`/`, `/projects`) round out the flow.

**Tech Stack:** Next.js 14 App Router, Prisma, React Testing Library / Vitest, `lucide-react`.

## Global Constraints

- The existing 9 master reference-data tables, their admin pages/actions, and `/admin`'s password gate are untouched — reachable only via a "Master Defaults" button on `/projects`.
- No confirmation popup when leaving a project for All Projects: the Sidebar's "All Projects" control calls `flushSave()` (awaited) then navigates immediately — per the approved design, autosave already means nothing is at risk of being lost.
- `EstimateContext`'s `localStorage`-based persistence (`DRAFT_STORAGE_KEY`, `loadDraft()`, the rehydrate-on-mount effect) is removed entirely, not kept as a fallback.
- The Sidebar's "Admin" nav item is removed in this phase (not yet replaced — the per-project admin route doesn't exist until Phase 3). This keeps the app in a fully working state without a dead link; Phase 3 adds it back pointing at `/project/[projectId]/admin`.
- The All Projects page's Name/Client search is client-side substring matching, case-insensitive — same pattern as the existing Materials/Labor page search boxes.
- A freshly-created project has blank `name`/`client`; the All Projects table displays "Untitled Project" as a display-only fallback (never stored specially) when `name` is blank.

---

### Task 1: `loadProjectReferenceData()` and `loadProjectEstimateDefaults()`

**Files:**
- Modify: `src/lib/data/loadReferenceData.ts` (export four previously-private helpers)
- Create: `src/lib/data/loadProjectReferenceData.ts`
- Test: `src/lib/data/loadProjectReferenceData.test.ts`

**Interfaces:**
- Consumes: `createProject()` (Phase 1, to seed a project for the test), `loadReferenceData()`/`loadEstimateDefaults()` (Phase 1/existing, as the comparison baseline in the test).
- Produces: `loadProjectReferenceData(projectId: string): Promise<ReferenceData>`, `loadProjectEstimateDefaults(projectId: string): Promise<EstimateDefaultsData>` — Task 4's `project/[projectId]/layout.tsx` calls both.

- [ ] **Step 1: Export the reusable mapping helpers**

In `src/lib/data/loadReferenceData.ts`, make these four already-defined-but-private symbols exported (add the `export` keyword; do not change their implementations):
- Line 15: `const CATEGORY_FROM_DB` → `export const CATEGORY_FROM_DB`
- Line 30: `function mapRole(role: LaborRoleName): LaborRole {` → `export function mapRole(role: LaborRoleName): LaborRole {`
- Line 62: `function mapRoleRate(rows: ...)` → `export function mapRoleRate(rows: ...)`
- Line 75: `function sortByRole<T extends { role: LaborRole }>(rows: T[]): T[] {` → `export function sortByRole<T extends { role: LaborRole }>(rows: T[]): T[] {`

(`parseDerivedFrom` on line 36 is already exported — no change needed there.)

- [ ] **Step 2: Write the failing test**

Create `src/lib/data/loadProjectReferenceData.test.ts`:

```ts
// src/lib/data/loadProjectReferenceData.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createProject } from '@/lib/project/createProject';
import { loadProjectReferenceData, loadProjectEstimateDefaults } from './loadProjectReferenceData';
import { loadReferenceData, loadEstimateDefaults } from './loadReferenceData';

describe('loadProjectReferenceData / loadProjectEstimateDefaults (integration — requires a live, seeded local Postgres)', () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    for (const id of createdIds.splice(0)) {
      await prisma.project.deleteMany({ where: { id } });
    }
  });

  it("loads a freshly-created project's cloned reference data with the same shape and values as the master data", async () => {
    const { id } = await createProject();
    createdIds.push(id);

    const [projectData, masterData] = await Promise.all([
      loadProjectReferenceData(id),
      loadReferenceData(),
    ]);

    expect(projectData.materialItems).toHaveLength(masterData.materialItems.length);
    expect(projectData.laborTasks).toHaveLength(masterData.laborTasks.length);
    expect(projectData.laborRates).toEqual(masterData.laborRates);
    expect(projectData.crewSizeTable).toEqual(masterData.crewSizeTable);
    expect(projectData.laborProjectionSettings).toEqual(masterData.laborProjectionSettings);

    const bom3 = projectData.materialItems.find((m) => m.key === 'bom-3');
    expect(bom3).toMatchObject({ unitCost: 4685, category: 'DAS Materials', manufacturer: 'Vertiv' });

    const projectLoe25 = projectData.laborTasks.find((t) => t.key === 'loe-25');
    const masterLoe25 = masterData.laborTasks.find((t) => t.key === 'loe-25');
    expect(projectLoe25?.derivedFrom).toEqual(masterLoe25?.derivedFrom);
  });

  it("loads a freshly-created project's cloned estimate defaults matching the master defaults", async () => {
    const { id } = await createProject();
    createdIds.push(id);

    const [projectDefaults, masterDefaults] = await Promise.all([
      loadProjectEstimateDefaults(id),
      loadEstimateDefaults(),
    ]);

    expect(projectDefaults).toEqual(masterDefaults);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/data/loadProjectReferenceData.test.ts`
Expected: FAIL — `Cannot find module './loadProjectReferenceData'`.

- [ ] **Step 4: Implement `loadProjectReferenceData` and `loadProjectEstimateDefaults`**

Create `src/lib/data/loadProjectReferenceData.ts`:

```ts
// src/lib/data/loadProjectReferenceData.ts
import { prisma } from '@/lib/db';
import type { PassThroughRateKind } from '@prisma/client';
import type { MaterialItem, ReferenceData } from '@/lib/calc';
import {
  CATEGORY_FROM_DB, mapRole, mapRoleRate, sortByRole, parseDerivedFrom,
  type EstimateDefaultsData,
} from './loadReferenceData';

export async function loadProjectReferenceData(projectId: string): Promise<ReferenceData> {
  const [
    materialItemsDb, laborTasksDb, laborRatesDb, crewSizeTableDb, settingsDb,
    perDiemDb, lodgingDb, airfareDb, rentalsDb, softCostsDb,
  ] = await Promise.all([
    prisma.projectMaterialItem.findMany({ where: { projectId } }),
    prisma.projectLaborTask.findMany({ where: { projectId } }),
    prisma.projectLaborRate.findMany({ where: { projectId } }),
    prisma.projectCrewSizeRow.findMany({ where: { projectId } }),
    prisma.projectLaborProjectionSettings.findUnique({ where: { projectId } }),
    prisma.projectPassThroughRoleRate.findMany({ where: { projectId, kind: 'PerDiem' as PassThroughRateKind } }),
    prisma.projectPassThroughRoleRate.findMany({ where: { projectId, kind: 'Lodging' as PassThroughRateKind } }),
    prisma.projectPassThroughRoleRate.findMany({ where: { projectId, kind: 'Airfare' as PassThroughRateKind } }),
    prisma.projectRentalRate.findMany({ where: { projectId } }),
    prisma.projectSoftCostRate.findMany({ where: { projectId } }),
  ]);

  if (!settingsDb) {
    throw new Error(`ProjectLaborProjectionSettings row not found for project "${projectId}".`);
  }

  const materialItems: MaterialItem[] = materialItemsDb.map((m) => ({
    key: m.key,
    type: m.type,
    manufacturer: m.manufacturer,
    model: m.model,
    description: m.description,
    vendor: m.vendor,
    category: CATEGORY_FROM_DB[m.category],
    unitCost: m.unitCost,
  }));

  const laborTasks = laborTasksDb.map((t) => ({
    key: t.key,
    sheet: t.sheet,
    category: t.category,
    name: t.name,
    minutesPerUnit: t.minutesPerUnit,
    unit: t.unit,
    laborRole: mapRole(t.laborRole),
    includedInSubtotal: t.includedInSubtotal,
    derivedFrom: parseDerivedFrom(t.derivedFromJson, t.key),
  }));

  const laborRates = sortByRole(laborRatesDb.map((r) => ({
    role: mapRole(r.role),
    hourlyRate: r.hourlyRate,
    rawWageRate: r.rawWageRate,
  })));

  const crewSizeTable = crewSizeTableDb.map((r) => ({
    technicianCount: r.technicianCount,
    cmsNeeded: r.cmsNeeded,
  }));

  return {
    materialItems,
    laborTasks,
    laborRates,
    crewSizeTable,
    laborProjectionSettings: {
      hoursPerManDay: settingsDb.hoursPerManDay,
      hoursPerManWeek: settingsDb.hoursPerManWeek,
      stagingMaterialMultiplier: settingsDb.stagingMaterialMultiplier,
      cmPercentOfTechHours: settingsDb.cmPercentOfTechHours,
      pmPercentOfTechHours: settingsDb.pmPercentOfTechHours,
      coordinatorPercentOfTechHours: settingsDb.coordinatorPercentOfTechHours,
    },
    passThroughRates: {
      perDiemRateByRole: sortByRole(mapRoleRate(perDiemDb)),
      lodgingRateByRole: sortByRole(mapRoleRate(lodgingDb)),
      airfareCostByRole: sortByRole(airfareDb.map((r) => ({ role: mapRole(r.role), cost: r.amount }))),
      rentals: rentalsDb.map((r) => ({ key: r.key, name: r.name, rate: r.rate, unit: r.unit })),
      softCosts: softCostsDb.map((r) => ({ key: r.key, name: r.name, fee: r.fee })),
    },
  };
}

export async function loadProjectEstimateDefaults(projectId: string): Promise<EstimateDefaultsData> {
  const row = await prisma.projectEstimateDefaults.findUnique({ where: { projectId } });
  if (!row) throw new Error(`ProjectEstimateDefaults row not found for project "${projectId}".`);
  return {
    laborMarkupPct: row.laborMarkupPct,
    passThroughMarkupPct: row.passThroughMarkupPct,
    materialMarkupPct: row.materialMarkupPct,
    corporateMarkupPct: row.corporateMarkupPct,
    taxRate: row.taxRate,
    contingencyPct: row.contingencyPct,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/data/loadProjectReferenceData.test.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/data/loadReferenceData.ts src/lib/data/loadProjectReferenceData.ts src/lib/data/loadProjectReferenceData.test.ts
git commit -m "feat: add project-scoped reference-data loaders"
```

---

### Task 2: `deleteProject()`

**Files:**
- Create: `src/lib/project/deleteProject.ts`
- Test: `src/lib/project/deleteProject.test.ts`

**Interfaces:**
- Consumes: `createProject()` (Phase 1).
- Produces: `deleteProject(projectId: string): Promise<void>` — Task 7's All Projects page Delete button calls this.

- [ ] **Step 1: Write the failing test**

Create `src/lib/project/deleteProject.test.ts`:

```ts
// src/lib/project/deleteProject.test.ts
import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/db';
import { createProject } from './createProject';
import { deleteProject } from './deleteProject';

describe('deleteProject (integration — requires a live, seeded local Postgres)', () => {
  it('deletes the project and cascades to its project-scoped reference-data rows', async () => {
    const { id } = await createProject();

    await deleteProject(id);

    const project = await prisma.project.findUnique({ where: { id } });
    expect(project).toBeNull();

    const remainingMaterials = await prisma.projectMaterialItem.count({ where: { projectId: id } });
    expect(remainingMaterials).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/project/deleteProject.test.ts`
Expected: FAIL — `Cannot find module './deleteProject'`.

- [ ] **Step 3: Implement `deleteProject`**

Create `src/lib/project/deleteProject.ts`:

```ts
// src/lib/project/deleteProject.ts
'use server';

import { prisma } from '@/lib/db';

export async function deleteProject(projectId: string): Promise<void> {
  await prisma.project.delete({ where: { id: projectId } });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/project/deleteProject.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/project/deleteProject.ts src/lib/project/deleteProject.test.ts
git commit -m "feat: add deleteProject"
```

---

### Task 3: Rewire `EstimateContext` off `localStorage`

**Files:**
- Modify: `src/lib/estimate/EstimateContext.tsx` (full rewrite)
- Modify: `src/lib/estimate/EstimateContext.test.tsx` (full rewrite)
- Modify: `src/components/SummaryStrip.test.tsx:38-42` (add the two new required `EstimateProvider` props)

**Interfaces:**
- Consumes: `saveProjectDraft` (Phase 1).
- Produces: `EstimateProvider` now requires `projectId: string` and `initialDraft: PersistedDraft | null` props (in addition to the existing `referenceData`/`estimateDefaults`). `useEstimate()`'s return value gains `projectId: string` and `flushSave: () => Promise<void>`. Task 4's new `project/[projectId]/layout.tsx` passes the two new props; Task 5's Sidebar reads `projectId` and calls `flushSave()`.

- [ ] **Step 1: Replace `EstimateContext.tsx` in full**

Replace the entire contents of `src/lib/estimate/EstimateContext.tsx` with:

```tsx
// src/lib/estimate/EstimateContext.tsx
'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildEstimateResult } from '@/lib/calc';
import type {
  EstimateInput, EstimateResult, LaborTaskLineInput, MarkupInputs,
  MaterialLineInput, PassThroughInput, ReferenceData,
} from '@/lib/calc';
import type { EstimateDefaultsData } from '@/lib/data/loadReferenceData';
import { saveProjectDraft } from '@/lib/project/saveProjectDraft';
import { upsertLine } from './upsertLine';

const PERSIST_DEBOUNCE_MS = 500;

export interface PersistedDraft {
  coverInfo: CoverInfo;
  materials: MaterialLineInput[];
  contingencyPct: number;
  shippingHandling: number;
  loeTasks: LaborTaskLineInput[];
  sowTasks: LaborTaskLineInput[];
  technicianCount: number;
  passThroughs: PassThroughInput;
  markups: MarkupInputs;
}

export interface CoverInfo {
  client: string;
  project: string;
  rfpDate: string;
  bidDueDate: string;
  estimator: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  customerType: string;
  jobSiteAddress: string;
  projectOverview: string;
}

const EMPTY_COVER_INFO: CoverInfo = {
  client: '', project: '', rfpDate: '', bidDueDate: '', estimator: '',
  contactName: '', contactPhone: '', contactEmail: '', customerType: '',
  jobSiteAddress: '', projectOverview: '',
};

function buildBlankDraft(estimateDefaults: EstimateDefaultsData): PersistedDraft {
  return {
    coverInfo: EMPTY_COVER_INFO,
    materials: [],
    contingencyPct: estimateDefaults.contingencyPct,
    shippingHandling: 0,
    loeTasks: [],
    sowTasks: [],
    technicianCount: 4,
    passThroughs: { perDiem: [], lodging: [], travel: [], airfare: [], rentals: [], softCosts: [] },
    markups: {
      laborMarkupPct: estimateDefaults.laborMarkupPct,
      passThroughMarkupPct: estimateDefaults.passThroughMarkupPct,
      materialMarkupPct: estimateDefaults.materialMarkupPct,
      corporateMarkupPct: estimateDefaults.corporateMarkupPct,
      marginTweak: 0,
      taxRate: estimateDefaults.taxRate,
    },
  };
}

interface EstimateContextValue {
  projectId: string;
  referenceData: ReferenceData;
  coverInfo: CoverInfo;
  setCoverInfo: (patch: Partial<CoverInfo>) => void;
  input: EstimateInput;
  result: EstimateResult;
  setMaterialQuantity: (key: string, quantity: number) => void;
  setContingencyPct: (pct: number) => void;
  setShippingHandling: (amount: number) => void;
  setLoeTaskQuantity: (key: string, quantity: number) => void;
  setSowTaskQuantity: (key: string, quantity: number) => void;
  setTechnicianCount: (count: number) => void;
  setPassThroughs: (patch: Partial<PassThroughInput>) => void;
  setMarkups: (patch: Partial<MarkupInputs>) => void;
  flushSave: () => Promise<void>;
}

const EstimateContext = createContext<EstimateContextValue | null>(null);

interface PendingSave {
  draft: PersistedDraft;
  draftJson: string;
  timer: ReturnType<typeof setTimeout>;
}

export function EstimateProvider({
  projectId,
  referenceData,
  estimateDefaults,
  initialDraft,
  children,
}: {
  projectId: string;
  referenceData: ReferenceData;
  estimateDefaults: EstimateDefaultsData;
  initialDraft: PersistedDraft | null;
  children: ReactNode;
}) {
  const [baseline] = useState<PersistedDraft>(() => initialDraft ?? buildBlankDraft(estimateDefaults));

  const [coverInfo, setCoverInfoState] = useState<CoverInfo>(baseline.coverInfo);
  const [materials, setMaterials] = useState<MaterialLineInput[]>(baseline.materials);
  const [contingencyPct, setContingencyPct] = useState(baseline.contingencyPct);
  const [shippingHandling, setShippingHandling] = useState(baseline.shippingHandling);
  const [loeTasks, setLoeTasks] = useState<LaborTaskLineInput[]>(baseline.loeTasks);
  const [sowTasks, setSowTasks] = useState<LaborTaskLineInput[]>(baseline.sowTasks);
  const [technicianCount, setTechnicianCount] = useState(baseline.technicianCount);
  const [passThroughs, setPassThroughsState] = useState<PassThroughInput>(baseline.passThroughs);
  const [markups, setMarkupsState] = useState<MarkupInputs>(baseline.markups);

  const lastSavedJsonRef = useRef(JSON.stringify(baseline));
  const pendingSaveRef = useRef<PendingSave | null>(null);

  const currentDraft: PersistedDraft = {
    coverInfo, materials, contingencyPct, shippingHandling, loeTasks, sowTasks,
    technicianCount, passThroughs, markups,
  };

  const isDirty = JSON.stringify(currentDraft) !== lastSavedJsonRef.current;

  // Debounced autosave: write the current draft to the database shortly after any change.
  // Comparing against lastSavedJsonRef before scheduling a save is what naturally prevents a
  // redundant save firing right after the initial mount — currentDraft equals baseline (and
  // therefore lastSavedJsonRef's initial value) at that point, so this returns early.
  useEffect(() => {
    const draftJson = JSON.stringify(currentDraft);
    if (draftJson === lastSavedJsonRef.current) return;
    const timer = setTimeout(() => {
      saveProjectDraft(projectId, currentDraft);
      lastSavedJsonRef.current = draftJson;
      pendingSaveRef.current = null;
    }, PERSIST_DEBOUNCE_MS);
    pendingSaveRef.current = { draft: currentDraft, draftJson, timer };
    return () => clearTimeout(timer);
  }, [
    projectId, coverInfo, materials, contingencyPct, shippingHandling,
    loeTasks, sowTasks, technicianCount, passThroughs, markups,
  ]);

  // Warn on an actual browser unload (refresh, close, external navigation) when there's a
  // pending change that hasn't been saved yet. In-app navigation (e.g. the sidebar's All
  // Projects button) instead calls flushSave() directly and never hits this path.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  async function flushSave(): Promise<void> {
    const pending = pendingSaveRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingSaveRef.current = null;
    await saveProjectDraft(projectId, pending.draft);
    lastSavedJsonRef.current = pending.draftJson;
  }

  const input: EstimateInput = useMemo(
    () => ({ materials, contingencyPct, shippingHandling, loeTasks, sowTasks, technicianCount, passThroughs, markups }),
    [materials, contingencyPct, shippingHandling, loeTasks, sowTasks, technicianCount, passThroughs, markups],
  );

  const result = useMemo(() => buildEstimateResult(input, referenceData), [input, referenceData]);

  const value: EstimateContextValue = {
    projectId,
    referenceData,
    coverInfo,
    setCoverInfo: (patch) => setCoverInfoState((prev) => ({ ...prev, ...patch })),
    input,
    result,
    setMaterialQuantity: (key, quantity) => setMaterials((prev) => upsertLine(prev, key, quantity)),
    setContingencyPct,
    setShippingHandling,
    setLoeTaskQuantity: (key, quantity) => setLoeTasks((prev) => upsertLine(prev, key, quantity)),
    setSowTaskQuantity: (key, quantity) => setSowTasks((prev) => upsertLine(prev, key, quantity)),
    setTechnicianCount,
    setPassThroughs: (patch) => setPassThroughsState((prev) => ({ ...prev, ...patch })),
    setMarkups: (patch) => setMarkupsState((prev) => ({ ...prev, ...patch })),
    flushSave,
  };

  return <EstimateContext.Provider value={value}>{children}</EstimateContext.Provider>;
}

export function useEstimate(): EstimateContextValue {
  const ctx = useContext(EstimateContext);
  if (!ctx) throw new Error('useEstimate must be used within an EstimateProvider');
  return ctx;
}
```

- [ ] **Step 2: Replace `EstimateContext.test.tsx` in full**

Replace the entire contents of `src/lib/estimate/EstimateContext.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EstimateProvider, useEstimate, type PersistedDraft } from './EstimateContext';
import { saveProjectDraft } from '@/lib/project/saveProjectDraft';
import type { ReferenceData } from '@/lib/calc';

vi.mock('@/lib/project/saveProjectDraft', () => ({
  saveProjectDraft: vi.fn().mockResolvedValue(undefined),
}));

const referenceData: ReferenceData = {
  materialItems: [
    { key: 'bom-3', type: 'DC Power Plant', manufacturer: 'Vertiv', model: '582137200', description: 'NetSure 5100', vendor: 'Anixter', category: 'DAS Materials', unitCost: 4685 },
  ],
  laborTasks: [],
  laborRates: [
    { role: 'Technician', hourlyRate: 85, rawWageRate: 85 },
    { role: 'Construction Manager', hourlyRate: 95, rawWageRate: 95 },
    { role: 'RF-Engineer', hourlyRate: 100, rawWageRate: 75 },
    { role: 'RF-Technician', hourlyRate: 75, rawWageRate: 75 },
    { role: 'Project Coordinator', hourlyRate: 55, rawWageRate: 55 },
    { role: 'Project Manager', hourlyRate: 100, rawWageRate: 100 },
  ],
  crewSizeTable: [{ technicianCount: 4, cmsNeeded: 1 }],
  laborProjectionSettings: {
    hoursPerManDay: 8, hoursPerManWeek: 40, stagingMaterialMultiplier: 0.05,
    cmPercentOfTechHours: 0.5, pmPercentOfTechHours: 0.25, coordinatorPercentOfTechHours: 0.15,
  },
  passThroughRates: {
    perDiemRateByRole: [], lodgingRateByRole: [], airfareCostByRole: [], rentals: [], softCosts: [],
  },
};

const estimateDefaults = {
  laborMarkupPct: 0.25, passThroughMarkupPct: 0.25, materialMarkupPct: 0.25,
  corporateMarkupPct: 0.05, taxRate: 0.0825, contingencyPct: 0.10,
};

function TestConsumer() {
  const { result, setMaterialQuantity, coverInfo, setCoverInfo, flushSave } = useEstimate();
  return (
    <div>
      <div data-testid="hardware-total">{result.materials.hardwareTotal}</div>
      <div data-testid="client-name">{coverInfo.client}</div>
      <button onClick={() => setMaterialQuantity('bom-3', 2)}>Set Qty</button>
      <button onClick={() => setCoverInfo({ client: 'Acme Corp' })}>Set Client</button>
      <button onClick={() => flushSave()}>Flush</button>
    </div>
  );
}

describe('EstimateProvider / useEstimate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recomputes the result when a material quantity is set', () => {
    render(
      <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
        <TestConsumer />
      </EstimateProvider>,
    );

    expect(screen.getByTestId('hardware-total').textContent).toBe('0');
    fireEvent.click(screen.getByText('Set Qty'));
    // 4685 * 2 = 9370, +10% contingency (937) = 10307
    expect(screen.getByTestId('hardware-total').textContent).toBe('10307');
  });

  it('updates cover info independently of the estimate calculation', () => {
    render(
      <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
        <TestConsumer />
      </EstimateProvider>,
    );

    fireEvent.click(screen.getByText('Set Client'));
    expect(screen.getByTestId('client-name').textContent).toBe('Acme Corp');
  });

  it('initializes state from the initialDraft prop instead of a blank estimate', () => {
    const initialDraft: PersistedDraft = {
      coverInfo: {
        client: 'Restored Corp', project: '', rfpDate: '', bidDueDate: '', estimator: '',
        contactName: '', contactPhone: '', contactEmail: '', customerType: '',
        jobSiteAddress: '', projectOverview: '',
      },
      materials: [{ key: 'bom-3', quantity: 3 }],
      contingencyPct: 0.10,
      shippingHandling: 0,
      loeTasks: [],
      sowTasks: [],
      technicianCount: 4,
      passThroughs: { perDiem: [], lodging: [], travel: [], airfare: [], rentals: [], softCosts: [] },
      markups: {
        laborMarkupPct: 0.25, passThroughMarkupPct: 0.25, materialMarkupPct: 0.25,
        corporateMarkupPct: 0.05, marginTweak: 0, taxRate: 0.0825,
      },
    };

    render(
      <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={initialDraft}>
        <TestConsumer />
      </EstimateProvider>,
    );

    expect(screen.getByTestId('client-name').textContent).toBe('Restored Corp');
    // 4685 * 3 = 14055, +10% contingency (1405.5) = 15460.5
    expect(screen.getByTestId('hardware-total').textContent).toBe('15460.5');
  });

  it('calls saveProjectDraft after the debounce window once something changes', async () => {
    vi.useFakeTimers();
    try {
      render(
        <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
          <TestConsumer />
        </EstimateProvider>,
      );

      expect(saveProjectDraft).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText('Set Client'));
      expect(saveProjectDraft).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      expect(saveProjectDraft).toHaveBeenCalledTimes(1);
      const [projectId, draft] = vi.mocked(saveProjectDraft).mock.calls[0];
      expect(projectId).toBe('proj-1');
      expect(draft.coverInfo.client).toBe('Acme Corp');
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushSave immediately saves a pending change without waiting for the debounce', async () => {
    render(
      <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
        <TestConsumer />
      </EstimateProvider>,
    );

    fireEvent.click(screen.getByText('Set Client'));
    expect(saveProjectDraft).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByText('Flush'));
    });

    expect(saveProjectDraft).toHaveBeenCalledTimes(1);
  });

  it('does not warn before unload while the estimate is clean', () => {
    render(
      <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
        <TestConsumer />
      </EstimateProvider>,
    );

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('warns before unload once the estimate becomes dirty', () => {
    render(
      <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
        <TestConsumer />
      </EstimateProvider>,
    );

    fireEvent.click(screen.getByText('Set Client'));

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
```

- [ ] **Step 3: Fix `SummaryStrip.test.tsx`'s now-broken `EstimateProvider` call**

In `src/components/SummaryStrip.test.tsx`, replace:

```tsx
      <EstimateProvider referenceData={referenceData} estimateDefaults={estimateDefaults}>
```

with:

```tsx
      <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
```

- [ ] **Step 4: Run the affected tests to verify they pass**

Run: `npx vitest run src/lib/estimate/EstimateContext.test.tsx src/components/SummaryStrip.test.tsx`
Expected: PASS (7 tests in `EstimateContext.test.tsx`, 1 in `SummaryStrip.test.tsx`).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: errors only in `src/app/(estimator)/layout.tsx` (still calling the old `EstimateProvider` signature) — this is expected and gets fixed in Task 4, which moves and rewrites that exact file next. No other errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/estimate/EstimateContext.tsx src/lib/estimate/EstimateContext.test.tsx src/components/SummaryStrip.test.tsx
git commit -m "feat: rewire EstimateContext off localStorage onto per-project persistence"
```

---

### Task 4: Move the estimator under `/project/[projectId]`

**Files:**
- Move: `src/app/(estimator)/layout.tsx` → `src/app/project/[projectId]/layout.tsx` (rewritten)
- Move: `src/app/(estimator)/page.tsx` → `src/app/project/[projectId]/page.tsx` (Cover Info; one line changed)
- Move: `src/app/(estimator)/materials/` → `src/app/project/[projectId]/materials/` (one line changed)
- Move: `src/app/(estimator)/labor/` → `src/app/project/[projectId]/labor/` (one line changed)
- Move: `src/app/(estimator)/pass-throughs/` → `src/app/project/[projectId]/pass-throughs/` (one line changed)
- Move: `src/app/(estimator)/summary/` → `src/app/project/[projectId]/summary/` (no changes needed)

**Interfaces:**
- Consumes: `loadProjectReferenceData`/`loadProjectEstimateDefaults` (Task 1), the rewritten `EstimateProvider` (Task 3).
- Produces: every estimator route now lives under `/project/[projectId]/...`. Task 5's Sidebar and Task 6's landing page link into these paths.

- [ ] **Step 1: Move the files**

```bash
mkdir -p "src/app/project/[projectId]"
git mv "src/app/(estimator)/layout.tsx" "src/app/project/[projectId]/layout.tsx"
git mv "src/app/(estimator)/page.tsx" "src/app/project/[projectId]/page.tsx"
git mv "src/app/(estimator)/materials" "src/app/project/[projectId]/materials"
git mv "src/app/(estimator)/labor" "src/app/project/[projectId]/labor"
git mv "src/app/(estimator)/pass-throughs" "src/app/project/[projectId]/pass-throughs"
git mv "src/app/(estimator)/summary" "src/app/project/[projectId]/summary"
rmdir "src/app/(estimator)"
```

- [ ] **Step 2: Rewrite the moved layout**

Replace the entire contents of `src/app/project/[projectId]/layout.tsx` with:

```tsx
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { loadProjectReferenceData, loadProjectEstimateDefaults } from '@/lib/data/loadProjectReferenceData';
import { EstimateProvider, type PersistedDraft } from '@/lib/estimate/EstimateContext';
import { AppShell } from '@/components/AppShell';

export const dynamic = 'force-dynamic';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectId: string };
}) {
  const project = await prisma.project.findUnique({ where: { id: params.projectId } });
  if (!project) notFound();

  const [referenceData, estimateDefaults] = await Promise.all([
    loadProjectReferenceData(params.projectId),
    loadProjectEstimateDefaults(params.projectId),
  ]);

  return (
    <EstimateProvider
      projectId={params.projectId}
      referenceData={referenceData}
      estimateDefaults={estimateDefaults}
      initialDraft={project.draftJson as unknown as PersistedDraft | null}
    >
      <AppShell>{children}</AppShell>
    </EstimateProvider>
  );
}
```

- [ ] **Step 3: Update the Cover Info page's `MoveToButton` and `useEstimate()` call**

In `src/app/project/[projectId]/page.tsx`, replace:

```tsx
  const { coverInfo, setCoverInfo } = useEstimate();
```

with:

```tsx
  const { coverInfo, setCoverInfo, projectId } = useEstimate();
```

And replace:

```tsx
        <MoveToButton href="/materials" label="→ Materials" />
```

with:

```tsx
        <MoveToButton href={`/project/${projectId}/materials`} label="→ Materials" />
```

- [ ] **Step 4: Update the Materials page's `MoveToButton` and `useEstimate()` call**

In `src/app/project/[projectId]/materials/page.tsx`, replace:

```tsx
  const { referenceData, input, result, setMaterialQuantity, setContingencyPct, setShippingHandling, coverInfo } = useEstimate();
```

with:

```tsx
  const { referenceData, input, result, setMaterialQuantity, setContingencyPct, setShippingHandling, coverInfo, projectId } = useEstimate();
```

And replace:

```tsx
      <MoveToButton href="/labor" label="→ Labor" />
```

with:

```tsx
      <MoveToButton href={`/project/${projectId}/labor`} label="→ Labor" />
```

- [ ] **Step 5: Update the Labor page's `MoveToButton` and `useEstimate()` call**

In `src/app/project/[projectId]/labor/page.tsx`, replace:

```tsx
  const {
    referenceData, input, result, setLoeTaskQuantity, setSowTaskQuantity, setTechnicianCount,
  } = useEstimate();
```

with:

```tsx
  const {
    referenceData, input, result, setLoeTaskQuantity, setSowTaskQuantity, setTechnicianCount, projectId,
  } = useEstimate();
```

And replace:

```tsx
      <MoveToButton href="/pass-throughs" label="→ Pass Throughs" />
```

with:

```tsx
      <MoveToButton href={`/project/${projectId}/pass-throughs`} label="→ Pass Throughs" />
```

- [ ] **Step 6: Update the Pass Throughs page's `MoveToButton` and `useEstimate()` call**

In `src/app/project/[projectId]/pass-throughs/page.tsx`, replace:

```tsx
  const { referenceData, input, result, setPassThroughs } = useEstimate();
```

with:

```tsx
  const { referenceData, input, result, setPassThroughs, projectId } = useEstimate();
```

And replace:

```tsx
      <MoveToButton href="/summary" label="→ Executive Summary" />
```

with:

```tsx
      <MoveToButton href={`/project/${projectId}/summary`} label="→ Executive Summary" />
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (this resolves the `(estimator)/layout.tsx` errors flagged as expected at the end of Task 3, since that file no longer exists at that path).

- [ ] **Step 8: Manually verify a project loads correctly at its new URL**

There's no landing page yet (that's Task 6), so create a project directly with a one-off script:

Run: `npx tsx -e "import('./src/lib/project/createProject').then(m => m.createProject()).then(p => console.log(p.id))"`

This prints a project id. Start the dev server (`PORT=4000 npm run dev`) and navigate to `http://localhost:4000/project/<that-id>` in a browser. Confirm: the Cover Info page renders with the sidebar, filling in Client/Project and clicking "→ Materials" navigates to `/project/<id>/materials` (not `/materials`), and every subsequent "→" button correctly carries the project id forward through Labor → Pass Throughs → Executive Summary.

Also confirm `http://localhost:4000/project/does-not-exist` renders Next.js's not-found page (proving the `notFound()` call in the new layout works).

- [ ] **Step 9: Commit**

`git mv` already staged the renames from Step 1; this just adds the content edits from Steps 2-6 on top of them.

```bash
git add "src/app/project"
git commit -m "feat: move estimator routes under /project/[projectId]"
```

---

### Task 5: Sidebar — All Projects button, project-scoped nav links

**Files:**
- Modify: `src/components/Sidebar.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useEstimate()`'s `projectId` and `flushSave` (Task 3).
- Produces: no new exports — `Sidebar` is already rendered by the unchanged `AppShell`.

- [ ] **Step 1: Replace `Sidebar.tsx` in full**

Replace the entire contents of `src/components/Sidebar.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  FileText, Package, HardHat, Receipt, BarChart3, Folder, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useEstimate } from '@/lib/estimate/EstimateContext';

const NARROW_VIEWPORT_QUERY = '(max-width: 768px)';

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { projectId, flushSave } = useEstimate();

  const navItems = [
    { href: `/project/${projectId}`, label: 'Cover Info', icon: FileText },
    { href: `/project/${projectId}/materials`, label: 'Materials', icon: Package },
    { href: `/project/${projectId}/labor`, label: 'Labor', icon: HardHat },
    { href: `/project/${projectId}/pass-throughs`, label: 'Pass Throughs', icon: Receipt },
    { href: `/project/${projectId}/summary`, label: 'Executive Summary', icon: BarChart3 },
  ];

  // Auto-collapse to reclaim width on tablet/narrow viewports. Only ever collapses
  // automatically (on mount, and when resizing into the narrow range) — it never
  // force-expands, so a manual expand is respected until the user collapses again.
  useEffect(() => {
    const mql = window.matchMedia(NARROW_VIEWPORT_QUERY);
    if (mql.matches) setCollapsed(true);
    function handleChange(e: MediaQueryListEvent) {
      if (e.matches) setCollapsed(true);
    }
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  async function handleAllProjectsClick() {
    await flushSave();
    router.push('/projects');
  }

  return (
    <nav
      className={cn(
        'flex flex-col bg-navy text-white transition-all duration-200',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-center gap-2 h-12 border-b border-white/10 hover:bg-navy-2 text-sm"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="w-5 h-5" aria-hidden="true" /> : (
          <>
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            Collapse
          </>
        )}
      </button>
      <ul className="flex-1 py-2">
        {navItems.map((item) => {
          const active = item.href === `/project/${projectId}`
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 text-sm font-body transition-colors',
                  collapsed && 'justify-center px-0',
                  active ? 'bg-navy-2 border-l-4 border-red text-white' : 'text-white/70 hover:bg-navy-2 hover:text-white',
                )}
                title={collapsed ? item.label : undefined}
                aria-label={collapsed ? item.label : undefined}
              >
                <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={handleAllProjectsClick}
            className={cn(
              'flex items-center gap-3 px-4 py-3 text-sm font-body transition-colors w-full text-left',
              collapsed && 'justify-center px-0',
              'text-white/70 hover:bg-navy-2 hover:text-white',
            )}
            title={collapsed ? 'All Projects' : undefined}
            aria-label={collapsed ? 'All Projects' : undefined}
          >
            <Folder className="w-5 h-5 shrink-0" aria-hidden="true" />
            {!collapsed && <span>All Projects</span>}
          </button>
        </li>
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify in the browser**

Using the same project URL from Task 4's Step 8: confirm the sidebar shows Cover Info/Materials/Labor/Pass Throughs/Executive Summary (no "Admin" item — that's expected, it returns in Phase 3) followed by "All Projects". Clicking a nav item highlights it correctly. Clicking "All Projects" will 404 for now (`/projects` doesn't exist until Task 7) — that's expected at this point in the plan; just confirm it attempts to navigate there (e.g. via the Network tab or the resulting 404 page) rather than throwing a JS error.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add All Projects sidebar button, scope nav links to the current project"
```

---

### Task 6: Landing page

**Files:**
- Create: `src/app/page.tsx`

**Interfaces:**
- Consumes: `createProject()` (Phase 1).
- Produces: `/` now renders the landing page instead of Cover Info (which moved to `/project/[projectId]` in Task 4).

- [ ] **Step 1: Create the landing page**

Create `src/app/page.tsx`:

```tsx
// src/app/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { createProject } from '@/lib/project/createProject';

export default function LandingPage() {
  const router = useRouter();

  async function handleCreateNewProject() {
    const { id } = await createProject();
    router.push(`/project/${id}`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-mist">
      <div className="flex flex-col sm:flex-row gap-6">
        <button
          type="button"
          onClick={handleCreateNewProject}
          className="bg-red hover:bg-red-700 text-white font-display font-semibold text-lg px-10 py-6 rounded-lg transition-colors"
        >
          Create New Project
        </button>
        <button
          type="button"
          onClick={() => router.push('/projects')}
          className="bg-navy hover:bg-navy-2 text-white font-display font-semibold text-lg px-10 py-6 rounded-lg transition-colors"
        >
          Explore Current Projects
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify in the browser**

With the dev server running, navigate to `http://localhost:4000/`. Confirm it shows the two buttons with no sidebar. Click "Create New Project" and confirm it navigates to `/project/<a-new-id>` showing a blank Cover Info page. Click "Explore Current Projects" and confirm it attempts to navigate to `/projects` (still 404 until Task 7 — expected at this point).

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add landing page"
```

---

### Task 7: All Projects page

**Files:**
- Create: `src/components/ProjectsTable.tsx`
- Test: `src/components/ProjectsTable.test.tsx`
- Create: `src/app/projects/page.tsx`

**Interfaces:**
- Consumes: `deleteProject()` (Task 2).
- Produces: `/projects` — the last piece of Phase 2. Nothing later in this plan depends on it (it's the final task).

- [ ] **Step 1: Write the failing test**

Create `src/components/ProjectsTable.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectsTable } from './ProjectsTable';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const PROJECTS = [
  { id: 'p1', name: 'Downtown Stadium DAS', client: 'Acme Corp' },
  { id: 'p2', name: 'Airport Terminal B', client: 'Globex Inc' },
  { id: 'p3', name: '', client: '' },
];

describe('ProjectsTable', () => {
  it('renders every project by default', () => {
    render(<ProjectsTable projects={PROJECTS} />);
    expect(screen.getByText('Downtown Stadium DAS')).toBeInTheDocument();
    expect(screen.getByText('Airport Terminal B')).toBeInTheDocument();
    expect(screen.getByText('Untitled Project')).toBeInTheDocument();
  });

  it('filters by name, case-insensitively', () => {
    render(<ProjectsTable projects={PROJECTS} />);
    fireEvent.change(screen.getByPlaceholderText('Search name…'), { target: { value: 'stadium' } });
    expect(screen.getByText('Downtown Stadium DAS')).toBeInTheDocument();
    expect(screen.queryByText('Airport Terminal B')).not.toBeInTheDocument();
  });

  it('filters by client, case-insensitively', () => {
    render(<ProjectsTable projects={PROJECTS} />);
    fireEvent.change(screen.getByPlaceholderText('Search client…'), { target: { value: 'globex' } });
    expect(screen.getByText('Airport Terminal B')).toBeInTheDocument();
    expect(screen.queryByText('Downtown Stadium DAS')).not.toBeInTheDocument();
  });

  it('shows a message when no project matches the filter', () => {
    render(<ProjectsTable projects={PROJECTS} />);
    fireEvent.change(screen.getByPlaceholderText('Search name…'), { target: { value: 'nonexistent' } });
    expect(screen.getByText('No projects match your filter.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/ProjectsTable.test.tsx`
Expected: FAIL — `Cannot find module './ProjectsTable'`.

- [ ] **Step 3: Implement `ProjectsTable`**

Create `src/components/ProjectsTable.tsx`:

```tsx
// src/components/ProjectsTable.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { deleteProject } from '@/lib/project/deleteProject';

interface ProjectRow {
  id: string;
  name: string;
  client: string;
}

export function ProjectsTable({ projects }: { projects: ProjectRow[] }) {
  const router = useRouter();
  const [nameFilter, setNameFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');

  const nameNeedle = nameFilter.trim().toLowerCase();
  const clientNeedle = clientFilter.trim().toLowerCase();

  const filtered = projects.filter((p) => {
    if (nameNeedle && !p.name.toLowerCase().includes(nameNeedle)) return false;
    if (clientNeedle && !p.client.toLowerCase().includes(clientNeedle)) return false;
    return true;
  });

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this project? This cannot be undone.')) return;
    await deleteProject(id);
    router.refresh();
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line">
        <input
          type="search"
          placeholder="Search name…"
          className="border border-line rounded px-3 py-1.5 text-sm"
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
        />
        <input
          type="search"
          placeholder="Search client…"
          className="border border-line rounded px-3 py-1.5 text-sm"
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
        />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-slate">
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Client</th>
            <th className="px-4 py-2 text-right">Edit</th>
            <th className="px-4 py-2 text-right">Delete</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-slate">No projects match your filter.</td>
            </tr>
          ) : (
            filtered.map((p, i) => (
              <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-mist'}>
                <td className="px-4 py-2">{p.name || 'Untitled Project'}</td>
                <td className="px-4 py-2">{p.client || '—'}</td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/project/${p.id}`} className="text-navy underline">Edit</Link>
                </td>
                <td className="px-4 py-2 text-right">
                  <button type="button" onClick={() => handleDelete(p.id)} className="text-red hover:text-red-700 underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/ProjectsTable.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Create the All Projects page**

Create `src/app/projects/page.tsx`:

```tsx
// src/app/projects/page.tsx
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { ProjectsTable } from '@/components/ProjectsTable';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({ orderBy: { updatedAt: 'desc' } });

  return (
    <div className="min-h-screen bg-mist p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-bold tracking-tight text-navy">All Projects</h1>
          <Link
            href="/admin"
            className="bg-navy hover:bg-navy-2 text-white font-display font-semibold text-sm px-4 py-2 rounded transition-colors"
          >
            Master Defaults
          </Link>
        </div>
        <ProjectsTable
          projects={projects.map((p) => ({ id: p.id, name: p.name, client: p.client }))}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Run the full test suite and build**

Run: `npx vitest run`
Expected: all tests pass (previous count plus the new tests from Tasks 1, 2, 3, and 7).

Run: `npm run build`
Expected: build succeeds. Route count changes: `/`, `/materials`, `/labor`, `/pass-throughs`, `/summary` are replaced by `/`, `/project/[projectId]`, `/project/[projectId]/materials`, `/project/[projectId]/labor`, `/project/[projectId]/pass-throughs`, `/project/[projectId]/summary`, `/projects`.

- [ ] **Step 8: Manually verify the full end-to-end flow in the browser**

With the dev server running:
1. Navigate to `/`. Click "Create New Project" — confirm it lands on a blank Cover Info page at `/project/<id>`.
2. Fill in Client and Project name. Wait a second (past the 500ms debounce), then reload the page — confirm the values you typed are still there (proving the server-side autosave and reload-from-`draftJson` round-trip works, not just in-memory state).
3. Set a material quantity on the Materials page.
4. Click "All Projects" in the sidebar. Confirm there's no popup and it navigates straight to `/projects`.
5. Confirm the project you just created appears in the table with the correct Name and Client (not "Untitled Project" / "—", since you filled those in).
6. Type into the Name filter and confirm the list narrows to matching projects; clear it and try the Client filter the same way.
7. Click "Edit" on your project. Confirm it reopens at `/project/<id>` with the same Client/Project/material quantity you set earlier.
8. Click "Master Defaults" top-right. Confirm it reaches the existing `/admin` password gate (unchanged).
9. Go back to `/projects`, click "Delete" on your test project, confirm the browser's native confirm dialog appears, accept it, and confirm the row disappears from the table without a full page reload.

- [ ] **Step 9: Commit**

```bash
git add src/components/ProjectsTable.tsx src/components/ProjectsTable.test.tsx src/app/projects/page.tsx
git commit -m "feat: add All Projects page"
```
