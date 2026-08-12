import { prisma } from '@/lib/db';
import { LaborRatesSection } from './LaborRatesSection';
import { CrewSizeSection } from './CrewSizeSection';
import { LaborProjectionSettingsForm } from './LaborProjectionSettingsForm';
import { updateLaborProjectionSettings } from './actions';

export default async function RatesAdminPage() {
  const [laborRates, crewSizeRows, settings] = await Promise.all([
    prisma.laborRate.findMany({ orderBy: { role: 'asc' } }),
    prisma.crewSizeRow.findMany({ orderBy: { technicianCount: 'asc' } }),
    prisma.laborProjectionSettings.findUniqueOrThrow({ where: { id: 'singleton' } }),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-navy">Rates</h1>
      <LaborRatesSection rows={laborRates} />
      <CrewSizeSection rows={crewSizeRows} />
      <LaborProjectionSettingsForm settings={settings} onSave={updateLaborProjectionSettings} />
    </div>
  );
}
