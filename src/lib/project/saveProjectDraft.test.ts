// src/lib/project/saveProjectDraft.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createProject } from './createProject';
import { saveProjectDraft } from './saveProjectDraft';
import type { PersistedDraft } from '@/lib/estimate/EstimateContext';

const SAMPLE_DRAFT: PersistedDraft = {
  coverInfo: {
    client: 'Acme Corp', project: 'Downtown Stadium DAS', rfpDate: '', bidDueDate: '', estimator: '',
    contactName: '', contactPhone: '', contactEmail: '', customerType: '',
    jobSiteAddress: '', projectOverview: '',
  },
  materials: [{ key: 'bom-3', quantity: 2 }],
  contingencyPct: 0.1,
  shippingHandling: 200,
  loeTasks: [],
  sowTasks: [],
  technicianCount: 4,
  passThroughs: { perDiem: [], lodging: [], travel: [], airfare: [], rentals: [], softCosts: [] },
  markups: {
    laborMarkupPct: 0.25, passThroughMarkupPct: 0.25, materialMarkupPct: 0.25,
    corporateMarkupPct: 0.05, marginTweak: 0, taxRate: 0.0825,
  },
};

describe('saveProjectDraft (integration — requires a live, seeded local Postgres)', () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    for (const id of createdIds.splice(0)) {
      await prisma.project.deleteMany({ where: { id } });
    }
  });

  it('persists the draft and syncs Project.name/client from coverInfo', async () => {
    const { id } = await createProject();
    createdIds.push(id);

    await saveProjectDraft(id, SAMPLE_DRAFT);

    const project = await prisma.project.findUnique({ where: { id } });
    expect(project?.name).toBe('Downtown Stadium DAS');
    expect(project?.client).toBe('Acme Corp');
    expect(project?.draftJson).toEqual(SAMPLE_DRAFT);
  });

  it('overwrites a previous draft on a second call', async () => {
    const { id } = await createProject();
    createdIds.push(id);

    await saveProjectDraft(id, SAMPLE_DRAFT);
    const updatedDraft: PersistedDraft = {
      ...SAMPLE_DRAFT,
      coverInfo: { ...SAMPLE_DRAFT.coverInfo, project: 'Renamed Project', client: 'New Client' },
    };
    await saveProjectDraft(id, updatedDraft);

    const project = await prisma.project.findUnique({ where: { id } });
    expect(project?.name).toBe('Renamed Project');
    expect(project?.client).toBe('New Client');
  });
});
