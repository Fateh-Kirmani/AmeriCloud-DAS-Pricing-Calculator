'use client';

import { AdminTable, type AdminColumn } from '@/components/admin/AdminTable';
import { updateProjectCrewSizeRow } from './actions';

interface ProjectCrewSizeRow {
  id: string;
  technicianCount: number;
  cmsNeeded: number;
}

const columns: AdminColumn<ProjectCrewSizeRow>[] = [
  { key: 'technicianCount', label: 'Technicians', type: 'readonly' },
  { key: 'cmsNeeded', label: 'CMs Needed', type: 'number', align: 'right', required: true },
];

export function CrewSizeSection({ projectId, rows }: { projectId: string; rows: ProjectCrewSizeRow[] }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-semibold text-navy">Crew-Size Table</h2>
      <AdminTable<ProjectCrewSizeRow>
        columns={columns}
        rows={rows}
        onUpdate={(id, values) => updateProjectCrewSizeRow(projectId, id, values)}
      />
    </section>
  );
}
