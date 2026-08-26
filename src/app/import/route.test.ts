import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { createProject } from '@/lib/project/createProject';
import { loadProjectEstimateDefaults } from '@/lib/data/loadProjectReferenceData';
import type { PersistedDraft } from '@/lib/estimate/draft';
import { GET } from './route';

// Wrapped (not replaced) so every test but the error-path one below runs the real implementation
// against the live DB, same as this file's established integration style — this only lets the
// error-path test force a single call to reject via mockRejectedValueOnce, and lets it recover
// the id createProject() actually created (needed since GET's own success path never returns it
// on the failure branch — the redirect goes to '/', not `/project/:id`).
vi.mock('@/lib/project/createProject', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/project/createProject')>();
  return { ...actual, createProject: vi.fn(actual.createProject) };
});
vi.mock('@/lib/data/loadProjectReferenceData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data/loadProjectReferenceData')>();
  return { ...actual, loadProjectEstimateDefaults: vi.fn(actual.loadProjectEstimateDefaults) };
});

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

    // Capture the id (for afterEach cleanup) as early as possible — before any assertion below
    // can fail and skip the push, which would otherwise leak the row in the shared dev database.
    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const projectId = new URL(location!).pathname.split('/').pop()!;
    createdIds.push(projectId);

    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    expect(new URL(location!).pathname).toBe(`/project/${projectId}`);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    expect(project?.name).toBe('Beacon Test Site');
    expect(project?.client).toBe('Beacon Corp');

    const draft = project?.draftJson as unknown as PersistedDraft;
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

    // Prove the draft's markup/tax/contingency fields actually came from this project's own
    // scoped loadProjectEstimateDefaults(id) — not just some other default source — by comparing
    // against a direct call for the same freshly-created project.
    const expectedDefaults = await loadProjectEstimateDefaults(projectId);
    expect(draft.contingencyPct).toBe(expectedDefaults.contingencyPct);
    expect(draft.markups).toEqual({
      laborMarkupPct: expectedDefaults.laborMarkupPct,
      passThroughMarkupPct: expectedDefaults.passThroughMarkupPct,
      materialMarkupPct: expectedDefaults.materialMarkupPct,
      corporateMarkupPct: expectedDefaults.corporateMarkupPct,
      marginTweak: 0,
      taxRate: expectedDefaults.taxRate,
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
    const draft = project?.draftJson as unknown as PersistedDraft;
    expect(draft.coverInfo.client).toBe('');
    expect(draft.coverInfo.project).toBe('');
    expect(draft.coverInfo.jobSiteAddress).toBe('');
    expect(draft.coverInfo.projectOverview).toBe('');
  });

  it('rolls back the orphaned project and redirects home if anything fails after project creation', async () => {
    const callsBefore = vi.mocked(createProject).mock.results.length;
    vi.mocked(loadProjectEstimateDefaults).mockRejectedValueOnce(
      new Error('Simulated downstream failure for the /import error-path test'),
    );

    const request = new NextRequest('http://localhost/import');
    const response = await GET(request);

    // createProject() really ran against the live DB before the simulated failure. Recover the
    // id it created so we can both prove the route cleaned it up and let afterEach clean up
    // regardless (its deleteMany is a harmless no-op if the route already deleted the row).
    const created = await vi.mocked(createProject).mock.results[callsBefore]!.value as { id: string };
    createdIds.push(created.id);

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    expect(new URL(location).pathname).toBe('/');
    expect(response.headers.get('x-robots-tag')).toBe('noindex');

    const project = await prisma.project.findUnique({ where: { id: created.id } });
    expect(project).toBeNull();
  });
});
