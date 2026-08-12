// src/lib/estimate/draft.ts
//
// Deliberately NOT 'use client'. `buildBlankDraft`/`normalizeDraft` need to be callable as plain
// functions from a Server Component (src/app/project/[projectId]/layout.tsx). Every export of a
// 'use client'-marked module — not just its default/component export, but plain helper functions
// too — gets replaced with a client-reference proxy object when imported from server code; calling
// that proxy as a function throws at render time. Keeping this logic in its own directive-free
// module lets both the server-side layout and the client-side EstimateContext import the real
// functions directly.

import type {
  LaborTaskLineInput, MarkupInputs, MaterialLineInput, PassThroughInput,
} from '@/lib/calc';
import type { EstimateDefaultsData } from '@/lib/data/loadReferenceData';

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
