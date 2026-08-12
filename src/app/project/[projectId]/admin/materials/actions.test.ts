import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createProject } from '@/lib/project/createProject';
import { createProjectMaterial, updateProjectMaterial, deleteProjectMaterial } from './actions';

describe('project material admin actions (integration — requires a live, seeded local Postgres)', () => {
  const projectIds: string[] = [];

  afterEach(async () => {
    for (const id of projectIds.splice(0)) {
      await prisma.project.deleteMany({ where: { id } });
    }
  });

  it('creates a material scoped to one project', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const result = await createProjectMaterial(projectId, {
      key: 'test-proj-material-1', type: 'Test Type', manufacturer: 'Test Mfr', model: 'TM-1',
      description: 'A test material', vendor: 'Test Vendor', category: 'Consumable', unitCost: '12.5',
    });
    expect(result.error).toBeUndefined();

    const created = await prisma.projectMaterialItem.findUnique({
      where: { projectId_key: { projectId, key: 'test-proj-material-1' } },
    });
    expect(created).toMatchObject({ type: 'Test Type', unitCost: 12.5, category: 'Consumable' });
  });

  it('rejects a duplicate key within the same project', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const first = await createProjectMaterial(projectId, {
      key: 'test-proj-material-dup', type: 'T', description: 'D', category: 'Consumable', unitCost: '1',
      manufacturer: '', model: '', vendor: '',
    });
    expect(first.error).toBeUndefined();

    const second = await createProjectMaterial(projectId, {
      key: 'test-proj-material-dup', type: 'T2', description: 'D2', category: 'Consumable', unitCost: '2',
      manufacturer: '', model: '', vendor: '',
    });
    expect(second.error).toMatch(/already exists/);
  });

  it('allows the same key in two different projects', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const resultA = await createProjectMaterial(projectA, {
      key: 'test-proj-material-shared', type: 'T', description: 'D', category: 'Consumable', unitCost: '1',
      manufacturer: '', model: '', vendor: '',
    });
    const resultB = await createProjectMaterial(projectB, {
      key: 'test-proj-material-shared', type: 'T', description: 'D', category: 'Consumable', unitCost: '1',
      manufacturer: '', model: '', vendor: '',
    });
    expect(resultA.error).toBeUndefined();
    expect(resultB.error).toBeUndefined();
  });

  it('updates a material without affecting a different project holding the same key', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    await createProjectMaterial(projectA, {
      key: 'test-proj-material-update', type: 'T', description: 'D', category: 'Consumable', unitCost: '1',
      manufacturer: '', model: '', vendor: '',
    });
    await createProjectMaterial(projectB, {
      key: 'test-proj-material-update', type: 'T', description: 'D', category: 'Consumable', unitCost: '1',
      manufacturer: '', model: '', vendor: '',
    });
    const rowA = await prisma.projectMaterialItem.findUnique({
      where: { projectId_key: { projectId: projectA, key: 'test-proj-material-update' } },
    });

    const result = await updateProjectMaterial(projectA, rowA!.id, {
      key: 'test-proj-material-update', type: 'Updated Type', description: 'Updated',
      category: 'DAS_Materials', unitCost: '99.99', manufacturer: '', model: '', vendor: '',
    });
    expect(result.error).toBeUndefined();

    const updatedA = await prisma.projectMaterialItem.findUnique({ where: { id: rowA!.id } });
    expect(updatedA).toMatchObject({ type: 'Updated Type', unitCost: 99.99, category: 'DAS_Materials' });

    const untouchedB = await prisma.projectMaterialItem.findUnique({
      where: { projectId_key: { projectId: projectB, key: 'test-proj-material-update' } },
    });
    expect(untouchedB).toMatchObject({ type: 'T', unitCost: 1 });
  });

  it('deletes a material scoped to its own project', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const created = await prisma.projectMaterialItem.create({
      data: { projectId, key: 'test-proj-material-delete', type: 'T', description: 'D', category: 'Consumable', unitCost: 1 },
    });

    const result = await deleteProjectMaterial(projectId, created.id);
    expect(result.error).toBeUndefined();

    const gone = await prisma.projectMaterialItem.findUnique({ where: { id: created.id } });
    expect(gone).toBeNull();
  });

  it('returns a not-found error when deleting a mismatched project/id pair, and deletes nothing', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const materialA = await prisma.projectMaterialItem.create({
      data: { projectId: projectA, key: 'test-proj-material-mismatch', type: 'T', description: 'D', category: 'Consumable', unitCost: 1 },
    });

    const result = await deleteProjectMaterial(projectB, materialA.id);
    expect(result.error).toMatch(/not found/);

    const stillThere = await prisma.projectMaterialItem.findUnique({ where: { id: materialA.id } });
    expect(stillThere).toMatchObject({ projectId: projectA, type: 'T' });
  });

  it('rejects a negative unit cost', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);

    const result = await createProjectMaterial(projectId, {
      key: 'test-proj-material-negative', type: 'T', description: 'D', category: 'Consumable', unitCost: '-5',
      manufacturer: '', model: '', vendor: '',
    });
    expect(result.error).toMatch(/non-negative/);
  });
});
