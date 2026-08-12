'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface SettingsShape {
  hoursPerManDay: number;
  hoursPerManWeek: number;
  stagingMaterialMultiplier: number;
  cmPercentOfTechHours: number;
  pmPercentOfTechHours: number;
  coordinatorPercentOfTechHours: number;
}

function toDisplayValues(settings: SettingsShape): Record<string, string> {
  return {
    hoursPerManDay: String(settings.hoursPerManDay),
    hoursPerManWeek: String(settings.hoursPerManWeek),
    stagingMaterialMultiplier: String(settings.stagingMaterialMultiplier * 100),
    cmPercentOfTechHours: String(settings.cmPercentOfTechHours * 100),
    pmPercentOfTechHours: String(settings.pmPercentOfTechHours * 100),
    coordinatorPercentOfTechHours: String(settings.coordinatorPercentOfTechHours * 100),
  };
}

const FIELDS: { key: string; label: string; suffix: string }[] = [
  { key: 'hoursPerManDay', label: 'Hours per Man-Day', suffix: 'hrs' },
  { key: 'hoursPerManWeek', label: 'Hours per Man-Week', suffix: 'hrs' },
  { key: 'stagingMaterialMultiplier', label: 'Staging/Material Time Multiplier', suffix: '%' },
  { key: 'cmPercentOfTechHours', label: 'Construction Manager % of Tech Hours', suffix: '%' },
  { key: 'pmPercentOfTechHours', label: 'Project Manager % of Tech Hours', suffix: '%' },
  { key: 'coordinatorPercentOfTechHours', label: 'Project Coordinator % of Tech Hours', suffix: '%' },
];

export function LaborProjectionSettingsForm({
  settings,
  onSave,
}: {
  settings: SettingsShape;
  onSave: (values: Record<string, string>) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(toDisplayValues(settings));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSave() {
    setPending(true);
    setError(null);
    const result = await onSave(values);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-semibold text-navy">Labor Projection Settings</h2>
      <div className="bg-white rounded-lg shadow p-4 space-y-3 max-w-md">
        {error && <p className="text-red-700 text-sm">{error}</p>}
        {FIELDS.map((field) => (
          <label key={field.key} className="flex items-center justify-between gap-4">
            <span className="text-slate">{field.label}</span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                className="w-24 border border-line rounded px-2 py-1 text-right"
                value={values[field.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              />
              <span className="text-slate text-sm">{field.suffix}</span>
            </span>
          </label>
        ))}
        <button
          disabled={pending}
          onClick={handleSave}
          className="bg-red hover:bg-red-700 text-white font-display font-semibold px-4 py-2 rounded transition-colors"
        >
          Save
        </button>
      </div>
    </section>
  );
}
