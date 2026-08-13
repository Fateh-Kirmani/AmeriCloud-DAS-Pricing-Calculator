'use client';

import { AdminTable, type AdminColumn } from '@/components/admin/AdminTable';
import { formatCurrency } from '@/lib/utils/formatCurrency';
import { createProjectSoftCost, updateProjectSoftCost, deleteProjectSoftCost } from './actions';

interface ProjectSoftCostRateRow {
  id: string;
  key: string;
  name: string;
  fee: number;
}

const columns: AdminColumn<ProjectSoftCostRateRow>[] = [
  { key: 'key', label: 'Key', type: 'text', required: true },
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'fee', label: 'Fee', type: 'number', align: 'right', required: true, format: (row) => formatCurrency(row.fee) },
];

const emptyValues = { key: '', name: '', fee: '0' };

export function SoftCostsSection({ projectId, rows }: { projectId: string; rows: ProjectSoftCostRateRow[] }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-semibold text-navy">Soft Costs</h2>
      <AdminTable<ProjectSoftCostRateRow>
        columns={columns}
        rows={rows}
        onCreate={(values) => createProjectSoftCost(projectId, values)}
        onUpdate={(id, values) => updateProjectSoftCost(projectId, id, values)}
        onDelete={(id) => deleteProjectSoftCost(projectId, id)}
        emptyValues={emptyValues}
      />
    </section>
  );
}
