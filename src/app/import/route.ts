// src/app/import/route.ts
//
// Landing point for the Site Tracker Tool's "Import to BOM Estimator" button — a plain link
// (not a fetch/API call), so this reads its input from query params and responds with a redirect,
// same shape as any other GET navigation. See
// docs/superpowers/specs/2026-08-26-site-tracker-import-design.md for the full cross-repo design.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createProject } from '@/lib/project/createProject';
import { loadProjectEstimateDefaults } from '@/lib/data/loadProjectReferenceData';
import { buildBlankDraft } from '@/lib/estimate/draft';
import { saveProjectDraft } from '@/lib/project/saveProjectDraft';

// Search engines respect src/app/robots.ts's disallow of /import, but crawlers can ignore
// robots.txt and it does nothing for link-unfurlers (Slack/Teams/email preview) or browser
// prefetch, which fetch the URL directly. This header is defense in depth against those —
// it tells anything that does fetch this URL not to index/preview it. It does not (and can't)
// stop a same-origin browser prefetch from firing the GET in the first place; that's an
// accepted residual risk, not solved here.
const NOINDEX_HEADERS = { 'X-Robots-Tag': 'noindex' };

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const client = searchParams.get('client') ?? '';
  const project = searchParams.get('project') ?? '';
  const jobSiteAddress = searchParams.get('jobSiteAddress') ?? '';
  const projectOverview = searchParams.get('projectOverview') ?? '';

  let id: string | undefined;
  try {
    ({ id } = await createProject());
    const estimateDefaults = await loadProjectEstimateDefaults(id);
    const draft = buildBlankDraft(estimateDefaults);
    draft.coverInfo = { ...draft.coverInfo, client, project, jobSiteAddress, projectOverview };
    await saveProjectDraft(id, draft);
  } catch (error) {
    console.error('GET /import failed after project creation; rolling back and redirecting home:', error);
    if (id) {
      // Best-effort cleanup of the orphaned project row. Safe even if some child rows never got
      // created (e.g. createProject succeeded but loadProjectEstimateDefaults threw) — every
      // project-scoped table cascades from Project via onDelete: Cascade.
      await prisma.project.deleteMany({ where: { id } }).catch((cleanupError) => {
        console.error(`GET /import: failed to clean up orphaned project "${id}":`, cleanupError);
      });
    }
    return NextResponse.redirect(new URL('/', request.url), { headers: NOINDEX_HEADERS });
  }

  return NextResponse.redirect(new URL(`/project/${id}`, request.url), { headers: NOINDEX_HEADERS });
}
