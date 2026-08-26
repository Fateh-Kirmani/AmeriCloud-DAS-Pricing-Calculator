// src/app/import/route.ts
//
// Landing point for the Site Tracker Tool's "Import to BOM Estimator" button — a plain link
// (not a fetch/API call), so this reads its input from query params and responds with a redirect,
// same shape as any other GET navigation. See
// docs/superpowers/specs/2026-08-26-site-tracker-import-design.md for the full cross-repo design.

import { NextRequest, NextResponse } from 'next/server';
import { createProject } from '@/lib/project/createProject';
import { loadProjectEstimateDefaults } from '@/lib/data/loadProjectReferenceData';
import { buildBlankDraft } from '@/lib/estimate/draft';
import { saveProjectDraft } from '@/lib/project/saveProjectDraft';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const client = searchParams.get('client') ?? '';
  const project = searchParams.get('project') ?? '';
  const jobSiteAddress = searchParams.get('jobSiteAddress') ?? '';
  const projectOverview = searchParams.get('projectOverview') ?? '';

  const { id } = await createProject();
  const estimateDefaults = await loadProjectEstimateDefaults(id);
  const draft = buildBlankDraft(estimateDefaults);
  draft.coverInfo = { ...draft.coverInfo, client, project, jobSiteAddress, projectOverview };
  await saveProjectDraft(id, draft);

  return NextResponse.redirect(new URL(`/project/${id}`, request.url));
}
