import { prisma } from '@/lib/db';
import { EstimateDefaultsForm } from '@/app/admin/(sections)/defaults/EstimateDefaultsForm';
import { updateProjectEstimateDefaults } from './actions';

export default async function ProjectDefaultsAdminPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const defaults = await prisma.projectEstimateDefaults.findUniqueOrThrow({ where: { projectId } });
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold tracking-tight text-navy">Estimate Defaults</h1>
      <EstimateDefaultsForm
        defaults={defaults}
        onSave={updateProjectEstimateDefaults.bind(null, projectId)}
      />
    </div>
  );
}
