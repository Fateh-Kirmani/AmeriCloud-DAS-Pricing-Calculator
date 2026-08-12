'use server';

import { prisma } from '@/lib/db';

export async function deleteProject(projectId: string): Promise<void> {
  await prisma.project.delete({ where: { id: projectId } });
}
