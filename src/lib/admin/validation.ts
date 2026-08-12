// src/lib/admin/validation.ts

export interface ActionResult {
  error?: string;
}

export interface ValidationErr {
  ok: false;
  error: string;
}

export function parseNonNegative(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null;
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0) return null;
  return value;
}

export function parsePercent(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null;
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0 || value > 100) return null;
  return value / 100;
}

export function parseNonNegativeInt(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null;
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0 || !Number.isInteger(value)) return null;
  return value;
}

export function parseLabeledPercent(raw: string | undefined, label: string): number | { error: string } {
  if (raw === undefined || raw === '') return { error: `${label} is required.` };
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0 || value > 100) return { error: `${label} must be between 0 and 100.` };
  return value / 100;
}
