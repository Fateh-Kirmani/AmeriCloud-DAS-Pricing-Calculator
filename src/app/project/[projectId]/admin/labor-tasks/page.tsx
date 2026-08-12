import { prisma } from '@/lib/db';
import { LaborTasksAdminClient } from './LaborTasksAdminClient';

export default async function ProjectLaborTasksAdminPage({ params }: { params: { projectId: string } }) {
  const tasks = await prisma.projectLaborTask.findMany({
    where: { projectId: params.projectId },
    orderBy: [{ sheet: 'asc' }, { category: 'asc' }, { key: 'asc' }],
  });
  return <LaborTasksAdminClient projectId={params.projectId} rows={tasks} />;
}
