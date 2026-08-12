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
