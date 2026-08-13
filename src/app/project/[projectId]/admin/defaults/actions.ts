'use server';

import { prisma } from '@/lib/db';
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

export async function updateProjectEstimateDefaults(projectId: string, values: Record<string, string>): Promise<ActionResult> {
  const parsed = validateDefaultsValues(values);
  if (!parsed.ok) return { error: parsed.error };

  await prisma.projectEstimateDefaults.update({
    where: { projectId },
    data: {
      laborMarkupPct: parsed.laborMarkupPct,
      passThroughMarkupPct: parsed.passThroughMarkupPct,
      materialMarkupPct: parsed.materialMarkupPct,
      corporateMarkupPct: parsed.corporateMarkupPct,
      taxRate: parsed.taxRate,
      contingencyPct: parsed.contingencyPct,
    },
  });
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}
