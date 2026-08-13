import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createProject } from '@/lib/project/createProject';
import { updateProjectEstimateDefaults } from './actions';

describe('project defaults admin actions (integration — requires a live, seeded local Postgres)', () => {
  const projectIds: string[] = [];

  afterEach(async () => {
    for (const id of projectIds.splice(0)) {
      await prisma.project.deleteMany({ where: { id } });
    }
  });

  it('updates estimate defaults without affecting a different project', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const result = await updateProjectEstimateDefaults(projectA, {
      laborMarkupPct: '30', passThroughMarkupPct: '30', materialMarkupPct: '30',
      corporateMarkupPct: '10', taxRate: '9', contingencyPct: '15',
    });
    expect(result.error).toBeUndefined();

    const updatedA = await prisma.projectEstimateDefaults.findUnique({ where: { projectId: projectA } });
    expect(updatedA).toMatchObject({ laborMarkupPct: 0.3, taxRate: 0.09 });

    const untouchedB = await prisma.projectEstimateDefaults.findUnique({ where: { projectId: projectB } });
    expect(untouchedB!.laborMarkupPct).not.toBe(0.3);
  });

  it('rejects a markup percent over 100', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const result = await updateProjectEstimateDefaults(projectId, {
      laborMarkupPct: '150', passThroughMarkupPct: '30', materialMarkupPct: '30',
      corporateMarkupPct: '10', taxRate: '9', contingencyPct: '15',
    });
    expect(result.error).toMatch(/between 0 and 100/);
  });
});
