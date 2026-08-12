// src/lib/data/loadProjectReferenceData.ts
import { prisma } from '@/lib/db';
import type { PassThroughRateKind } from '@prisma/client';
import type { ReferenceData } from '@/lib/calc';
import {
  buildReferenceData, buildEstimateDefaults,
  type EstimateDefaultsData, type ReferenceDataRawRows,
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

  try {
    return buildReferenceData({
      materialItemsDb,
      laborTasksDb,
      laborRatesDb,
      crewSizeTableDb,
      settingsDb,
      perDiemDb,
      lodgingDb,
      airfareDb,
      rentalsDb,
      softCostsDb,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'LaborProjectionSettings row not found.') {
      throw new Error(`ProjectLaborProjectionSettings row not found for project "${projectId}".`);
    }
    throw error;
  }
}

export async function loadProjectEstimateDefaults(projectId: string): Promise<EstimateDefaultsData> {
  const row = await prisma.projectEstimateDefaults.findUnique({ where: { projectId } });
  if (!row) throw new Error(`ProjectEstimateDefaults row not found for project "${projectId}".`);
  return buildEstimateDefaults(row);
}
