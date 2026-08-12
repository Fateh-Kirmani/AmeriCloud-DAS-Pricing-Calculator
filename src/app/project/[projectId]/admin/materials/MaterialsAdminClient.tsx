'use client';

import { useState } from 'react';
import type { MaterialCategory } from '@prisma/client';
import { AdminTable, type AdminColumn } from '@/components/admin/AdminTable';
import { formatCurrency } from '@/lib/utils/formatCurrency';
import { createProjectMaterial, updateProjectMaterial, deleteProjectMaterial } from './actions';

interface ProjectMaterialRow {
  id: string;
  key: string;
  type: string;
  manufacturer: string | null;
  model: string | null;
  description: string;
  vendor: string | null;
  category: MaterialCategory;
  unitCost: number;
}

const CATEGORY_OPTIONS: { value: MaterialCategory; label: string }[] = [
  { value: 'Consumable', label: 'Consumable' },
  { value: 'DAS_Materials', label: 'DAS Materials' },
  { value: 'BAT_Materials', label: 'BAT Materials' },
];

const columns: AdminColumn<ProjectMaterialRow>[] = [
  { key: 'key', label: 'Key', type: 'text', required: true },
  { key: 'type', label: 'Type', type: 'text', required: true },
  { key: 'manufacturer', label: 'Manufacturer', type: 'text' },
  { key: 'model', label: 'Model', type: 'text' },
  { key: 'description', label: 'Description', type: 'text', required: true },
  { key: 'vendor', label: 'Vendor', type: 'text' },
  { key: 'category', label: 'Category', type: 'select', options: CATEGORY_OPTIONS, required: true },
  { key: 'unitCost', label: 'Unit Cost', type: 'number', align: 'right', required: true, format: (row) => formatCurrency(row.unitCost) },
];

const emptyValues = {
  key: '', type: '', manufacturer: '', model: '', description: '', vendor: '',
  category: 'Consumable', unitCost: '0',
};

export function MaterialsAdminClient({ projectId, rows }: { projectId: string; rows: ProjectMaterialRow[] }) {
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();

  const groups = CATEGORY_OPTIONS.map(({ value, label }) => {
    const categoryRows = rows.filter((r) => r.category === value);
    const filtered = needle
      ? categoryRows.filter((r) =>
          [r.key, r.type, r.manufacturer, r.model, r.description, r.vendor]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(needle),
        )
      : categoryRows;
    return { value, label, categoryRows, filtered };
  }).filter((g) => g.categoryRows.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight text-navy">Material Catalog</h1>
        <input
          type="search"
          placeholder="Search key, type, manufacturer, model, description…"
          className="w-80 max-w-full border border-line rounded px-3 py-1.5 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {groups.map(({ value, label, categoryRows, filtered }) => (
        <AdminTable<ProjectMaterialRow>
          key={value}
          columns={columns}
          rows={filtered}
          onCreate={(values) => createProjectMaterial(projectId, values)}
          onUpdate={(id, values) => updateProjectMaterial(projectId, id, values)}
          onDelete={(id) => deleteProjectMaterial(projectId, id)}
          emptyValues={{ ...emptyValues, category: value }}
          maxBodyHeightClassName="max-h-[28rem]"
          header={
            <div className="bg-navy-2 text-white px-4 py-3 font-display flex justify-between items-center">
              <span>{label}</span>
              <span className="text-white/70 text-sm font-body">
                {filtered.length} of {categoryRows.length}
              </span>
            </div>
          }
        />
      ))}
    </div>
  );
}
