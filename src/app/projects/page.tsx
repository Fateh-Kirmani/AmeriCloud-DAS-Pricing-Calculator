// src/app/projects/page.tsx
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { ProjectsTable } from '@/components/ProjectsTable';
import { CreateProjectButton } from '@/components/CreateProjectButton';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({ orderBy: { updatedAt: 'desc' } });

  return (
    <div className="min-h-screen bg-mist p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-bold tracking-tight text-navy">All Projects</h1>
          <div className="flex items-center gap-3">
            <CreateProjectButton />
            <Link
              href="/admin"
              className="bg-navy hover:bg-navy-2 text-white font-display font-semibold text-sm px-4 py-2 rounded transition-colors"
            >
              Master Defaults
            </Link>
          </div>
        </div>
        <ProjectsTable
          projects={projects.map((p) => ({ id: p.id, name: p.name, client: p.client }))}
        />
      </div>
    </div>
  );
}
