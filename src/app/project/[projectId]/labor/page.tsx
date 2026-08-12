// src/app/labor/page.tsx
'use client';

import { useState } from 'react';
import { useEstimate } from '@/lib/estimate/EstimateContext';
import { formatCurrency } from '@/lib/utils/formatCurrency';
import { parseNumericInput } from '@/lib/utils/parseNumericInput';
import { MoveToButton } from '@/components/MoveToButton';
import type { LaborTask } from '@/lib/calc';

function groupByCategory(tasks: LaborTask[]): Map<string, LaborTask[]> {
  const groups = new Map<string, LaborTask[]>();
  for (const task of tasks) {
    const list = groups.get(task.category) ?? [];
    list.push(task);
    groups.set(task.category, list);
  }
  return groups;
}

function categoryDomId(sheet: 'LOE' | 'SOW', category: string): string {
  return `labor-category-${sheet}-${category}`;
}

function scrollToLaborCategory(sheet: 'LOE' | 'SOW', category: string) {
  document.getElementById(categoryDomId(sheet, category))?.scrollIntoView({ behavior: 'instant', block: 'start' });
}

export default function LaborPage() {
  const {
    referenceData, input, result, setLoeTaskQuantity, setSowTaskQuantity, setTechnicianCount, projectId,
  } = useEstimate();
  const [activeSheet, setActiveSheet] = useState<'LOE' | 'SOW'>('LOE');
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();

  const loeTasks = referenceData.laborTasks.filter((t) => t.sheet === 'LOE');
  const sowTasks = referenceData.laborTasks.filter((t) => t.sheet === 'SOW');
  const tasksForSheet = activeSheet === 'LOE' ? loeTasks : sowTasks;
  const allGroups = groupByCategory(tasksForSheet);

  const loeQtyByKey = new Map(input.loeTasks.map((t) => [t.key, t.quantity]));
  const sowQtyByKey = new Map(input.sowTasks.map((t) => [t.key, t.quantity]));
  const taskResultByKey = new Map(result.labor.taskResults.map((t) => [t.key, t]));
  const setQuantity = activeSheet === 'LOE' ? setLoeTaskQuantity : setSowTaskQuantity;
  const qtyByKey = activeSheet === 'LOE' ? loeQtyByKey : sowQtyByKey;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold tracking-tight text-navy">Labor</h1>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            className={`px-4 py-2 rounded font-display ${activeSheet === 'LOE' ? 'bg-navy text-white' : 'bg-white text-navy border border-line'}`}
            onClick={() => setActiveSheet('LOE')}
            title="Level of Effort — the baseline labor tasks required for this job"
          >
            LOE
          </button>
          <button
            className={`px-4 py-2 rounded font-display ${activeSheet === 'SOW' ? 'bg-navy text-white' : 'bg-white text-navy border border-line'}`}
            onClick={() => setActiveSheet('SOW')}
            title="Statement of Work — additional labor tasks beyond the baseline LOE"
          >
            Additional SOW's
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {Array.from(allGroups.keys()).map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => scrollToLaborCategory(activeSheet, category)}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-slate hover:border-navy hover:text-navy transition-colors"
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <input
        type="search"
        placeholder="Search task, unit, labor role…"
        className="w-full sm:w-80 border border-line rounded px-3 py-1.5 text-sm"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {Array.from(allGroups.entries()).map(([category, allTasks]) => {
        const tasks = needle
          ? allTasks.filter((task) => {
              const haystack = [task.name, task.unit, task.laborRole, category].join(' ').toLowerCase();
              return haystack.includes(needle);
            })
          : allTasks;
        const subtotal = result.labor.categorySubtotals.find(
          (c) => c.sheet === activeSheet && c.category === category,
        );
        return (
          <div
            key={category}
            id={categoryDomId(activeSheet, category)}
            className="bg-white rounded-lg shadow overflow-hidden scroll-mt-4"
          >
            <div className="bg-navy-2 text-white px-4 py-3 font-display flex justify-between">
              <span>{category}</span>
              <span>{formatCurrency(subtotal?.cost ?? 0)}</span>
            </div>
            {tasks.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate text-center">No tasks match your filter.</p>
            ) : (
              <div className="max-h-[28rem] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-slate">
                      <th className="px-4 py-2">Task</th>
                      <th className="px-4 py-2">Unit</th>
                      <th className="px-4 py-2 hidden md:table-cell">Labor Role</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">Hours</th>
                      <th className="px-4 py-2 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task, i) => {
                      const taskResult = taskResultByKey.get(task.key);
                      const isDerived = task.derivedFrom !== null;
                      return (
                        <tr key={task.key} className={i % 2 === 0 ? 'bg-white' : 'bg-mist'}>
                          <td className="px-4 py-2">{task.name}</td>
                          <td className="px-4 py-2">{task.unit}</td>
                          <td className="px-4 py-2 hidden md:table-cell">{task.laborRole}</td>
                          <td className="px-4 py-2 text-right">
                            {isDerived ? (
                              <span
                                className="inline-block w-20 text-slate-2 italic"
                                title="Computed automatically from other task quantities"
                              >
                                {taskResult?.quantity.toFixed(2) ?? 0}
                              </span>
                            ) : (
                              <input
                                type="number"
                                min={0}
                                className="w-20 border border-line rounded px-2 py-1 text-right"
                                value={qtyByKey.get(task.key) ?? 0}
                                onChange={(e) => setQuantity(task.key, parseNumericInput(e.target.value))}
                              />
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">{(taskResult?.hours ?? 0).toFixed(2)}</td>
                          <td className="px-4 py-2 text-right">{formatCurrency(taskResult?.cost ?? 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      <div className="bg-white rounded-lg shadow p-4 space-y-3">
        <h2 className="font-display text-lg font-semibold text-navy">Crew Planner</h2>
        <label className="flex items-center gap-3">
          <span className="text-slate">Technicians Needed</span>
          <select
            className="border border-line rounded px-3 py-2"
            value={input.technicianCount}
            onChange={(e) => setTechnicianCount(parseNumericInput(e.target.value))}
          >
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <div className="flex justify-between"><span className="text-slate">Calendar Days</span><span>{result.crewPlan.calendarDays.toFixed(1)}</span></div>
          <div className="flex justify-between"><span className="text-slate">Calendar Weeks</span><span>{result.crewPlan.calendarWeeks.toFixed(1)}</span></div>
          <div className="flex justify-between"><span className="text-slate">Construction Managers Needed</span><span>{result.crewPlan.cmsNeeded}</span></div>
          <div className="flex justify-between"><span className="text-slate">Admin Labor Cost</span><span>{formatCurrency(result.crewPlan.opsAdminLaborTotal.cost)}</span></div>
        </div>
      </div>

      <MoveToButton href={`/project/${projectId}/pass-throughs`} label="→ Pass Throughs" />
    </div>
  );
}
