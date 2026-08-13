'use server';

import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { parseNonNegative, type ActionResult, type ValidationErr } from '@/lib/admin/validation';

export async function updateProjectPassThroughRoleRate(projectId: string, id: string, values: Record<string, string>): Promise<ActionResult> {
  const amount = parseNonNegative(values.amount);
  if (amount === null) return { error: 'Amount must be a non-negative number.' };

  const result = await prisma.projectPassThroughRoleRate.updateMany({
    where: { id, projectId },
    data: { amount },
  });
  if (result.count === 0) return { error: 'Rate not found in this project.' };
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

interface RentalOk {
  ok: true;
  key: string;
  name: string;
  rate: number;
  unit: string;
}

function validateRentalValues(values: Record<string, string>): RentalOk | ValidationErr {
  const key = values.key?.trim();
  if (!key) return { ok: false, error: 'Key is required.' };
  const name = values.name?.trim();
  if (!name) return { ok: false, error: 'Name is required.' };
  const rate = parseNonNegative(values.rate);
  if (rate === null) return { ok: false, error: 'Rate must be a non-negative number.' };
  const unit = values.unit?.trim();
  if (!unit) return { ok: false, error: 'Billing unit is required.' };
  return { ok: true, key, name, rate, unit };
}

export async function createProjectRental(projectId: string, values: Record<string, string>): Promise<ActionResult> {
  const parsed = validateRentalValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const existing = await prisma.projectRentalRate.findUnique({
    where: { projectId_key: { projectId, key: parsed.key } },
  });
  if (existing) return { error: `A rental with key "${parsed.key}" already exists.` };

  try {
    await prisma.projectRentalRate.create({
      data: { projectId, key: parsed.key, name: parsed.name, rate: parsed.rate, unit: parsed.unit },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A rental with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

export async function updateProjectRental(projectId: string, id: string, values: Record<string, string>): Promise<ActionResult> {
  const parsed = validateRentalValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const keyOwner = await prisma.projectRentalRate.findUnique({
    where: { projectId_key: { projectId, key: parsed.key } },
  });
  if (keyOwner && keyOwner.id !== id) return { error: `A rental with key "${parsed.key}" already exists.` };

  try {
    const result = await prisma.projectRentalRate.updateMany({
      where: { id, projectId },
      data: { key: parsed.key, name: parsed.name, rate: parsed.rate, unit: parsed.unit },
    });
    if (result.count === 0) return { error: 'Rental not found in this project.' };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A rental with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

export async function deleteProjectRental(projectId: string, id: string): Promise<ActionResult> {
  const result = await prisma.projectRentalRate.deleteMany({ where: { id, projectId } });
  if (result.count === 0) return { error: 'Rental not found in this project.' };
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

interface SoftCostOk {
  ok: true;
  key: string;
  name: string;
  fee: number;
}

function validateSoftCostValues(values: Record<string, string>): SoftCostOk | ValidationErr {
  const key = values.key?.trim();
  if (!key) return { ok: false, error: 'Key is required.' };
  const name = values.name?.trim();
  if (!name) return { ok: false, error: 'Name is required.' };
  const fee = parseNonNegative(values.fee);
  if (fee === null) return { ok: false, error: 'Fee must be a non-negative number.' };
  return { ok: true, key, name, fee };
}

export async function createProjectSoftCost(projectId: string, values: Record<string, string>): Promise<ActionResult> {
  const parsed = validateSoftCostValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const existing = await prisma.projectSoftCostRate.findUnique({
    where: { projectId_key: { projectId, key: parsed.key } },
  });
  if (existing) return { error: `A soft cost with key "${parsed.key}" already exists.` };

  try {
    await prisma.projectSoftCostRate.create({
      data: { projectId, key: parsed.key, name: parsed.name, fee: parsed.fee },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A soft cost with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

export async function updateProjectSoftCost(projectId: string, id: string, values: Record<string, string>): Promise<ActionResult> {
  const parsed = validateSoftCostValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const keyOwner = await prisma.projectSoftCostRate.findUnique({
    where: { projectId_key: { projectId, key: parsed.key } },
  });
  if (keyOwner && keyOwner.id !== id) return { error: `A soft cost with key "${parsed.key}" already exists.` };

  try {
    const result = await prisma.projectSoftCostRate.updateMany({
      where: { id, projectId },
      data: { key: parsed.key, name: parsed.name, fee: parsed.fee },
    });
    if (result.count === 0) return { error: 'Soft cost not found in this project.' };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A soft cost with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}

export async function deleteProjectSoftCost(projectId: string, id: string): Promise<ActionResult> {
  const result = await prisma.projectSoftCostRate.deleteMany({ where: { id, projectId } });
  if (result.count === 0) return { error: 'Soft cost not found in this project.' };
  revalidatePath(`/project/${projectId}`, 'layout');
  return {};
}
