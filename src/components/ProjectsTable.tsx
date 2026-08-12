// src/components/ProjectsTable.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { deleteProject } from '@/lib/project/deleteProject';

interface ProjectRow {
  id: string;
  name: string;
  client: string;
}

export function ProjectsTable({ projects }: { projects: ProjectRow[] }) {
  const router = useRouter();
  const [nameFilter, setNameFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');

  const nameNeedle = nameFilter.trim().toLowerCase();
  const clientNeedle = clientFilter.trim().toLowerCase();

  const filtered = projects.filter((p) => {
    if (nameNeedle && !p.name.toLowerCase().includes(nameNeedle)) return false;
    if (clientNeedle && !p.client.toLowerCase().includes(clientNeedle)) return false;
    return true;
  });

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this project? This cannot be undone.')) return;
    try {
      await deleteProject(id);
      router.refresh();
    } catch (error) {
      console.error('Failed to delete project:', error);
      alert('Something went wrong deleting the project. Please try again.');
    }
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line">
        <input
          type="search"
          placeholder="Search name…"
          className="border border-line rounded px-3 py-1.5 text-sm"
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
        />
        <input
          type="search"
          placeholder="Search client…"
          className="border border-line rounded px-3 py-1.5 text-sm"
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
        />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-slate">
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Client</th>
            <th className="px-4 py-2 text-right">Edit</th>
            <th className="px-4 py-2 text-right">Delete</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-slate">No projects match your filter.</td>
            </tr>
          ) : (
            filtered.map((p, i) => (
              <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-mist'}>
                <td className="px-4 py-2">{p.name || 'Untitled Project'}</td>
                <td className="px-4 py-2">{p.client || '—'}</td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/project/${p.id}`} className="text-navy underline">Edit</Link>
                </td>
                <td className="px-4 py-2 text-right">
                  <button type="button" onClick={() => handleDelete(p.id)} className="text-red hover:text-red-700 underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
