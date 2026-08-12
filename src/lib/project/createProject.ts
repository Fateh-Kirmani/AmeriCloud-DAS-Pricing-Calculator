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
