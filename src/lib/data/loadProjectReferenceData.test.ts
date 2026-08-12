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
