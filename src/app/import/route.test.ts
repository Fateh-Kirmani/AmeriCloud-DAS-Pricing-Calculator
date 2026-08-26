import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { GET } from './route';

describe('GET /import (integration — requires a live, seeded local Postgres)', () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    for (const id of createdIds.splice(0)) {
      await prisma.project.deleteMany({ where: { id } });
    }
  });

  it('creates a project, pre-fills Cover Info from query params, and redirects to it', async () => {
    const url = 'http://localhost/import?' + new URLSearchParams({
      client: 'Beacon Corp',
      project: 'Beacon Test Site',
      jobSiteAddress: '123 Main St, New York, NY 10001',
      projectOverview: 'Install new DAS equipment.',
    }).toString();
    const request = new NextRequest(url);

    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const projectId = new URL(location!).pathname.split('/').pop()!;
    createdIds.push(projectId);

    expect(new URL(location!).pathname).toBe(`/project/${projectId}`);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    expect(project?.name).toBe('Beacon Test Site');
    expect(project?.client).toBe('Beacon Corp');

    const draft = project?.draftJson as { coverInfo: Record<string, string> };
    expect(draft.coverInfo).toEqual({
      client: 'Beacon Corp',
      project: 'Beacon Test Site',
      rfpDate: '',
      bidDueDate: '',
      estimator: '',
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      customerType: '',
      jobSiteAddress: '123 Main St, New York, NY 10001',
      projectOverview: 'Install new DAS equipment.',
    });
  });

  it('defaults missing query params to empty strings instead of crashing', async () => {
    const request = new NextRequest('http://localhost/import');

    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    const projectId = new URL(location).pathname.split('/').pop()!;
    createdIds.push(projectId);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    const draft = project?.draftJson as { coverInfo: Record<string, string> };
    expect(draft.coverInfo.client).toBe('');
    expect(draft.coverInfo.project).toBe('');
    expect(draft.coverInfo.jobSiteAddress).toBe('');
    expect(draft.coverInfo.projectOverview).toBe('');
  });
});
