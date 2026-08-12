import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createProject } from '@/lib/project/createProject';
import { createProjectLaborTask, updateProjectLaborTask, deleteProjectLaborTask } from './actions';

describe('project labor task admin actions (integration — requires a live, seeded local Postgres)', () => {
  const projectIds: string[] = [];

  afterEach(async () => {
    for (const id of projectIds.splice(0)) {
      await prisma.project.deleteMany({ where: { id } });
    }
  });

  it('creates a labor task scoped to one project', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const result = await createProjectLaborTask(projectId, {
      key: 'test-proj-task-1', sheet: 'LOE', category: 'Test Category', name: 'Test Task',
      minutesPerUnit: '30', unit: 'Each', laborRole: 'Technician', includedInSubtotal: 'true',
    });
    expect(result.error).toBeUndefined();

    const created = await prisma.projectLaborTask.findUnique({
      where: { projectId_key: { projectId, key: 'test-proj-task-1' } },
    });
    expect(created).toMatchObject({ sheet: 'LOE', minutesPerUnit: 30, laborRole: 'Technician' });
  });

  it('allows the same key in two different projects', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const resultA = await createProjectLaborTask(projectA, {
      key: 'test-proj-task-shared', sheet: 'LOE', category: 'C', name: 'N',
      minutesPerUnit: '10', unit: 'Each', laborRole: 'Technician', includedInSubtotal: 'true',
    });
    const resultB = await createProjectLaborTask(projectB, {
      key: 'test-proj-task-shared', sheet: 'LOE', category: 'C', name: 'N',
      minutesPerUnit: '10', unit: 'Each', laborRole: 'Technician', includedInSubtotal: 'true',
    });
    expect(resultA.error).toBeUndefined();
    expect(resultB.error).toBeUndefined();
  });

  it('updates a labor task without affecting a different project', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    await createProjectLaborTask(projectA, {
      key: 'test-proj-task-update', sheet: 'LOE', category: 'C', name: 'Original',
      minutesPerUnit: '10', unit: 'Each', laborRole: 'Technician', includedInSubtotal: 'true',
    });
    await createProjectLaborTask(projectB, {
      key: 'test-proj-task-update', sheet: 'LOE', category: 'C', name: 'Original',
      minutesPerUnit: '10', unit: 'Each', laborRole: 'Technician', includedInSubtotal: 'true',
    });
    const rowA = await prisma.projectLaborTask.findUnique({
      where: { projectId_key: { projectId: projectA, key: 'test-proj-task-update' } },
    });

    const result = await updateProjectLaborTask(projectA, rowA!.id, {
      key: 'test-proj-task-update', sheet: 'SOW', category: 'C', name: 'Renamed',
      minutesPerUnit: '20', unit: 'Each', laborRole: 'RF_Engineer', includedInSubtotal: 'false',
    });
    expect(result.error).toBeUndefined();

    const updatedA = await prisma.projectLaborTask.findUnique({ where: { id: rowA!.id } });
    expect(updatedA).toMatchObject({ sheet: 'SOW', name: 'Renamed', minutesPerUnit: 20 });

    const untouchedB = await prisma.projectLaborTask.findUnique({
      where: { projectId_key: { projectId: projectB, key: 'test-proj-task-update' } },
    });
    expect(untouchedB).toMatchObject({ sheet: 'LOE', name: 'Original' });
  });

  it('deletes a labor task scoped to its own project', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const created = await prisma.projectLaborTask.create({
      data: {
        projectId, key: 'test-proj-task-delete', sheet: 'LOE', category: 'C', name: 'N',
        minutesPerUnit: 10, unit: 'Each', laborRole: 'Technician',
      },
    });

    const result = await deleteProjectLaborTask(projectId, created.id);
    expect(result.error).toBeUndefined();

    const gone = await prisma.projectLaborTask.findUnique({ where: { id: created.id } });
    expect(gone).toBeNull();
  });

  it('blocks deleting a task that another task in the same project derives its quantity from', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const base = await prisma.projectLaborTask.create({
      data: {
        projectId, key: 'test-proj-task-base', sheet: 'LOE', category: 'C', name: 'Base',
        minutesPerUnit: 10, unit: 'Each', laborRole: 'Technician',
      },
    });
    await prisma.projectLaborTask.create({
      data: {
        projectId, key: 'test-proj-task-derived', sheet: 'LOE', category: 'C', name: 'Derived',
        minutesPerUnit: 10, unit: 'Each', laborRole: 'Technician',
        derivedFromJson: { terms: [{ key: 'test-proj-task-base', coeff: 1 }], divisor: 1 },
      },
    });

    const result = await deleteProjectLaborTask(projectId, base.id);
    expect(result.error).toMatch(/referenced by the derived quantity formula/);
  });

  it('does not block deleting a task when a different project has a same-named-key reference', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const baseInA = await prisma.projectLaborTask.create({
      data: {
        projectId: projectA, key: 'test-proj-task-base-cross', sheet: 'LOE', category: 'C', name: 'Base',
        minutesPerUnit: 10, unit: 'Each', laborRole: 'Technician',
      },
    });
    await prisma.projectLaborTask.create({
      data: {
        projectId: projectB, key: 'test-proj-task-derived-cross', sheet: 'LOE', category: 'C', name: 'Derived',
        minutesPerUnit: 10, unit: 'Each', laborRole: 'Technician',
        derivedFromJson: { terms: [{ key: 'test-proj-task-base-cross', coeff: 1 }], divisor: 1 },
      },
    });

    const result = await deleteProjectLaborTask(projectA, baseInA.id);
    expect(result.error).toBeUndefined();
  });

  it('rejects updating a task using a mismatched (projectId, id) pair and leaves it unchanged', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const created = await prisma.projectLaborTask.create({
      data: {
        projectId: projectA, key: 'test-proj-task-mismatch-update', sheet: 'LOE', category: 'Original', name: 'Original',
        minutesPerUnit: 10, unit: 'Each', laborRole: 'Technician',
      },
    });

    const result = await updateProjectLaborTask(projectB, created.id, {
      key: 'test-proj-task-mismatch-update', sheet: 'SOW', category: 'Hacked', name: 'Hacked',
      minutesPerUnit: '999', unit: 'Each', laborRole: 'RF_Engineer', includedInSubtotal: 'true',
    });
    expect(result.error).toMatch(/not found/);

    const unchanged = await prisma.projectLaborTask.findUnique({ where: { id: created.id } });
    expect(unchanged).toMatchObject({ category: 'Original', name: 'Original', minutesPerUnit: 10 });
  });

  it('rejects deleting a task using a mismatched (projectId, id) pair and leaves it intact', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const created = await prisma.projectLaborTask.create({
      data: {
        projectId: projectA, key: 'test-proj-task-mismatch-delete', sheet: 'LOE', category: 'C', name: 'N',
        minutesPerUnit: 10, unit: 'Each', laborRole: 'Technician',
      },
    });

    const result = await deleteProjectLaborTask(projectB, created.id);
    expect(result.error).toMatch(/not found/);

    const stillThere = await prisma.projectLaborTask.findUnique({ where: { id: created.id } });
    expect(stillThere).not.toBeNull();
  });
});
