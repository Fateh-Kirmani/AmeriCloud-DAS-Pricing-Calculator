// src/lib/project/deleteProject.test.ts
import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/db';
import { createProject } from './createProject';
import { deleteProject } from './deleteProject';

describe('deleteProject (integration — requires a live, seeded local Postgres)', () => {
  it('deletes the project and cascades to its project-scoped reference-data rows', async () => {
    const { id } = await createProject();

    await deleteProject(id);

    const project = await prisma.project.findUnique({ where: { id } });
    expect(project).toBeNull();

    const remainingMaterials = await prisma.projectMaterialItem.count({ where: { projectId: id } });
    expect(remainingMaterials).toBe(0);
  });
});
