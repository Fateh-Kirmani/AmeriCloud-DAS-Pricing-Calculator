'use server';

import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/adminAuth';
import { parseNonNegative, type ActionResult, type ValidationErr } from '@/lib/admin/validation';

export async function updatePassThroughRoleRate(id: string, values: Record<string, string>): Promise<ActionResult> {
  if (!(await requireAdminSession())) return { error: 'Not authenticated.' };
  const amount = parseNonNegative(values.amount);
  if (amount === null) return { error: 'Amount must be a non-negative number.' };

  await prisma.passThroughRoleRate.update({ where: { id }, data: { amount } });
  revalidatePath('/', 'layout');
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

export async function createRental(values: Record<string, string>): Promise<ActionResult> {
  if (!(await requireAdminSession())) return { error: 'Not authenticated.' };
  const parsed = validateRentalValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const existing = await prisma.rentalRate.findUnique({ where: { key: parsed.key } });
  if (existing) return { error: `A rental with key "${parsed.key}" already exists.` };

  try {
    await prisma.rentalRate.create({ data: { key: parsed.key, name: parsed.name, rate: parsed.rate, unit: parsed.unit } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A rental with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath('/', 'layout');
  return {};
}

export async function updateRental(id: string, values: Record<string, string>): Promise<ActionResult> {
  if (!(await requireAdminSession())) return { error: 'Not authenticated.' };
  const parsed = validateRentalValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const keyOwner = await prisma.rentalRate.findUnique({ where: { key: parsed.key } });
  if (keyOwner && keyOwner.id !== id) return { error: `A rental with key "${parsed.key}" already exists.` };

  try {
    await prisma.rentalRate.update({ where: { id }, data: { key: parsed.key, name: parsed.name, rate: parsed.rate, unit: parsed.unit } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A rental with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath('/', 'layout');
  return {};
}

export async function deleteRental(id: string): Promise<ActionResult> {
  if (!(await requireAdminSession())) return { error: 'Not authenticated.' };
  await prisma.rentalRate.delete({ where: { id } });
  revalidatePath('/', 'layout');
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

export async function createSoftCost(values: Record<string, string>): Promise<ActionResult> {
  if (!(await requireAdminSession())) return { error: 'Not authenticated.' };
  const parsed = validateSoftCostValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const existing = await prisma.softCostRate.findUnique({ where: { key: parsed.key } });
  if (existing) return { error: `A soft cost with key "${parsed.key}" already exists.` };

  try {
    await prisma.softCostRate.create({ data: { key: parsed.key, name: parsed.name, fee: parsed.fee } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A soft cost with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath('/', 'layout');
  return {};
}

export async function updateSoftCost(id: string, values: Record<string, string>): Promise<ActionResult> {
  if (!(await requireAdminSession())) return { error: 'Not authenticated.' };
  const parsed = validateSoftCostValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const keyOwner = await prisma.softCostRate.findUnique({ where: { key: parsed.key } });
  if (keyOwner && keyOwner.id !== id) return { error: `A soft cost with key "${parsed.key}" already exists.` };

  try {
    await prisma.softCostRate.update({ where: { id }, data: { key: parsed.key, name: parsed.name, fee: parsed.fee } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A soft cost with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath('/', 'layout');
  return {};
}

export async function deleteSoftCost(id: string): Promise<ActionResult> {
  if (!(await requireAdminSession())) return { error: 'Not authenticated.' };
  await prisma.softCostRate.delete({ where: { id } });
  revalidatePath('/', 'layout');
  return {};
}
