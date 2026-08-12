'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { parseNonNegative, parsePercent, parseNonNegativeInt, type ActionResult, type ValidationErr } from '@/lib/admin/validation';

export async function updateProjectLaborRate(projectId: string, id: string, values: Record<string, string>): Promise<ActionResult> {
  const hourlyRate = parseNonNegative(values.hourlyRate);
  if (hourlyRate === null) return { error: 'Hourly rate must be a non-negative number.' };
  const rawWageRate = parseNonNegative(values.rawWageRate);
  if (rawWageRate === null) return { error: 'Raw wage rate must be a non-negative number.' };

  const result = await prisma.projectLaborRate.updateMany({
    where: { id, projectId },
    data: { hourlyRate, rawWageRate },
  });
  if (result.count === 0) return { error: 'Rate not found in this project.' };
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

export async function updateProjectCrewSizeRow(projectId: string, id: string, values: Record<string, string>): Promise<ActionResult> {
  const cmsNeeded = parseNonNegativeInt(values.cmsNeeded);
  if (cmsNeeded === null) return { error: 'CMs needed must be a non-negative whole number.' };

  const result = await prisma.projectCrewSizeRow.updateMany({
    where: { id, projectId },
    data: { cmsNeeded },
  });
  if (result.count === 0) return { error: 'Row not found in this project.' };
  revalidatePath(`/project/${projectId}`, 'layout');
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

export async function updateProjectLaborProjectionSettings(projectId: string, values: Record<string, string>): Promise<ActionResult> {
  const parsed = validateSettingsValues(values);
  if (!parsed.ok) return { error: parsed.error };

  await prisma.projectLaborProjectionSettings.update({
    where: { projectId },
    data: {
      hoursPerManDay: parsed.hoursPerManDay,
      hoursPerManWeek: parsed.hoursPerManWeek,
      stagingMaterialMultiplier: parsed.stagingMaterialMultiplier,
      cmPercentOfTechHours: parsed.cmPercentOfTechHours,
      pmPercentOfTechHours: parsed.pmPercentOfTechHours,
      coordinatorPercentOfTechHours: parsed.coordinatorPercentOfTechHours,
    },
  });
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}
