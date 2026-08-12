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

export function buildBlankDraft(estimateDefaults: EstimateDefaultsData): PersistedDraft {
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

// Merges a persisted draft (loaded from Project.draftJson, an untyped Prisma Json column) over
// the standard blank-draft defaults, so any missing/renamed/added field in an older stored draft
// degrades to a safe default instead of surfacing as `undefined` deep inside the app. Deliberately
// not exhaustive/schema-validated — just resilient enough that a shape change doesn't crash a page
// that used to work. Array-valued fields (materials/loeTasks/sowTasks/passThroughs.*) come from the
// loaded draft when present and default to `[]` otherwise; they are never element-wise merged.
export function normalizeDraft(loaded: unknown, estimateDefaults: EstimateDefaultsData): PersistedDraft {
  const blank = buildBlankDraft(estimateDefaults);
  if (!loaded || typeof loaded !== 'object') return blank;
  const raw = loaded as Record<string, unknown>;

  const coverInfo = raw.coverInfo && typeof raw.coverInfo === 'object'
    ? { ...blank.coverInfo, ...(raw.coverInfo as Partial<CoverInfo>) }
    : blank.coverInfo;
  const markups = raw.markups && typeof raw.markups === 'object'
    ? { ...blank.markups, ...(raw.markups as Partial<MarkupInputs>) }
    : blank.markups;
  const passThroughs = raw.passThroughs && typeof raw.passThroughs === 'object'
    ? { ...blank.passThroughs, ...(raw.passThroughs as Partial<PassThroughInput>) }
    : blank.passThroughs;

  return {
    coverInfo,
    materials: Array.isArray(raw.materials) ? (raw.materials as MaterialLineInput[]) : blank.materials,
    contingencyPct: typeof raw.contingencyPct === 'number' ? raw.contingencyPct : blank.contingencyPct,
    shippingHandling: typeof raw.shippingHandling === 'number' ? raw.shippingHandling : blank.shippingHandling,
    loeTasks: Array.isArray(raw.loeTasks) ? (raw.loeTasks as LaborTaskLineInput[]) : blank.loeTasks,
    sowTasks: Array.isArray(raw.sowTasks) ? (raw.sowTasks as LaborTaskLineInput[]) : blank.sowTasks,
    technicianCount: typeof raw.technicianCount === 'number' ? raw.technicianCount : blank.technicianCount,
    passThroughs,
    markups,
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

  const [lastSavedJson, setLastSavedJson] = useState(() => JSON.stringify(baseline));
  const pendingSaveRef = useRef<PendingSave | null>(null);
  // Tracks the Promise of whichever save (timer-driven or flushSave-driven) is currently in
  // flight, so flushSave() can await a save that's already running instead of assuming "nothing
  // in pendingSaveRef" means "nothing to wait for" (pendingSaveRef stays populated with the
  // original entry for the whole duration of an in-flight save — it's only cleared on success).
  const inFlightSaveRef = useRef<Promise<void> | null>(null);

  const currentDraft: PersistedDraft = {
    coverInfo, materials, contingencyPct, shippingHandling, loeTasks, sowTasks,
    technicianCount, passThroughs, markups,
  };

  const isDirty = JSON.stringify(currentDraft) !== lastSavedJson;

  // Debounced autosave: write the current draft to the database shortly after any change.
  // Comparing against lastSavedJson before scheduling a save is what naturally prevents a
  // redundant save firing right after the initial mount — currentDraft equals baseline (and
  // therefore lastSavedJson's initial value) at that point, so this returns early. lastSavedJson
  // is tracked as state (not a plain ref) so that a completed autosave triggers a re-render,
  // which in turn recomputes isDirty and re-attaches the beforeunload listener with a fresh
  // closure — otherwise a successful save right before an unload could still warn as dirty.
  useEffect(() => {
    const draftJson = JSON.stringify(currentDraft);
    if (draftJson === lastSavedJson) {
      // Nothing changed relative to the last save. Also clear any pending save that was
      // scheduled by an earlier edit but has since been reverted (e.g. edit then undo within
      // the debounce window) — otherwise flushSave() would re-persist that now-stale draft.
      pendingSaveRef.current = null;
      return;
    }
    const timer = setTimeout(() => {
      // Captured so that, if a newer edit races ahead and repopulates pendingSaveRef with a
      // later draft before this save resolves, we only ever clear the entry we actually own —
      // never a newer pending entry that this save doesn't know about.
      const pendingAtStart = pendingSaveRef.current;
      const savePromise = saveProjectDraft(projectId, currentDraft)
        .then(() => {
          setLastSavedJson(draftJson);
          if (pendingSaveRef.current === pendingAtStart) {
            pendingSaveRef.current = null;
          }
        })
        .catch((error) => {
          console.error('Autosave failed:', error);
          // Deliberately do NOT clear pendingSaveRef or update lastSavedJson on failure —
          // isDirty stays true, and a later flushSave() (or the next edit's debounce cycle)
          // will retry with the same draft.
        })
        .finally(() => {
          if (inFlightSaveRef.current === savePromise) {
            inFlightSaveRef.current = null;
          }
        });
      inFlightSaveRef.current = savePromise;
    }, PERSIST_DEBOUNCE_MS);
    pendingSaveRef.current = { draft: currentDraft, draftJson, timer };
    return () => clearTimeout(timer);
  }, [
    projectId, lastSavedJson, coverInfo, materials, contingencyPct, shippingHandling,
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
    // If a save is already running (started by the debounce timer, or by an earlier overlapping
    // flushSave() call), wait for it to settle first rather than firing a second concurrent save
    // of the same/overlapping draft. This promise never rejects itself (its own .catch swallows
    // failures) — pendingSaveRef is what tells us afterward whether it actually succeeded.
    if (inFlightSaveRef.current) {
      await inFlightSaveRef.current;
    }
    const pending = pendingSaveRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingSaveRef.current = null;
    try {
      await saveProjectDraft(projectId, pending.draft);
      setLastSavedJson(pending.draftJson);
    } catch (error) {
      console.error('flushSave failed:', error);
      // Restore the pending entry so a later flushSave() call (or the next edit's debounce
      // cycle, which will see isDirty still true) retries persisting this draft.
      pendingSaveRef.current = pending;
      throw error;
    }
  }

  // flushSave is a plain function recreated every render (it closes over per-render state like
  // pending/currentDraft indirectly via the refs), so the best-effort-flush effect below keeps a
  // ref to the latest version rather than depending on it directly and re-subscribing every render.
  const flushSaveRef = useRef(flushSave);
  flushSaveRef.current = flushSave;

  // Best-effort safety net for the case the Sidebar's "All Projects" button doesn't cover: the
  // browser Back button, or any other client-side navigation away from a project page, which just
  // lets the debounce timer's cleanup clear the timer with no flush. Neither of these listeners is
  // a guarantee (the tab can still be killed instantly), just a best-effort reduction of the data
  // lost from up to one ~500ms debounce window.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        flushSaveRef.current().catch((error) => {
          console.error('Failed to flush save on visibility change:', error);
        });
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushSaveRef.current().catch((error) => {
        console.error('Failed to flush save on unmount:', error);
      });
    };
  }, []);

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
