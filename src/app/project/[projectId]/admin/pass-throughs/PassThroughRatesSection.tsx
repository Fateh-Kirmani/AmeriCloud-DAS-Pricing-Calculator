'use client';

import type { LaborRoleName, PassThroughRateKind } from '@prisma/client';
import { AdminTable, type AdminColumn } from '@/components/admin/AdminTable';
import { formatCurrency } from '@/lib/utils/formatCurrency';
import { updateProjectPassThroughRoleRate } from './actions';

interface ProjectPassThroughRoleRateRow {
  id: string;
  kind: PassThroughRateKind;
  role: LaborRoleName;
  amount: number;
}

const ROLE_LABELS: Record<string, string> = {
  Technician: 'Technician',
  Construction_Manager: 'Construction Manager',
  RF_Engineer: 'RF-Engineer',
  RF_Technician: 'RF-Technician',
  Project_Coordinator: 'Project Coordinator',
  Project_Manager: 'Project Manager',
};

const columns: AdminColumn<ProjectPassThroughRoleRateRow>[] = [
  { key: 'kind', label: 'Kind', type: 'readonly' },
  { key: 'role', label: 'Role', type: 'readonly', format: (row) => ROLE_LABELS[row.role] ?? row.role },
  { key: 'amount', label: 'Amount', type: 'number', align: 'right', required: true, format: (row) => formatCurrency(row.amount) },
];

export function PassThroughRatesSection({ projectId, rows }: { projectId: string; rows: ProjectPassThroughRoleRateRow[] }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-semibold text-navy">Per Diem / Lodging / Airfare Rates</h2>
      <AdminTable<ProjectPassThroughRoleRateRow>
        columns={columns}
        rows={rows}
        onUpdate={(id, values) => updateProjectPassThroughRoleRate(projectId, id, values)}
      />
    </section>
  );
}
