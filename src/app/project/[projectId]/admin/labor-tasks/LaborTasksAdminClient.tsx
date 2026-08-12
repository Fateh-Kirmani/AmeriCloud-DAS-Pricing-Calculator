'use client';

import type { LaborRoleName, LaborSheet } from '@prisma/client';
import { AdminTable, type AdminColumn } from '@/components/admin/AdminTable';
import { parseDerivedFrom } from '@/lib/data/loadReferenceData';
import { createProjectLaborTask, updateProjectLaborTask, deleteProjectLaborTask } from './actions';

interface ProjectLaborTaskRow {
  id: string;
  key: string;
  sheet: LaborSheet;
  category: string;
  name: string;
  minutesPerUnit: number;
  unit: string;
  laborRole: LaborRoleName;
  includedInSubtotal: boolean;
  derivedFromJson: unknown;
}

const SHEET_OPTIONS = [
  { value: 'LOE', label: 'LOE' },
  { value: 'SOW', label: 'SOW' },
];

const ROLE_OPTIONS: { value: LaborRoleName; label: string }[] = [
  { value: 'Technician', label: 'Technician' },
  { value: 'Construction_Manager', label: 'Construction Manager' },
  { value: 'RF_Engineer', label: 'RF-Engineer' },
  { value: 'RF_Technician', label: 'RF-Technician' },
  { value: 'Project_Coordinator', label: 'Project Coordinator' },
  { value: 'Project_Manager', label: 'Project Manager' },
];

function formatDerivation(row: ProjectLaborTaskRow): string {
  try {
    const derived = parseDerivedFrom(row.derivedFromJson, row.key);
    if (!derived) return '—';
    const termsText = derived.terms.map((t) => (t.coeff === 1 ? t.key : `${t.coeff}×${t.key}`)).join(' + ');
    return derived.divisor === 1 ? `= ${termsText}` : `= (${termsText}) ÷ ${derived.divisor}`;
  } catch {
    return '⚠ malformed';
  }
}

const columns: AdminColumn<ProjectLaborTaskRow>[] = [
  { key: 'key', label: 'Key', type: 'text', required: true },
  { key: 'sheet', label: 'Sheet', type: 'select', options: SHEET_OPTIONS, required: true },
  { key: 'category', label: 'Category', type: 'text', required: true },
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'minutesPerUnit', label: 'Minutes/Unit', type: 'number', align: 'right', required: true },
  { key: 'unit', label: 'Unit', type: 'text', required: true },
  { key: 'laborRole', label: 'Labor Role', type: 'select', options: ROLE_OPTIONS, required: true },
  { key: 'includedInSubtotal', label: 'In Subtotal', type: 'checkbox' },
  { key: 'derivedFromJson', label: 'Derived Quantity', type: 'readonly', format: formatDerivation },
];

const emptyValues = {
  key: '', sheet: 'LOE', category: '', name: '', minutesPerUnit: '0', unit: '',
  laborRole: 'Technician', includedInSubtotal: 'false',
};

export function LaborTasksAdminClient({ projectId, rows }: { projectId: string; rows: ProjectLaborTaskRow[] }) {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold tracking-tight text-navy">Labor Task Library</h1>
      <AdminTable<ProjectLaborTaskRow>
        columns={columns}
        rows={rows}
        onCreate={(values) => createProjectLaborTask(projectId, values)}
        onUpdate={(id, values) => updateProjectLaborTask(projectId, id, values)}
        onDelete={(id) => deleteProjectLaborTask(projectId, id)}
        emptyValues={emptyValues}
        searchable
        searchPlaceholder="Search key, category, name…"
        maxBodyHeightClassName="max-h-[32rem]"
      />
    </div>
  );
}
