'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/adminAuth';
import { parseNonNegative, parsePercent, parseNonNegativeInt, type ActionResult, type ValidationErr } from '@/lib/admin/validation';

export async function updateLaborRate(id: string, values: Record<string, string>): Promise<ActionResult> {
  if (!(await requireAdminSession())) return { error: 'Not authenticated.' };
  const hourlyRate = parseNonNegative(values.hourlyRate);
  if (hourlyRate === null) return { error: 'Hourly rate must be a non-negative number.' };
  const rawWageRate = parseNonNegative(values.rawWageRate);
  if (rawWageRate === null) return { error: 'Raw wage rate must be a non-negative number.' };

  await prisma.laborRate.update({ where: { id }, data: { hourlyRate, rawWageRate } });
  revalidatePath('/', 'layout');
  return {};
}

export async function updateCrewSizeRow(id: string, values: Record<string, string>): Promise<ActionResult> {
  if (!(await requireAdminSession())) return { error: 'Not authenticated.' };
  const cmsNeeded = parseNonNegativeInt(values.cmsNeeded);
  if (cmsNeeded === null) return { error: 'CMs needed must be a non-negative whole number.' };

  await prisma.crewSizeRow.update({ where: { id }, data: { cmsNeeded } });
  revalidatePath('/', 'layout');
  return {};
}

interface SettingsOk {
  ok: true;
  hoursPerManDay: number;
  hoursPerManWeek: number;
  stagingMaterialMultiplier: number;
  cmPercentOfTechHours: number;
  pmPercentOfTechHours: number;
  coordinatorPercentOfTechHours: number;
}

function validateSettingsValues(values: Record<string, string>): SettingsOk | ValidationErr {
  const hoursPerManDay = parseNonNegative(values.hoursPerManDay);
  if (hoursPerManDay === null) return { ok: false, error: 'Hours per man-day must be a non-negative number.' };
  const hoursPerManWeek = parseNonNegative(values.hoursPerManWeek);
  if (hoursPerManWeek === null) return { ok: false, error: 'Hours per man-week must be a non-negative number.' };
  const stagingMaterialMultiplier = parsePercent(values.stagingMaterialMultiplier);
  if (stagingMaterialMultiplier === null) return { ok: false, error: 'Staging/material multiplier must be 0-100%.' };
  const cmPercentOfTechHours = parsePercent(values.cmPercentOfTechHours);
  if (cmPercentOfTechHours === null) return { ok: false, error: 'Construction Manager % must be 0-100%.' };
  const pmPercentOfTechHours = parsePercent(values.pmPercentOfTechHours);
  if (pmPercentOfTechHours === null) return { ok: false, error: 'Project Manager % must be 0-100%.' };
  const coordinatorPercentOfTechHours = parsePercent(values.coordinatorPercentOfTechHours);
  if (coordinatorPercentOfTechHours === null) return { ok: false, error: 'Project Coordinator % must be 0-100%.' };
  return {
    ok: true,
    hoursPerManDay,
    hoursPerManWeek,
    stagingMaterialMultiplier,
    cmPercentOfTechHours,
    pmPercentOfTechHours,
    coordinatorPercentOfTechHours,
  };
}

export async function updateLaborProjectionSettings(values: Record<string, string>): Promise<ActionResult> {
  if (!(await requireAdminSession())) return { error: 'Not authenticated.' };
  const parsed = validateSettingsValues(values);
  if (!parsed.ok) return { error: parsed.error };

  await prisma.laborProjectionSettings.update({
    where: { id: 'singleton' },
    data: {
      hoursPerManDay: parsed.hoursPerManDay,
      hoursPerManWeek: parsed.hoursPerManWeek,
      stagingMaterialMultiplier: parsed.stagingMaterialMultiplier,
      cmPercentOfTechHours: parsed.cmPercentOfTechHours,
      pmPercentOfTechHours: parsed.pmPercentOfTechHours,
      coordinatorPercentOfTechHours: parsed.coordinatorPercentOfTechHours,
    },
  });
  revalidatePath('/', 'layout');
  return {};
}
