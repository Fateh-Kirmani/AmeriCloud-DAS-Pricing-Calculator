'use server';

import { prisma } from '@/lib/db';
import { Prisma, type LaborRoleName, type LaborSheet } from '@prisma/client';
import { parseDerivedFrom } from '@/lib/data/loadReferenceData';
import { revalidatePath } from 'next/cache';
import type { ActionResult, ValidationErr } from '@/lib/admin/validation';

const VALID_SHEETS: LaborSheet[] = ['LOE', 'SOW'];
const VALID_ROLES: LaborRoleName[] = [
  'Technician', 'Construction_Manager', 'RF_Engineer', 'RF_Technician', 'Project_Coordinator', 'Project_Manager',
];

interface LaborTaskOk {
  ok: true;
  key: string;
  sheet: LaborSheet;
  category: string;
  name: string;
  minutesPerUnit: number;
  unit: string;
  laborRole: LaborRoleName;
  includedInSubtotal: boolean;
}

function validateLaborTaskValues(values: Record<string, string>): LaborTaskOk | ValidationErr {
  const key = values.key?.trim();
  if (!key) return { ok: false, error: 'Key is required.' };
  const sheet = values.sheet as LaborSheet;
  if (!VALID_SHEETS.includes(sheet)) return { ok: false, error: 'Sheet must be LOE or SOW.' };
  const category = values.category?.trim();
  if (!category) return { ok: false, error: 'Category is required.' };
  const name = values.name?.trim();
  if (!name) return { ok: false, error: 'Name is required.' };
  const minutesPerUnit = Number(values.minutesPerUnit);
  if (values.minutesPerUnit === undefined || values.minutesPerUnit === '' || Number.isNaN(minutesPerUnit) || minutesPerUnit < 0) {
    return { ok: false, error: 'Minutes per unit must be a non-negative number.' };
  }
  const unit = values.unit?.trim();
  if (!unit) return { ok: false, error: 'Unit is required.' };
  const laborRole = values.laborRole as LaborRoleName;
  if (!VALID_ROLES.includes(laborRole)) return { ok: false, error: 'Labor role is invalid.' };
  const includedInSubtotal = values.includedInSubtotal === 'true';
  return { ok: true, key, sheet, category, name, minutesPerUnit, unit, laborRole, includedInSubtotal };
}

export async function createProjectLaborTask(projectId: string, values: Record<string, string>): Promise<ActionResult> {
  const parsed = validateLaborTaskValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const existing = await prisma.projectLaborTask.findUnique({
    where: { projectId_key: { projectId, key: parsed.key } },
  });
  if (existing) return { error: `A labor task with key "${parsed.key}" already exists.` };

  try {
    await prisma.projectLaborTask.create({
      data: {
        projectId,
        key: parsed.key,
        sheet: parsed.sheet,
        category: parsed.category,
        name: parsed.name,
        minutesPerUnit: parsed.minutesPerUnit,
        unit: parsed.unit,
        laborRole: parsed.laborRole,
        includedInSubtotal: parsed.includedInSubtotal,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A labor task with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

export async function updateProjectLaborTask(projectId: string, id: string, values: Record<string, string>): Promise<ActionResult> {
  const parsed = validateLaborTaskValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const keyOwner = await prisma.projectLaborTask.findUnique({
    where: { projectId_key: { projectId, key: parsed.key } },
  });
  if (keyOwner && keyOwner.id !== id) return { error: `A labor task with key "${parsed.key}" already exists.` };

  try {
    const result = await prisma.projectLaborTask.updateMany({
      where: { id, projectId },
      data: {
        key: parsed.key,
        sheet: parsed.sheet,
        category: parsed.category,
        name: parsed.name,
        minutesPerUnit: parsed.minutesPerUnit,
        unit: parsed.unit,
        laborRole: parsed.laborRole,
        includedInSubtotal: parsed.includedInSubtotal,
      },
    });
    if (result.count === 0) return { error: 'Task not found in this project.' };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A labor task with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

export async function deleteProjectLaborTask(projectId: string, id: string): Promise<ActionResult> {
  const target = await prisma.projectLaborTask.findFirst({ where: { id, projectId } });
  if (!target) return { error: 'Task not found in this project.' };

  const allTasks = await prisma.projectLaborTask.findMany({
    where: { projectId },
    select: { key: true, derivedFromJson: true },
  });

  const referencingTasks: string[] = [];
  const unparseableTasks: string[] = [];
  for (const t of allTasks) {
    let derived: ReturnType<typeof parseDerivedFrom>;
    try {
      derived = parseDerivedFrom(t.derivedFromJson, t.key);
    } catch {
      unparseableTasks.push(t.key);
      continue;
    }
    if (derived?.terms.some((term) => term.key === target.key)) {
      referencingTasks.push(t.key);
    }
  }

  if (unparseableTasks.length > 0) {
    const names = unparseableTasks.join(', ');
    return { error: `Cannot verify it's safe to delete "${target.key}" — the following task(s) have malformed derivation data and could not be checked: ${names}. Fix their data first.` };
  }
  if (referencingTasks.length > 0) {
    const names = referencingTasks.join(', ');
    return { error: `Cannot delete "${target.key}" — it is referenced by the derived quantity formula of: ${names}.` };
  }

  const result = await prisma.projectLaborTask.deleteMany({ where: { id, projectId } });
  if (result.count === 0) return { error: 'Task not found in this project.' };
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}
