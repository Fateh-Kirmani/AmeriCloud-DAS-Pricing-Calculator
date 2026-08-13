import { prisma } from '@/lib/db';
import { PassThroughRatesSection } from './PassThroughRatesSection';
import { RentalsSection } from './RentalsSection';
import { SoftCostsSection } from './SoftCostsSection';

export default async function ProjectPassThroughsAdminPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const [roleRates, rentals, softCosts] = await Promise.all([
    prisma.projectPassThroughRoleRate.findMany({ where: { projectId }, orderBy: [{ kind: 'asc' }, { role: 'asc' }] }),
    prisma.projectRentalRate.findMany({ where: { projectId }, orderBy: { key: 'asc' } }),
    prisma.projectSoftCostRate.findMany({ where: { projectId }, orderBy: { key: 'asc' } }),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-navy">Pass Throughs</h1>
      <PassThroughRatesSection projectId={projectId} rows={roleRates} />
      <RentalsSection projectId={projectId} rows={rentals} />
      <SoftCostsSection projectId={projectId} rows={softCosts} />
    </div>
  );
}
