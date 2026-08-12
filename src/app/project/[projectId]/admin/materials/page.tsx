import { prisma } from '@/lib/db';
import { MaterialsAdminClient } from './MaterialsAdminClient';

export default async function ProjectMaterialsAdminPage({ params }: { params: { projectId: string } }) {
  const materials = await prisma.projectMaterialItem.findMany({
    where: { projectId: params.projectId },
    orderBy: { key: 'asc' },
  });
  return <MaterialsAdminClient projectId={params.projectId} rows={materials} />;
}
