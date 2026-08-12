// src/lib/data/loadReferenceData.ts
import { prisma } from '@/lib/db';
import type { LaborRoleName, MaterialCategory, PassThroughRateKind } from '@prisma/client';
import type { LaborRole, LaborTaskDerivation, MaterialItem, ReferenceData } from '@/lib/calc';

export interface EstimateDefaultsData {
  laborMarkupPct: number;
  passThroughMarkupPct: number;
  materialMarkupPct: number;
  corporateMarkupPct: number;
  taxRate: number;
  contingencyPct: number;
}

export const CATEGORY_FROM_DB: Record<MaterialCategory, MaterialItem['category']> = {
  Consumable: 'Consumable',
  DAS_Materials: 'DAS Materials',
  BAT_Materials: 'BAT Materials',
};

const ROLE_FROM_DB: Record<LaborRoleName, LaborRole> = {
  Technician: 'Technician',
  Construction_Manager: 'Construction Manager',
  RF_Engineer: 'RF-Engineer',
  RF_Technician: 'RF-Technician',
  Project_Coordinator: 'Project Coordinator',
  Project_Manager: 'Project Manager',
};

export function mapRole(role: LaborRoleName): LaborRole {
  const mapped = ROLE_FROM_DB[role];
  if (!mapped) throw new Error(`Unknown labor role from DB: ${role}`);
  return mapped;
}

export function parseDerivedFrom(json: unknown, taskKey: string): LaborTaskDerivation | null {
  if (json === null || json === undefined) return null;
  if (
    typeof json !== 'object' ||
    !('terms' in json) ||
    !('divisor' in json) ||
    !Array.isArray((json as { terms: unknown }).terms) ||
    typeof (json as { divisor: unknown }).divisor !== 'number'
  ) {
    throw new Error(`Malformed derivedFromJson for labor task "${taskKey}": ${JSON.stringify(json)}`);
  }
  const rawTerms = (json as { terms: unknown[] }).terms;
  const terms = rawTerms.map((term, i) => {
    if (
      typeof term !== 'object' ||
      term === null ||
      typeof (term as { key: unknown }).key !== 'string' ||
      typeof (term as { coeff: unknown }).coeff !== 'number'
    ) {
      throw new Error(`Malformed derivedFromJson term ${i} for labor task "${taskKey}": ${JSON.stringify(term)}`);
    }
    return { key: (term as { key: string }).key, coeff: (term as { coeff: number }).coeff };
  });
  return { terms, divisor: (json as { divisor: number }).divisor };
}

export function mapRoleRate(rows: { role: LaborRoleName; amount: number }[]): { role: LaborRole; rate: number }[] {
  return rows.map((r) => ({ role: mapRole(r.role), rate: r.amount }));
}

const ROLE_ORDER: LaborRole[] = [
  'Technician', 'Construction Manager', 'RF-Engineer', 'RF-Technician', 'Project Coordinator', 'Project Manager',
];

// None of the Prisma queries below specify `orderBy`, so rows come back in DB-insertion order,
// which can legitimately differ between pass-through kinds (Per Diem vs. Lodging vs. Airfare)
// depending on the source workbook's row order. Sorting by the canonical role order here — once,
// at the data layer — keeps every consumer (Per Diem, Lodging, Travel, Airfare sections) showing
// roles in the same order, rather than patching each page's render loop separately.
export function sortByRole<T extends { role: LaborRole }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
}

export async function loadReferenceData(): Promise<ReferenceData> {
  const [
    materialItemsDb, laborTasksDb, laborRatesDb, crewSizeTableDb, settingsDb,
    perDiemDb, lodgingDb, airfareDb, rentalsDb, softCostsDb,
  ] = await Promise.all([
    prisma.materialItem.findMany(),
    prisma.laborTask.findMany(),
    prisma.laborRate.findMany(),
    prisma.crewSizeRow.findMany(),
    prisma.laborProjectionSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.passThroughRoleRate.findMany({ where: { kind: 'PerDiem' as PassThroughRateKind } }),
    prisma.passThroughRoleRate.findMany({ where: { kind: 'Lodging' as PassThroughRateKind } }),
    prisma.passThroughRoleRate.findMany({ where: { kind: 'Airfare' as PassThroughRateKind } }),
    prisma.rentalRate.findMany(),
    prisma.softCostRate.findMany(),
  ]);

  if (!settingsDb) {
    throw new Error('LaborProjectionSettings singleton row not found — run `npm run seed`.');
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

export async function loadEstimateDefaults(): Promise<EstimateDefaultsData> {
  const row = await prisma.estimateDefaults.findUnique({ where: { id: 'singleton' } });
  if (!row) throw new Error('EstimateDefaults singleton row not found — run `npm run seed`.');
  return {
    laborMarkupPct: row.laborMarkupPct,
    passThroughMarkupPct: row.passThroughMarkupPct,
    materialMarkupPct: row.materialMarkupPct,
    corporateMarkupPct: row.corporateMarkupPct,
    taxRate: row.taxRate,
    contingencyPct: row.contingencyPct,
  };
}
