// src/app/pass-throughs/page.tsx
'use client';

import { useEstimate } from '@/lib/estimate/EstimateContext';
import { formatCurrency } from '@/lib/utils/formatCurrency';
import { parseNumericInput } from '@/lib/utils/parseNumericInput';
import { MoveToButton } from '@/components/MoveToButton';
import type { LaborRole } from '@/lib/calc';

function updateRoleDaysLine(
  lines: { role: LaborRole; employeeCount: number; days: number }[],
  role: LaborRole,
  patch: Partial<{ employeeCount: number; days: number }>,
) {
  const existing = lines.find((l) => l.role === role);
  const base = existing ?? { role, employeeCount: 0, days: 0 };
  const updated = { ...base, ...patch };
  if (!existing) return [...lines, updated];
  return lines.map((l) => (l.role === role ? updated : l));
}

function updateRoleHoursLine(
  lines: { role: LaborRole; employeeCount: number; hours: number }[],
  role: LaborRole,
  patch: Partial<{ employeeCount: number; hours: number }>,
) {
  const existing = lines.find((l) => l.role === role);
  const base = existing ?? { role, employeeCount: 0, hours: 0 };
  const updated = { ...base, ...patch };
  if (!existing) return [...lines, updated];
  return lines.map((l) => (l.role === role ? updated : l));
}

function updateRoleQtyLine(
  lines: { role: LaborRole; qty: number }[],
  role: LaborRole,
  qty: number,
) {
  const existing = lines.find((l) => l.role === role);
  if (!existing) return [...lines, { role, qty }];
  return lines.map((l) => (l.role === role ? { role, qty } : l));
}

function updateKeyQtyLine(lines: { key: string; qty: number }[], key: string, qty: number) {
  const existing = lines.find((l) => l.key === key);
  if (!existing) return [...lines, { key, qty }];
  return lines.map((l) => (l.key === key ? { key, qty } : l));
}

