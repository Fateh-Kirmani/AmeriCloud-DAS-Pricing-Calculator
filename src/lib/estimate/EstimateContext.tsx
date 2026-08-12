'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildEstimateResult } from '@/lib/calc';
import type {
  EstimateInput, EstimateResult, LaborTaskLineInput, MarkupInputs,
  MaterialLineInput, PassThroughInput, ReferenceData,
} from '@/lib/calc';
import type { EstimateDefaultsData } from '@/lib/data/loadReferenceData';
import { upsertLine } from './upsertLine';

const DRAFT_STORAGE_KEY = 'das-estimate-draft-v1';
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

function loadDraft(): PersistedDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedDraft) : null;
  } catch {
    return null;
  }
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

interface EstimateContextValue {
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
}

const EstimateContext = createContext<EstimateContextValue | null>(null);

export function EstimateProvider({
  referenceData,
  estimateDefaults,
  children,
}: {
  referenceData: ReferenceData;
  estimateDefaults: EstimateDefaultsData;
  children: ReactNode;
}) {
  const [coverInfo, setCoverInfoState] = useState<CoverInfo>(EMPTY_COVER_INFO);
  const [materials, setMaterials] = useState<MaterialLineInput[]>([]);
  const [contingencyPct, setContingencyPct] = useState(estimateDefaults.contingencyPct);
  const [shippingHandling, setShippingHandling] = useState(0);
  const [loeTasks, setLoeTasks] = useState<LaborTaskLineInput[]>([]);
  const [sowTasks, setSowTasks] = useState<LaborTaskLineInput[]>([]);
  const [technicianCount, setTechnicianCount] = useState(4);
  const [passThroughs, setPassThroughsState] = useState<PassThroughInput>({
    perDiem: [], lodging: [], travel: [], airfare: [], rentals: [], softCosts: [],
  });
  const [markups, setMarkupsState] = useState<MarkupInputs>({
    laborMarkupPct: estimateDefaults.laborMarkupPct,
    passThroughMarkupPct: estimateDefaults.passThroughMarkupPct,
    materialMarkupPct: estimateDefaults.materialMarkupPct,
    corporateMarkupPct: estimateDefaults.corporateMarkupPct,
    marginTweak: 0,
    taxRate: estimateDefaults.taxRate,
  });

  const [isRehydrated, setIsRehydrated] = useState(false);

  // Rehydrate a previously-saved draft once, after mount. This must run in an effect (not a
  // lazy useState initializer) — localStorage doesn't exist during SSR, and computing the
  // initial value differently on the server vs. the client would cause a hydration mismatch.
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setCoverInfoState(draft.coverInfo);
      setMaterials(draft.materials);
      setContingencyPct(draft.contingencyPct);
      setShippingHandling(draft.shippingHandling);
      setLoeTasks(draft.loeTasks);
      setSowTasks(draft.sowTasks);
      setTechnicianCount(draft.technicianCount);
      setPassThroughsState(draft.passThroughs);
      setMarkupsState(draft.markups);
    }
    setIsRehydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDirty =
    Object.values(coverInfo).some((v) => v !== '') ||
    materials.length > 0 ||
    loeTasks.length > 0 ||
    sowTasks.length > 0 ||
    technicianCount !== 4 ||
    shippingHandling !== 0 ||
    passThroughs.perDiem.length > 0 ||
    passThroughs.lodging.length > 0 ||
    passThroughs.travel.length > 0 ||
    passThroughs.airfare.length > 0 ||
    passThroughs.rentals.length > 0 ||
    passThroughs.softCosts.length > 0 ||
    markups.marginTweak !== 0;

  // Debounced persistence: write the current draft to localStorage shortly after any change.
  // Gated on isRehydrated so the initial (pre-load) render never overwrites a saved draft
  // before it's had a chance to load.
  useEffect(() => {
    if (!isRehydrated) return;
    const timer = setTimeout(() => {
      if (!isDirty) {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        return;
      }
      const draft: PersistedDraft = {
        coverInfo, materials, contingencyPct, shippingHandling, loeTasks, sowTasks,
        technicianCount, passThroughs, markups,
      };
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    isRehydrated, isDirty, coverInfo, materials, contingencyPct, shippingHandling,
    loeTasks, sowTasks, technicianCount, passThroughs, markups,
  ]);

  // Warn on an actual browser unload (refresh, close, external navigation) when there's
  // unsaved work. Does not fire for in-app client-side route transitions (e.g. the sidebar's
  // Admin link) — those are covered by the rehydrate-on-mount effect above instead, since
  // navigating to a different route group unmounts and later remounts this provider.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const input: EstimateInput = useMemo(
    () => ({ materials, contingencyPct, shippingHandling, loeTasks, sowTasks, technicianCount, passThroughs, markups }),
    [materials, contingencyPct, shippingHandling, loeTasks, sowTasks, technicianCount, passThroughs, markups],
  );

  const result = useMemo(() => buildEstimateResult(input, referenceData), [input, referenceData]);

  const value: EstimateContextValue = {
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
  };

  return <EstimateContext.Provider value={value}>{children}</EstimateContext.Provider>;
}

export function useEstimate(): EstimateContextValue {
  const ctx = useContext(EstimateContext);
  if (!ctx) throw new Error('useEstimate must be used within an EstimateProvider');
  return ctx;
}
