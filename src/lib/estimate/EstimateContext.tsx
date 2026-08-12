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

  const [lastSavedJson, setLastSavedJson] = useState(() => JSON.stringify(baseline));
  const pendingSaveRef = useRef<PendingSave | null>(null);

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
      saveProjectDraft(projectId, currentDraft);
      setLastSavedJson(draftJson);
      pendingSaveRef.current = null;
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
    const pending = pendingSaveRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingSaveRef.current = null;
    await saveProjectDraft(projectId, pending.draft);
    setLastSavedJson(pending.draftJson);
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
