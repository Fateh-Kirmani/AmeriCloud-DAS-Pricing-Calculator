// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EstimateProvider, useEstimate, type PersistedDraft } from './EstimateContext';
import { saveProjectDraft } from '@/lib/project/saveProjectDraft';
import type { ReferenceData } from '@/lib/calc';

vi.mock('@/lib/project/saveProjectDraft', () => ({
  saveProjectDraft: vi.fn().mockResolvedValue(undefined),
}));

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

function TestConsumer() {
  const { result, setMaterialQuantity, coverInfo, setCoverInfo, flushSave } = useEstimate();
  return (
    <div>
      <div data-testid="hardware-total">{result.materials.hardwareTotal}</div>
      <div data-testid="client-name">{coverInfo.client}</div>
      <button onClick={() => setMaterialQuantity('bom-3', 2)}>Set Qty</button>
      <button onClick={() => setCoverInfo({ client: 'Acme Corp' })}>Set Client</button>
      <button onClick={() => setCoverInfo({ client: '' })}>Clear Client</button>
      <button onClick={() => flushSave()}>Flush</button>
    </div>
  );
}

describe('EstimateProvider / useEstimate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recomputes the result when a material quantity is set', () => {
    render(
      <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
        <TestConsumer />
      </EstimateProvider>,
    );

    expect(screen.getByTestId('hardware-total').textContent).toBe('0');
    fireEvent.click(screen.getByText('Set Qty'));
    // 4685 * 2 = 9370, +10% contingency (937) = 10307
    expect(screen.getByTestId('hardware-total').textContent).toBe('10307');
  });

  it('updates cover info independently of the estimate calculation', () => {
    render(
      <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
        <TestConsumer />
      </EstimateProvider>,
    );

    fireEvent.click(screen.getByText('Set Client'));
    expect(screen.getByTestId('client-name').textContent).toBe('Acme Corp');
  });

  it('initializes state from the initialDraft prop instead of a blank estimate', () => {
    const initialDraft: PersistedDraft = {
      coverInfo: {
        client: 'Restored Corp', project: '', rfpDate: '', bidDueDate: '', estimator: '',
        contactName: '', contactPhone: '', contactEmail: '', customerType: '',
        jobSiteAddress: '', projectOverview: '',
      },
      materials: [{ key: 'bom-3', quantity: 3 }],
      contingencyPct: 0.10,
      shippingHandling: 0,
      loeTasks: [],
      sowTasks: [],
      technicianCount: 4,
      passThroughs: { perDiem: [], lodging: [], travel: [], airfare: [], rentals: [], softCosts: [] },
      markups: {
        laborMarkupPct: 0.25, passThroughMarkupPct: 0.25, materialMarkupPct: 0.25,
        corporateMarkupPct: 0.05, marginTweak: 0, taxRate: 0.0825,
      },
    };

    render(
      <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={initialDraft}>
        <TestConsumer />
      </EstimateProvider>,
    );

    expect(screen.getByTestId('client-name').textContent).toBe('Restored Corp');
    // 4685 * 3 = 14055, +10% contingency (1405.5) = 15460.5
    expect(screen.getByTestId('hardware-total').textContent).toBe('15460.5');
  });

  it('calls saveProjectDraft after the debounce window once something changes', async () => {
    vi.useFakeTimers();
    try {
      render(
        <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
          <TestConsumer />
        </EstimateProvider>,
      );

      expect(saveProjectDraft).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText('Set Client'));
      expect(saveProjectDraft).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      expect(saveProjectDraft).toHaveBeenCalledTimes(1);
      const [projectId, draft] = vi.mocked(saveProjectDraft).mock.calls[0]!;
      expect(projectId).toBe('proj-1');
      expect(draft.coverInfo.client).toBe('Acme Corp');
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushSave immediately saves a pending change without waiting for the debounce', async () => {
    render(
      <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
        <TestConsumer />
      </EstimateProvider>,
    );

    fireEvent.click(screen.getByText('Set Client'));
    expect(saveProjectDraft).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByText('Flush'));
    });

    expect(saveProjectDraft).toHaveBeenCalledTimes(1);
  });

  it('does not resave via flushSave after an edit is reverted within the debounce window', async () => {
    // Regression test for a bug where the autosave effect's early-return branch (taken when
    // the current draft equals the last-saved draft again, e.g. after an edit is reverted)
    // failed to clear pendingSaveRef. That left flushSave() re-persisting a stale, already-
    // superseded draft even though nothing was actually pending anymore.
    vi.useFakeTimers();
    try {
      render(
        <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
          <TestConsumer />
        </EstimateProvider>,
      );

      fireEvent.click(screen.getByText('Set Client'));
      act(() => {
        vi.advanceTimersByTime(200); // still within the 500ms debounce window
      });
      fireEvent.click(screen.getByText('Clear Client')); // reverts to the last-saved baseline

      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      expect(saveProjectDraft).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent.click(screen.getByText('Flush'));
      });
      expect(saveProjectDraft).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops warning before unload once a pending autosave completes', async () => {
    // Regression test for a bug where lastSavedJsonRef was a plain ref: mutating it inside the
    // debounce timer's callback didn't trigger a re-render, so isDirty (and the beforeunload
    // listener's closure over it) stayed stale after a successful autosave.
    vi.useFakeTimers();
    try {
      render(
        <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
          <TestConsumer />
        </EstimateProvider>,
      );

      fireEvent.click(screen.getByText('Set Client'));

      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      expect(saveProjectDraft).toHaveBeenCalledTimes(1);

      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not warn before unload while the estimate is clean', () => {
    render(
      <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
        <TestConsumer />
      </EstimateProvider>,
    );

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('warns before unload once the estimate becomes dirty', () => {
    render(
      <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
        <TestConsumer />
      </EstimateProvider>,
    );

    fireEvent.click(screen.getByText('Set Client'));

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
