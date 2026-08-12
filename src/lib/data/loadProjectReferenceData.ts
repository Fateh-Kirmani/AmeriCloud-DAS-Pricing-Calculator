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