export default function PassThroughsPage() {
  const { referenceData, input, result, setPassThroughs, projectId } = useEstimate();
  const pt = input.passThroughs;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold tracking-tight text-navy">Pass Throughs</h1>

      <section className="bg-white rounded-lg shadow p-4">
        <h2 className="font-display text-lg font-semibold text-navy mb-2 flex justify-between">
          <span>Per Diem</span>
          <span>{formatCurrency(result.passThroughs.perDiemTotal)}</span>
        </h2>
        {referenceData.passThroughRates.perDiemRateByRole.map(({ role, rate }) => {
          const line = pt.perDiem.find((l) => l.role === role);
          return (
            <div key={role} className="flex items-center gap-4 py-1 text-sm">
              <span className="w-40 text-slate">{role}</span>
              <span className="w-20 text-right">{formatCurrency(rate)}/day</span>
              <label className="flex items-center gap-1">
                Employees
                <input
                  type="number" min={0} className="w-16 border border-line rounded px-2 py-1"
                  value={line?.employeeCount ?? 0}
                  onChange={(e) => setPassThroughs({ perDiem: updateRoleDaysLine(pt.perDiem, role, { employeeCount: parseNumericInput(e.target.value) }) })}
                />
              </label>
              <label className="flex items-center gap-1">
                Days
                <input
                  type="number" min={0} className="w-16 border border-line rounded px-2 py-1"
                  value={line?.days ?? 0}
                  onChange={(e) => setPassThroughs({ perDiem: updateRoleDaysLine(pt.perDiem, role, { days: parseNumericInput(e.target.value) }) })}
                />
              </label>
            </div>
          );
        })}
      </section>

      <section className="bg-white rounded-lg shadow p-4">
        <h2 className="font-display text-lg font-semibold text-navy mb-2 flex justify-between">
          <span>Lodging</span>
          <span>{formatCurrency(result.passThroughs.lodgingTotal)}</span>
        </h2>
        {referenceData.passThroughRates.lodgingRateByRole.map(({ role, rate }) => {
          const line = pt.lodging.find((l) => l.role === role);
          return (
            <div key={role} className="flex items-center gap-4 py-1 text-sm">
              <span className="w-40 text-slate">{role}</span>
              <span className="w-20 text-right">{formatCurrency(rate)}/night</span>
              <label className="flex items-center gap-1">
                Employees
                <input
                  type="number" min={0} className="w-16 border border-line rounded px-2 py-1"
                  value={line?.employeeCount ?? 0}
                  onChange={(e) => setPassThroughs({ lodging: updateRoleDaysLine(pt.lodging, role, { employeeCount: parseNumericInput(e.target.value) }) })}
                />
              </label>
              <label className="flex items-center gap-1">
                Nights
                <input
                  type="number" min={0} className="w-16 border border-line rounded px-2 py-1"
                  value={line?.days ?? 0}
                  onChange={(e) => setPassThroughs({ lodging: updateRoleDaysLine(pt.lodging, role, { days: parseNumericInput(e.target.value) }) })}
                />
              </label>
            </div>
          );
        })}
      </section>

      <section className="bg-white rounded-lg shadow p-4">
        <h2 className="font-display text-lg font-semibold text-navy mb-2 flex justify-between">
          <span>Travel</span>
          <span>{formatCurrency(result.passThroughs.travelTotal)}</span>
        </h2>
        {referenceData.laborRates.map(({ role }) => {
          const line = pt.travel.find((l) => l.role === role);
          return (
            <div key={role} className="flex items-center gap-4 py-1 text-sm">
              <span className="w-40 text-slate">{role}</span>
              <label className="flex items-center gap-1">
                Employees
                <input
                  type="number" min={0} className="w-16 border border-line rounded px-2 py-1"
                  value={line?.employeeCount ?? 0}
                  onChange={(e) => setPassThroughs({ travel: updateRoleHoursLine(pt.travel, role, { employeeCount: parseNumericInput(e.target.value) }) })}
                />
              </label>
              <label className="flex items-center gap-1">
                Hours
                <input
                  type="number" min={0} className="w-16 border border-line rounded px-2 py-1"
                  value={line?.hours ?? 0}
                  onChange={(e) => setPassThroughs({ travel: updateRoleHoursLine(pt.travel, role, { hours: parseNumericInput(e.target.value) }) })}
                />
              </label>
            </div>
          );
        })}
      </section>

      <section className="bg-white rounded-lg shadow p-4">
        <h2 className="font-display text-lg font-semibold text-navy mb-2 flex justify-between">
          <span>Airfare</span>
          <span>{formatCurrency(result.passThroughs.airfareTotal)}</span>
        </h2>
        {referenceData.passThroughRates.airfareCostByRole.map(({ role, cost }) => {
          const line = pt.airfare.find((l) => l.role === role);
          return (
            <div key={role} className="flex items-center gap-4 py-1 text-sm">
              <span className="w-40 text-slate">{role}</span>
              <span className="w-20 text-right">{formatCurrency(cost)}/ticket</span>
              <label className="flex items-center gap-1">
                Qty
                <input
                  type="number" min={0} className="w-16 border border-line rounded px-2 py-1"
                  value={line?.qty ?? 0}
                  onChange={(e) => setPassThroughs({ airfare: updateRoleQtyLine(pt.airfare, role, parseNumericInput(e.target.value)) })}
                />
              </label>
            </div>
          );
        })}
      </section>

      <section className="bg-white rounded-lg shadow p-4">
        <h2 className="font-display text-lg font-semibold text-navy mb-2 flex justify-between">
          <span>Rentals</span>
          <span>{formatCurrency(result.passThroughs.rentalsTotal)}</span>
        </h2>
        {referenceData.passThroughRates.rentals.map(({ key, name, rate, unit }) => {
          const line = pt.rentals.find((l) => l.key === key);
          return (
            <div key={key} className="flex items-center gap-4 py-1 text-sm">
              <span className="w-56 text-slate">{name}</span>
              <span className="w-28 text-right">{formatCurrency(rate)}/{unit}</span>
              <label className="flex items-center gap-1">
                Qty
                <input
                  type="number" min={0} className="w-16 border border-line rounded px-2 py-1"
                  value={line?.qty ?? 0}
                  onChange={(e) => setPassThroughs({ rentals: updateKeyQtyLine(pt.rentals, key, parseNumericInput(e.target.value)) })}
                />
              </label>
            </div>
          );
        })}
      </section>

      <section className="bg-white rounded-lg shadow p-4">
        <h2 className="font-display text-lg font-semibold text-navy mb-2 flex justify-between">
          <span>Soft Costs</span>
          <span>{formatCurrency(result.passThroughs.softCostsTotal)}</span>
        </h2>
        {referenceData.passThroughRates.softCosts.map(({ key, name, fee }) => {
          const line = pt.softCosts.find((l) => l.key === key);
          return (
            <div key={key} className="flex items-center gap-4 py-1 text-sm">
              <span className="w-56 text-slate">{name}</span>
              <span className="w-28 text-right">{formatCurrency(fee)}/each</span>
              <label className="flex items-center gap-1">
                Qty
                <input
                  type="number" min={0} className="w-16 border border-line rounded px-2 py-1"
                  value={line?.qty ?? 0}
                  onChange={(e) => setPassThroughs({ softCosts: updateKeyQtyLine(pt.softCosts, key, parseNumericInput(e.target.value)) })}
                />
              </label>
            </div>
          );
        })}
      </section>

      <div className="bg-white rounded-lg shadow p-4 flex justify-between font-display text-lg text-navy">
        <span>Pass Through Total</span>
        <span>{formatCurrency(result.passThroughs.grandTotal)}</span>
      </div>

      <MoveToButton href={`/project/${projectId}/summary`} label="→ Executive Summary" />
    </div>
  );
}
