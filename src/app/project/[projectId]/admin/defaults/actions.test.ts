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

  it('writes through to an existing saved draft, so the edit actually takes effect', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    // Simulate a draft already saved by the estimator (e.g. from a single earlier edit),
    // with its own now-stale copy of markups/tax/contingency plus an unrelated field that
    // must survive the write-through untouched.
    await prisma.project.update({
      where: { id: projectId },
      data: {
        draftJson: {
          coverInfo: { client: 'Acme', project: 'Test' },
          contingencyPct: 0.05,
          markups: {
            laborMarkupPct: 0.2, passThroughMarkupPct: 0.2, materialMarkupPct: 0.2,
            corporateMarkupPct: 0.05, taxRate: 0.05, marginTweak: 1234,
          },
        },
      },
    });

    const result = await updateProjectEstimateDefaults(projectId, {
      laborMarkupPct: '30', passThroughMarkupPct: '30', materialMarkupPct: '30',
      corporateMarkupPct: '10', taxRate: '9', contingencyPct: '15',
    });
    expect(result.error).toBeUndefined();

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    const draft = project!.draftJson as any;
    expect(draft.contingencyPct).toBe(0.15);
    expect(draft.markups).toMatchObject({
      laborMarkupPct: 0.3, passThroughMarkupPct: 0.3, materialMarkupPct: 0.3,
      corporateMarkupPct: 0.1, taxRate: 0.09,
    });
    // Unrelated draft fields (including a user-entered marginTweak) must survive untouched.
    expect(draft.markups.marginTweak).toBe(1234);
    expect(draft.coverInfo).toEqual({ client: 'Acme', project: 'Test' });
  });

  it('does not write a draft into a brand-new project that has none yet', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const result = await updateProjectEstimateDefaults(projectId, {
      laborMarkupPct: '30', passThroughMarkupPct: '30', materialMarkupPct: '30',
      corporateMarkupPct: '10', taxRate: '9', contingencyPct: '15',
    });
    expect(result.error).toBeUndefined();

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    expect(project!.draftJson).toBeNull();
  });
});
