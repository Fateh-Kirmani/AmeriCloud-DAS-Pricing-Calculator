import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { loadProjectReferenceData, loadProjectEstimateDefaults } from '@/lib/data/loadProjectReferenceData';
import { EstimateProvider, normalizeDraft } from '@/lib/estimate/EstimateContext';
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
      // Forces a full remount (and thus a fresh `baseline` computation from this project's own
      // draftJson) whenever the project id in the URL changes. Next.js otherwise reuses this
      // layout instance across navigations within the same dynamic segment, which without this
      // key could let a future project-to-project navigation leave project A's in-memory draft
      // state mounted while `projectId` switches to B, silently overwriting B's saved draft.
      key={params.projectId}
      projectId={params.projectId}
      referenceData={referenceData}
      estimateDefaults={estimateDefaults}
      initialDraft={normalizeDraft(project.draftJson, estimateDefaults)}
    >
      <AppShell>{children}</AppShell>
    </EstimateProvider>
  );
}
