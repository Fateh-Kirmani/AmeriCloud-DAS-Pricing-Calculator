// src/app/api/projects/[projectId]/draft/route.ts
//
// Plain HTTP endpoint (not a Server Action) so the client can reach it via navigator.sendBeacon()
// as a last-resort save when the page is being torn down (tab close, browser back/forward, typing
// a new URL, refresh) — a normal fetch()-based Server Action call can be aborted mid-flight by the
// browser once the document starts unloading, but sendBeacon is specifically designed to survive
// that. See EstimateContext.tsx's pagehide handler for the sender side.

import { NextRequest, NextResponse } from 'next/server';
import { saveProjectDraft } from '@/lib/project/saveProjectDraft';

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const draft = await request.json();
  await saveProjectDraft(params.projectId, draft);
  return NextResponse.json({ ok: true });
}
