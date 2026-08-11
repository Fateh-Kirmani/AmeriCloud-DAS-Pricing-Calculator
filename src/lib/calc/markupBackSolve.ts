// src/lib/calc/markupBackSolve.ts

export function backSolveCategoryMarkupsFromPreTweakPercent(
  enteredPercent: number,
  totalDirectCostBreakEven: number,
): { laborMarkupPct: number; passThroughMarkupPct: number; materialMarkupPct: number } | null {
  if (totalDirectCostBreakEven === 0) return null;
  return {
    laborMarkupPct: enteredPercent,
    passThroughMarkupPct: enteredPercent,
    materialMarkupPct: enteredPercent,
  };
}

export function backSolveMarginTweakFromPostTweakPercent(
  enteredPercent: number,
  totalDirectCostBreakEven: number,
  totalDirectCost: number,
): number | null {
  if (totalDirectCostBreakEven === 0) return null;
  return (enteredPercent + 1) * totalDirectCostBreakEven - totalDirectCost;
}
