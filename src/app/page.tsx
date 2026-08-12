// src/app/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { createProject } from '@/lib/project/createProject';

export default function LandingPage() {
  const router = useRouter();

  async function handleCreateNewProject() {
    try {
      const { id } = await createProject();
      router.push(`/project/${id}`);
    } catch (error) {
      console.error('Failed to create project:', error);
      alert('Something went wrong creating the project. Please try again.');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-mist">
      <div className="flex flex-col sm:flex-row gap-6">
        <button
          type="button"
          onClick={handleCreateNewProject}
          className="bg-red hover:bg-red-700 text-white font-display font-semibold text-lg px-10 py-6 rounded-lg transition-colors"
        >
          Create New Project
        </button>
        <button
          type="button"
          onClick={() => router.push('/projects')}
          className="bg-navy hover:bg-navy-2 text-white font-display font-semibold text-lg px-10 py-6 rounded-lg transition-colors"
        >
          Explore Current Projects
        </button>
      </div>
    </div>
  );
}
