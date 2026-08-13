import { prisma } from '@/lib/db';
import { EstimateDefaultsForm } from './EstimateDefaultsForm';
import { updateEstimateDefaults } from './actions';

export default async function DefaultsAdminPage() {
  const defaults = await prisma.estimateDefaults.findUniqueOrThrow({ where: { id: 'singleton' } });
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold tracking-tight text-navy">Estimate Defaults</h1>
      <EstimateDefaultsForm defaults={defaults} onSave={updateEstimateDefaults} />
    </div>
  );
}
