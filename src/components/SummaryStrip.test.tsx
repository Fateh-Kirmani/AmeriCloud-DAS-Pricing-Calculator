// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EstimateProvider } from '@/lib/estimate/EstimateContext';
import { SummaryStrip } from './SummaryStrip';
import type { ReferenceData } from '@/lib/calc';

const referenceData: ReferenceData = {
  materialItems: [
    { key: 'bom-3', type: 'DC Power Plant', manufacturer: 'Vertiv', model: '582137200', description: 'NetSure 5100', vendor: 'Anixter', category: 'DAS Materials', unitCost: 4685 },
  ],
  laborTasks: [],
  laborRates: [
    { role: 'Technician', hourlyRate: 85, rawWageRate: 85 },
    { role: 'Construction Manager', hourlyRate: 95, rawWageRate: 95 },
    { role: 'RF-Engineer', hourlyRate: 100, rawWageRate: 75 },
    { role: 'RF-Technician', hourlyRate: 75, rawWageRate: 75 },
    { role: 'Project Coordinator', hourlyRate: 55, rawWageRate: 55 },
    { role: 'Project Manager', hourlyRate: 100, rawWageRate: 100 },
  ],
  crewSizeTable: [{ technicianCount: 4, cmsNeeded: 1 }],
  laborProjectionSettings: {
    hoursPerManDay: 8, hoursPerManWeek: 40, stagingMaterialMultiplier: 0.05,
    cmPercentOfTechHours: 0.5, pmPercentOfTechHours: 0.25, coordinatorPercentOfTechHours: 0.15,
  },
  passThroughRates: {
    perDiemRateByRole: [], lodgingRateByRole: [], airfareCostByRole: [], rentals: [], softCosts: [],
  },
};

const estimateDefaults = {
  laborMarkupPct: 0.25, passThroughMarkupPct: 0.25, materialMarkupPct: 0.25,
  corporateMarkupPct: 0.05, taxRate: 0.0825, contingencyPct: 0.10,
};

describe('SummaryStrip', () => {
  it('renders zeroed totals for an empty estimate', () => {
    render(
      <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
        <SummaryStrip />
      </EstimateProvider>,
    );
    expect(screen.getByText('Materials:').parentElement?.textContent).toContain('$0');
    expect(screen.getByText('Grand Total to Bid:').parentElement?.textContent).toContain('$0');
  });
});
