// src/components/CreateProjectButton.tsx
'use client';

import { useRouter } from 'next/navigation';
import { createProject } from '@/lib/project/createProject';

const DEFAULT_CLASSNAME = 'bg-red hover:bg-red-700 text-white font-display font-semibold text-sm px-4 py-2 rounded transition-colors';

export function CreateProjectButton({
  label = '+ Create New Project',
  className = DEFAULT_CLASSNAME,
}: {
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  async function handleClick() {
    try {
      const { id } = await createProject();
      router.push(`/project/${id}`);
    } catch (error) {
      console.error('Failed to create project:', error);
      alert('Something went wrong creating the project. Please try again.');
    }
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      {label}
    </button>
  );
}
