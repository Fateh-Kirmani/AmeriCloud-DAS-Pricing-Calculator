// src/lib/calc/markupBackSolve.test.ts
import { describe, it, expect } from 'vitest';
import {
  backSolveCategoryMarkupsFromPreTweakPercent,
  backSolveMarginTweakFromPostTweakPercent,
} from './markupBackSolve';
import { calculateExecutiveSummary } from './executiveSummary';
import type { LaborResult, CrewPlanResult, PassThroughResult, MaterialResult } from './types';

describe('backSolveCategoryMarkupsFromPreTweakPercent', () => {
  it('sets all three category markup rates equal to the entered percent', () => {
    const result = backSolveCategoryMarkupsFromPreTweakPercent(0.3, 100000);
    expect(result).toEqual({
      laborMarkupPct: 0.3,
      passThroughMarkupPct: 0.3,
      materialMarkupPct: 0.3,
    });
  });

  it('returns null (no-op) when break-even is $0', () => {
    const result = backSolveCategoryMarkupsFromPreTweakPercent(0.3, 0);
    expect(result).toBeNull();
  });
});

describe('backSolveMarginTweakFromPostTweakPercent', () => {
  it('back-solves the dollar tweak from a target post-tweak percent', () => {
    // breakEven = 100000, totalDirectCost = 125000 (25% pre-tweak markup already applied).
    // Target post-tweak percent = 30% -> PGM Grand Total should be 130000 -> tweak = 5000.
    const result = backSolveMarginTweakFromPostTweakPercent(0.3, 100000, 125000);
    expect(result).toBeCloseTo(5000, 6);
  });

  it('returns null (no-op) when break-even is $0', () => {
    const result = backSolveMarginTweakFromPostTweakPercent(0.3, 0, 0);
    expect(result).toBeNull();
  });
});

describe('markup back-solve round trip through calculateExecutiveSummary', () => {
  const labor: LaborResult = { taskResults: [], categorySubtotals: [], roleTotals: [], grandHours: 1000, grandCost: 85000 };
  const crewPlan: CrewPlanResult = {
    totalHoursInProject: 1000, stagingHours: 50, totalProjectTime: 1050,
    manDays: 131.25, manWeeks: 26.25, calendarDays: 32.8125, calendarWeeks: 6.5625,
    cmsNeeded: 2, totalCmHours: 525, averageOpsLaborRate: 85,
    opsAdminLaborByRole: [
      { role: 'Construction Manager', hours: 262.5, cost: 262.5 * 95 },
      { role: 'Project Manager', hours: 131.25, cost: 131.25 * 100 },
      { role: 'Project Coordinator', hours: 78.75, cost: 78.75 * 55 },
    ],
    opsAdminLaborTotal: { hours: 472.5, cost: 262.5 * 95 + 131.25 * 100 + 78.75 * 55 },
  };
  const passThroughs: PassThroughResult = {
    perDiemTotal: 2000, lodgingTotal: 4800, travelTotal: 2040, travelHours: 24,
    airfareTotal: 1000, rentalsTotal: 3600, softCostsTotal: 4500,
    grandTotal: 2000 + 4800 + 2040 + 1000 + 3600 + 4500,
  };
  const materials: MaterialResult = {
    lines: [],
    categoryTotals: [
      { category: 'Consumable', total: 500 },
      { category: 'DAS Materials', total: 40000 },
      { category: 'BAT Materials', total: 0 },
    ],
    contingency: 4050,
    shippingHandling: 200,
    hardwareTotal: 500 + 40000 + 0 + 4050 + 200,
  };
  const settings = {
    hoursPerManDay: 8, hoursPerManWeek: 40, stagingMaterialMultiplier: 0.05,
    cmPercentOfTechHours: 0.5, pmPercentOfTechHours: 0.25, coordinatorPercentOfTechHours: 0.15,
  };
  const baseMarkups = {
    laborMarkupPct: 0.1, passThroughMarkupPct: 0.4, materialMarkupPct: 0.2,
    corporateMarkupPct: 0.05, marginTweak: 0, taxRate: 0.0825,
  };

  it('editing the pre-tweak percent produces a result whose displayed pre-tweak percent matches exactly', () => {
    const rates = backSolveCategoryMarkupsFromPreTweakPercent(0.22, 999999);
    expect(rates).not.toBeNull();
    const updatedMarkups = { ...baseMarkups, ...rates! };
    const result = calculateExecutiveSummary(labor, crewPlan, passThroughs, materials, settings, updatedMarkups);
    expect(result.markupPercent).toBeCloseTo(0.22, 6);
  });

  it('editing the post-tweak percent produces a PGM Grand Total whose implied post-tweak percent matches, and the dollar tweak agrees', () => {
    const base = calculateExecutiveSummary(labor, crewPlan, passThroughs, materials, settings, baseMarkups);
    const tweak = backSolveMarginTweakFromPostTweakPercent(0.35, base.totalDirectCostBreakEven, base.totalDirectCost);
    expect(tweak).not.toBeNull();
    const updatedMarkups = { ...baseMarkups, marginTweak: tweak! };
    const result = calculateExecutiveSummary(labor, crewPlan, passThroughs, materials, settings, updatedMarkups);
    const impliedPostTweakPercent = result.projectedGrossMarginTotal / result.totalDirectCostBreakEven - 1;
    expect(impliedPostTweakPercent).toBeCloseTo(0.35, 6);
    expect(result.projectedGrossMarginTotal).toBeCloseTo(base.totalDirectCostBreakEven * 1.35, 6);
  });
});
