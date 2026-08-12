import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { loadProjectReferenceData, loadProjectEstimateDefaults } from '@/lib/data/loadProjectReferenceData';
import { EstimateProvider, type PersistedDraft } from '@/lib/estimate/EstimateContext';
import { AppShell } from '@/components/AppShell';

export const dynamic = 'force-dynamic';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectId: string };
}) {
  const project = await prisma.project.findUnique({ where: { id: params.projectId } });
  if (!project) notFound();

  const [referenceData, estimateDefaults] = await Promise.all([
    loadProjectReferenceData(params.projectId),
    loadProjectEstimateDefaults(params.projectId),
  ]);

  return (
    <EstimateProvider
      projectId={params.projectId}
      referenceData={referenceData}
      estimateDefaults={estimateDefaults}
      initialDraft={project.draftJson as unknown as PersistedDraft | null}
    >
      <AppShell>{children}</AppShell>
    </EstimateProvider>
  );
}
