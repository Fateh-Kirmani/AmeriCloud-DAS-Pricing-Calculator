import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { createProject } from '@/lib/project/createProject';
import { POST } from './route';
import type { PersistedDraft } from '@/lib/estimate/EstimateContext';

const SAMPLE_DRAFT: PersistedDraft = {
  coverInfo: {
    client: 'Beacon Corp', project: 'Beacon Test', rfpDate: '', bidDueDate: '', estimator: '',
    contactName: '', contactPhone: '', contactEmail: '', customerType: '',
    jobSiteAddress: '', projectOverview: '',
  },
  materials: [{ key: 'bom-3', quantity: 1 }],
  contingencyPct: 0.1,
  shippingHandling: 0,
  loeTasks: [],
  sowTasks: [],
  technicianCount: 4,
  passThroughs: { perDiem: [], lodging: [], travel: [], airfare: [], rentals: [], softCosts: [] },
  markups: {
    laborMarkupPct: 0.25, passThroughMarkupPct: 0.25, materialMarkupPct: 0.25,
    corporateMarkupPct: 0.05, marginTweak: 0, taxRate: 0.0825,
  },
};

describe('POST /api/projects/[projectId]/draft (integration — requires a live, seeded local Postgres)', () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    for (const id of createdIds.splice(0)) {
      await prisma.project.deleteMany({ where: { id } });
    }
  });

  it('persists a draft sent as a sendBeacon-style POST body', async () => {
    const { id } = await createProject();
    createdIds.push(id);

    const request = new NextRequest(`http://localhost/api/projects/${id}/draft`, {
      method: 'POST',
      body: JSON.stringify(SAMPLE_DRAFT),
    });

    const response = await POST(request, { params: { projectId: id } });
    expect(response.status).toBe(200);

    const project = await prisma.project.findUnique({ where: { id } });
    expect(project?.name).toBe('Beacon Test');
    expect(project?.client).toBe('Beacon Corp');
    expect(project?.draftJson).toEqual(SAMPLE_DRAFT);
  });
});
