// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectsTable } from './ProjectsTable';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const PROJECTS = [
  { id: 'p1', name: 'Downtown Stadium DAS', client: 'Acme Corp' },
  { id: 'p2', name: 'Airport Terminal B', client: 'Globex Inc' },
  { id: 'p3', name: '', client: '' },
];

describe('ProjectsTable', () => {
  it('renders every project by default', () => {
    render(<ProjectsTable projects={PROJECTS} />);
    expect(screen.getByText('Downtown Stadium DAS')).toBeInTheDocument();
    expect(screen.getByText('Airport Terminal B')).toBeInTheDocument();
    expect(screen.getByText('Untitled Project')).toBeInTheDocument();
  });

  it('filters by name, case-insensitively', () => {
    render(<ProjectsTable projects={PROJECTS} />);
    fireEvent.change(screen.getByPlaceholderText('Search name…'), { target: { value: 'stadium' } });
    expect(screen.getByText('Downtown Stadium DAS')).toBeInTheDocument();
    expect(screen.queryByText('Airport Terminal B')).not.toBeInTheDocument();
  });

  it('filters by client, case-insensitively', () => {
    render(<ProjectsTable projects={PROJECTS} />);
    fireEvent.change(screen.getByPlaceholderText('Search client…'), { target: { value: 'globex' } });
    expect(screen.getByText('Airport Terminal B')).toBeInTheDocument();
    expect(screen.queryByText('Downtown Stadium DAS')).not.toBeInTheDocument();
  });

  it('shows a message when no project matches the filter', () => {
    render(<ProjectsTable projects={PROJECTS} />);
    fireEvent.change(screen.getByPlaceholderText('Search name…'), { target: { value: 'nonexistent' } });
    expect(screen.getByText('No projects match your filter.')).toBeInTheDocument();
  });
});
