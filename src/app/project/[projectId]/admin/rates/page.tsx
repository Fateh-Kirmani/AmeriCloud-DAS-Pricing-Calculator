import { prisma } from '@/lib/db';
import { LaborRatesSection } from './LaborRatesSection';
import { CrewSizeSection } from './CrewSizeSection';
import { LaborProjectionSettingsForm } from '@/app/admin/(sections)/rates/LaborProjectionSettingsForm';
import { updateProjectLaborProjectionSettings } from './actions';

export default async function ProjectRatesAdminPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const [laborRates, crewSizeRows, settings] = await Promise.all([
    prisma.projectLaborRate.findMany({ where: { projectId }, orderBy: { role: 'asc' } }),
    prisma.projectCrewSizeRow.findMany({ where: { projectId }, orderBy: { technicianCount: 'asc' } }),
    prisma.projectLaborProjectionSettings.findUniqueOrThrow({ where: { projectId } }),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-navy">Rates</h1>
      <LaborRatesSection projectId={projectId} rows={laborRates} />
      <CrewSizeSection projectId={projectId} rows={crewSizeRows} />
      <LaborProjectionSettingsForm
        settings={settings}
        onSave={(values) => updateProjectLaborProjectionSettings(projectId, values)}
      />
    </div>
  );
}
