// src/lib/project/saveProjectDraft.ts
'use server';

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type { PersistedDraft } from '@/lib/estimate/EstimateContext';

export async function saveProjectDraft(projectId: string, draft: PersistedDraft): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: {
      // Cast needed because Prisma's InputJsonValue type is stricter about nested optional
      // fields than a plain TS interface like PersistedDraft — the actual value is always
      // plain JSON-serializable data (strings, numbers, arrays, nested objects).
      draftJson: draft as unknown as Prisma.InputJsonValue,
      name: draft.coverInfo.project,
      client: draft.coverInfo.client,
    },
  });
}
