import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createProject } from '@/lib/project/createProject';
import {
  updateProjectPassThroughRoleRate, createProjectRental, updateProjectRental, deleteProjectRental,
  createProjectSoftCost, updateProjectSoftCost, deleteProjectSoftCost,
} from './actions';

describe('project pass-throughs admin actions (integration — requires a live, seeded local Postgres)', () => {
  const projectIds: string[] = [];

  afterEach(async () => {
    for (const id of projectIds.splice(0)) {
      await prisma.project.deleteMany({ where: { id } });
    }
  });

  it('updates a pass-through role rate without affecting a different project', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const rateA = await prisma.projectPassThroughRoleRate.findFirst({ where: { projectId: projectA, kind: 'PerDiem' } });
    const rateB = await prisma.projectPassThroughRoleRate.findFirst({ where: { projectId: projectB, kind: 'PerDiem', role: rateA!.role } });

    const result = await updateProjectPassThroughRoleRate(projectA, rateA!.id, { amount: '999' });
    expect(result.error).toBeUndefined();

    const updatedA = await prisma.projectPassThroughRoleRate.findUnique({ where: { id: rateA!.id } });
    expect(updatedA!.amount).toBe(999);

    const untouchedB = await prisma.projectPassThroughRoleRate.findUnique({ where: { id: rateB!.id } });
    expect(untouchedB!.amount).not.toBe(999);
  });

  it('rejects updating a pass-through role rate with a mismatched projectId/id pair, leaving the row unchanged', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const rateA = await prisma.projectPassThroughRoleRate.findFirst({ where: { projectId: projectA, kind: 'PerDiem' } });
    const originalAmount = rateA!.amount;

    const result = await updateProjectPassThroughRoleRate(projectB, rateA!.id, { amount: '999' });
    expect(result.error).toMatch(/not found/i);

    const untouchedA = await prisma.projectPassThroughRoleRate.findUnique({ where: { id: rateA!.id } });
    expect(untouchedA!.amount).toBe(originalAmount);
  });

  it('creates, updates, and deletes a rental scoped to one project', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const created = await createProjectRental(projectId, { key: 'test-proj-rental-1', name: 'Test Rental', rate: '50', unit: 'day' });
    expect(created.error).toBeUndefined();

    const row = await prisma.projectRentalRate.findUnique({ where: { projectId_key: { projectId, key: 'test-proj-rental-1' } } });
    expect(row).toMatchObject({ name: 'Test Rental', rate: 50 });

    const updated = await updateProjectRental(projectId, row!.id, { key: 'test-proj-rental-1', name: 'Renamed', rate: '75', unit: 'day' });
    expect(updated.error).toBeUndefined();
    const afterUpdate = await prisma.projectRentalRate.findUnique({ where: { id: row!.id } });
    expect(afterUpdate).toMatchObject({ name: 'Renamed', rate: 75 });

    const deleted = await deleteProjectRental(projectId, row!.id);
    expect(deleted.error).toBeUndefined();
    const gone = await prisma.projectRentalRate.findUnique({ where: { id: row!.id } });
    expect(gone).toBeNull();
  });

  it('allows the same rental key in two different projects', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const resultA = await createProjectRental(projectA, { key: 'test-proj-rental-shared', name: 'N', rate: '1', unit: 'day' });
    const resultB = await createProjectRental(projectB, { key: 'test-proj-rental-shared', name: 'N', rate: '1', unit: 'day' });
    expect(resultA.error).toBeUndefined();
    expect(resultB.error).toBeUndefined();
  });

  it('rejects updating a rental with a mismatched projectId/id pair, leaving the row unchanged', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const created = await createProjectRental(projectA, { key: 'test-proj-rental-mismatch-update', name: 'Original', rate: '50', unit: 'day' });
    expect(created.error).toBeUndefined();
    const rowA = await prisma.projectRentalRate.findUnique({ where: { projectId_key: { projectId: projectA, key: 'test-proj-rental-mismatch-update' } } });

    const result = await updateProjectRental(projectB, rowA!.id, { key: 'test-proj-rental-mismatch-update', name: 'Hacked', rate: '999', unit: 'day' });
    expect(result.error).toMatch(/not found/i);

    const unchanged = await prisma.projectRentalRate.findUnique({ where: { id: rowA!.id } });
    expect(unchanged).toMatchObject({ name: 'Original', rate: 50 });
  });

  it('rejects deleting a rental with a mismatched projectId/id pair, leaving the row in place', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const created = await createProjectRental(projectA, { key: 'test-proj-rental-mismatch-delete', name: 'Still Here', rate: '50', unit: 'day' });
    expect(created.error).toBeUndefined();
    const rowA = await prisma.projectRentalRate.findUnique({ where: { projectId_key: { projectId: projectA, key: 'test-proj-rental-mismatch-delete' } } });

    const result = await deleteProjectRental(projectB, rowA!.id);
    expect(result.error).toMatch(/not found/i);

    const stillThere = await prisma.projectRentalRate.findUnique({ where: { id: rowA!.id } });
    expect(stillThere).toMatchObject({ projectId: projectA, name: 'Still Here' });
  });

  it('creates, updates, and deletes a soft cost scoped to one project', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const created = await createProjectSoftCost(projectId, { key: 'test-proj-softcost-1', name: 'Test Soft Cost', fee: '25' });
    expect(created.error).toBeUndefined();

    const row = await prisma.projectSoftCostRate.findUnique({ where: { projectId_key: { projectId, key: 'test-proj-softcost-1' } } });
    expect(row).toMatchObject({ name: 'Test Soft Cost', fee: 25 });

    const updated = await updateProjectSoftCost(projectId, row!.id, { key: 'test-proj-softcost-1', name: 'Renamed', fee: '40' });
    expect(updated.error).toBeUndefined();
    const afterUpdate = await prisma.projectSoftCostRate.findUnique({ where: { id: row!.id } });
    expect(afterUpdate).toMatchObject({ name: 'Renamed', fee: 40 });

    const deleted = await deleteProjectSoftCost(projectId, row!.id);
    expect(deleted.error).toBeUndefined();
    const gone = await prisma.projectSoftCostRate.findUnique({ where: { id: row!.id } });
    expect(gone).toBeNull();
  });

  it('rejects updating a soft cost with a mismatched projectId/id pair, leaving the row unchanged', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const created = await createProjectSoftCost(projectA, { key: 'test-proj-softcost-mismatch-update', name: 'Original', fee: '25' });
    expect(created.error).toBeUndefined();
    const rowA = await prisma.projectSoftCostRate.findUnique({ where: { projectId_key: { projectId: projectA, key: 'test-proj-softcost-mismatch-update' } } });

    const result = await updateProjectSoftCost(projectB, rowA!.id, { key: 'test-proj-softcost-mismatch-update', name: 'Hacked', fee: '999' });
    expect(result.error).toMatch(/not found/i);

    const unchanged = await prisma.projectSoftCostRate.findUnique({ where: { id: rowA!.id } });
    expect(unchanged).toMatchObject({ name: 'Original', fee: 25 });
  });

  it('rejects deleting a soft cost with a mismatched projectId/id pair, leaving the row in place', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const created = await createProjectSoftCost(projectA, { key: 'test-proj-softcost-mismatch-delete', name: 'Still Here', fee: '25' });
    expect(created.error).toBeUndefined();
    const rowA = await prisma.projectSoftCostRate.findUnique({ where: { projectId_key: { projectId: projectA, key: 'test-proj-softcost-mismatch-delete' } } });

    const result = await deleteProjectSoftCost(projectB, rowA!.id);
    expect(result.error).toMatch(/not found/i);

    const stillThere = await prisma.projectSoftCostRate.findUnique({ where: { id: rowA!.id } });
    expect(stillThere).toMatchObject({ projectId: projectA, name: 'Still Here' });
  });
});
