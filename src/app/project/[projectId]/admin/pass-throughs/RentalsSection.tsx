'use client';

import { AdminTable, type AdminColumn } from '@/components/admin/AdminTable';
import { formatCurrency } from '@/lib/utils/formatCurrency';
import { createProjectRental, updateProjectRental, deleteProjectRental } from './actions';

interface ProjectRentalRateRow {
  id: string;
  key: string;
  name: string;
  rate: number;
  unit: string;
}

const columns: AdminColumn<ProjectRentalRateRow>[] = [
  { key: 'key', label: 'Key', type: 'text', required: true },
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'rate', label: 'Rate', type: 'number', align: 'right', required: true, format: (row) => formatCurrency(row.rate) },
  { key: 'unit', label: 'Billing Unit', type: 'text', required: true },
];

const emptyValues = { key: '', name: '', rate: '0', unit: '' };

export function RentalsSection({ projectId, rows }: { projectId: string; rows: ProjectRentalRateRow[] }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-semibold text-navy">Rentals</h2>
      <AdminTable<ProjectRentalRateRow>
        columns={columns}
        rows={rows}
        onCreate={(values) => createProjectRental(projectId, values)}
        onUpdate={(id, values) => updateProjectRental(projectId, id, values)}
        onDelete={(id) => deleteProjectRental(projectId, id)}
        emptyValues={emptyValues}
      />
    </section>
  );
}
