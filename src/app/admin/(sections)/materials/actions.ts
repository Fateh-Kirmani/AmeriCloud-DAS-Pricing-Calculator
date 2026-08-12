'use server';

import { prisma } from '@/lib/db';
import { Prisma, type MaterialCategory } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/adminAuth';
import type { ActionResult, ValidationErr } from '@/lib/admin/validation';

const VALID_CATEGORIES: MaterialCategory[] = ['Consumable', 'DAS_Materials', 'BAT_Materials'];

interface MaterialOk {
  ok: true;
  key: string;
  type: string;
  description: string;
  category: MaterialCategory;
  unitCost: number;
  manufacturer: string | null;
  model: string | null;
  vendor: string | null;
}

function validateMaterialValues(values: Record<string, string>): MaterialOk | ValidationErr {
  const key = values.key?.trim();
  if (!key) return { ok: false, error: 'Key is required.' };
  const type = values.type?.trim();
  if (!type) return { ok: false, error: 'Type is required.' };
  const description = values.description?.trim();
  if (!description) return { ok: false, error: 'Description is required.' };
  const category = values.category as MaterialCategory;
  if (!VALID_CATEGORIES.includes(category)) return { ok: false, error: 'Category is invalid.' };
  const unitCost = Number(values.unitCost);
  if (values.unitCost === undefined || values.unitCost === '' || Number.isNaN(unitCost) || unitCost < 0) {
    return { ok: false, error: 'Unit cost must be a non-negative number.' };
  }
  return {
    ok: true,
    key,
    type,
    description,
    category,
    unitCost,
    manufacturer: values.manufacturer?.trim() || null,
    model: values.model?.trim() || null,
    vendor: values.vendor?.trim() || null,
  };
}

export async function createMaterial(values: Record<string, string>): Promise<ActionResult> {
  if (!(await requireAdminSession())) return { error: 'Not authenticated.' };
  const parsed = validateMaterialValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const existing = await prisma.materialItem.findUnique({ where: { key: parsed.key } });
  if (existing) return { error: `A material with key "${parsed.key}" already exists.` };

  try {
    await prisma.materialItem.create({
      data: {
        key: parsed.key,
        type: parsed.type,
        manufacturer: parsed.manufacturer,
        model: parsed.model,
        description: parsed.description,
        vendor: parsed.vendor,
        category: parsed.category,
        unitCost: parsed.unitCost,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A material with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath('/', 'layout');
  return {};
}

export async function updateMaterial(id: string, values: Record<string, string>): Promise<ActionResult> {
  if (!(await requireAdminSession())) return { error: 'Not authenticated.' };
  const parsed = validateMaterialValues(values);
  if (!parsed.ok) return { error: parsed.error };

  const keyOwner = await prisma.materialItem.findUnique({ where: { key: parsed.key } });
  if (keyOwner && keyOwner.id !== id) return { error: `A material with key "${parsed.key}" already exists.` };

  try {
    await prisma.materialItem.update({
      where: { id },
      data: {
        key: parsed.key,
        type: parsed.type,
        manufacturer: parsed.manufacturer,
        model: parsed.model,
        description: parsed.description,
        vendor: parsed.vendor,
        category: parsed.category,
        unitCost: parsed.unitCost,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: `A material with key "${parsed.key}" already exists.` };
    }
    throw error;
  }
  revalidatePath('/', 'layout');
  return {};
}

export async function deleteMaterial(id: string): Promise<ActionResult> {
  if (!(await requireAdminSession())) return { error: 'Not authenticated.' };
  await prisma.materialItem.delete({ where: { id } });
  revalidatePath('/', 'layout');
  return {};
}
