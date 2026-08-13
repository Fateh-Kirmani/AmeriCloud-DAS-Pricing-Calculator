'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface DefaultsShape {
  laborMarkupPct: number;
  passThroughMarkupPct: number;
  materialMarkupPct: number;
  corporateMarkupPct: number;
  taxRate: number;
  contingencyPct: number;
}

function toDisplayValues(defaults: DefaultsShape): Record<string, string> {
  return {
    laborMarkupPct: String(defaults.laborMarkupPct * 100),
    passThroughMarkupPct: String(defaults.passThroughMarkupPct * 100),
    materialMarkupPct: String(defaults.materialMarkupPct * 100),
    corporateMarkupPct: String(defaults.corporateMarkupPct * 100),
    taxRate: String(defaults.taxRate * 100),
    contingencyPct: String(defaults.contingencyPct * 100),
  };
}

const FIELDS: { key: string; label: string }[] = [
  { key: 'laborMarkupPct', label: 'Labor Markup %' },
  { key: 'passThroughMarkupPct', label: 'Pass-Through Markup %' },
  { key: 'materialMarkupPct', label: 'Material Markup %' },
  { key: 'corporateMarkupPct', label: 'Corporate Markup %' },
  { key: 'taxRate', label: 'Tax Rate %' },
  { key: 'contingencyPct', label: 'Contingency %' },
];

export function EstimateDefaultsForm({
  defaults,
  onSave,
}: {
  defaults: DefaultsShape;
  onSave: (values: Record<string, string>) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(toDisplayValues(defaults));
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
            <span className="text-slate text-sm">%</span>
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
  );
}
