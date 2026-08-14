'use server';

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { parseLabeledPercent, type ActionResult, type ValidationErr } from '@/lib/admin/validation';

interface DefaultsOk {
  ok: true;
  laborMarkupPct: number;
  passThroughMarkupPct: number;
  materialMarkupPct: number;
  corporateMarkupPct: number;
  taxRate: number;
  contingencyPct: number;
}

function validateDefaultsValues(values: Record<string, string>): DefaultsOk | ValidationErr {
  const laborMarkupPct = parseLabeledPercent(values.laborMarkupPct, 'Labor markup %');
  if (typeof laborMarkupPct !== 'number') return { ok: false, error: laborMarkupPct.error };
  const passThroughMarkupPct = parseLabeledPercent(values.passThroughMarkupPct, 'Pass-through markup %');
  if (typeof passThroughMarkupPct !== 'number') return { ok: false, error: passThroughMarkupPct.error };
  const materialMarkupPct = parseLabeledPercent(values.materialMarkupPct, 'Material markup %');
  if (typeof materialMarkupPct !== 'number') return { ok: false, error: materialMarkupPct.error };
  const corporateMarkupPct = parseLabeledPercent(values.corporateMarkupPct, 'Corporate markup %');
  if (typeof corporateMarkupPct !== 'number') return { ok: false, error: corporateMarkupPct.error };
  const taxRate = parseLabeledPercent(values.taxRate, 'Tax rate');
  if (typeof taxRate !== 'number') return { ok: false, error: taxRate.error };
  const contingencyPct = parseLabeledPercent(values.contingencyPct, 'Contingency %');
  if (typeof contingencyPct !== 'number') return { ok: false, error: contingencyPct.error };
  return {
    ok: true, laborMarkupPct, passThroughMarkupPct, materialMarkupPct, corporateMarkupPct, taxRate, contingencyPct,
  };
}

// Once a project has a saved draft, EstimateContext's normalizeDraft() merges the draft's own
// copy of these six fields OVER fresh values loaded from ProjectEstimateDefaults — so without
// this write-through, editing them here would have no visible effect on an existing project (the
// draft's stale copy always wins). A brand-new project has no draftJson yet and picks up fresh
// defaults the first time the estimator builds a blank draft, so there's nothing to write through.
function withUpdatedDefaults(draftJson: Prisma.JsonValue, parsed: DefaultsOk): Prisma.InputJsonValue {
  const draft = draftJson as Record<string, unknown>;
  const markups = draft.markups && typeof draft.markups === 'object'
    ? (draft.markups as Record<string, unknown>)
    : {};
  return {
    ...draft,
    contingencyPct: parsed.contingencyPct,
    markups: {
      ...markups,
      laborMarkupPct: parsed.laborMarkupPct,
      passThroughMarkupPct: parsed.passThroughMarkupPct,
      materialMarkupPct: parsed.materialMarkupPct,
      corporateMarkupPct: parsed.corporateMarkupPct,
      taxRate: parsed.taxRate,
    },
  } as Prisma.InputJsonValue;
}

export async function updateProjectEstimateDefaults(projectId: string, values: Record<string, string>): Promise<ActionResult> {
  const parsed = validateDefaultsValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { draftJson: true } });
  if (!project) return { error: 'Project not found.' };

  const hasDraft = project.draftJson !== null && typeof project.draftJson === 'object';

  await prisma.$transaction([
    prisma.projectEstimateDefaults.update({
      where: { projectId },
      data: {
        laborMarkupPct: parsed.laborMarkupPct,
        passThroughMarkupPct: parsed.passThroughMarkupPct,
        materialMarkupPct: parsed.materialMarkupPct,
        corporateMarkupPct: parsed.corporateMarkupPct,
        taxRate: parsed.taxRate,
        contingencyPct: parsed.contingencyPct,
      },
    }),
    ...(hasDraft
      ? [prisma.project.update({
        where: { id: projectId },
        data: { draftJson: withUpdatedDefaults(project.draftJson as Prisma.JsonValue, parsed) },
      })]
      : []),
  ]);
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}
