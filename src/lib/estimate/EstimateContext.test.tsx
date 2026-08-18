// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EstimateProvider, useEstimate, buildBlankDraft, normalizeDraft, type PersistedDraft } from './EstimateContext';
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
      {/* Swallows the rejection so a deliberately-failing flushSave() in a test doesn't surface
          as an unhandled promise rejection — the test asserts on saveProjectDraft call counts
          and the beforeunload/isDirty side effects instead. */}
      <button onClick={() => { flushSave().catch(() => {}); }}>Flush (ignore errors)</button>
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

  // Advances the real microtask queue several rounds, independent of vi.useFakeTimers() (which
  // only fakes macrotasks like setTimeout — native Promise resolution still runs on the real
  // microtask queue). Used below to let a resolved/rejected mocked save's .then/.catch/.finally
  // chain fully settle before asserting on its effects.
  async function flushMicrotasks(rounds = 10) {
    for (let i = 0; i < rounds; i++) {
      await Promise.resolve();
    }
  }

  it('does not mark the draft as saved when the debounced autosave fails, and leaves it retryable', async () => {
    vi.useFakeTimers();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      vi.mocked(saveProjectDraft).mockRejectedValueOnce(new Error('network error'));

      render(
        <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
          <TestConsumer />
        </EstimateProvider>,
      );

      fireEvent.click(screen.getByText('Set Client'));

      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      await act(() => flushMicrotasks());

      expect(saveProjectDraft).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Autosave failed:', expect.any(Error));

      // The failed save must never be treated as successful: isDirty stays true.
      const firstEvent = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(firstEvent);
      expect(firstEvent.defaultPrevented).toBe(true);

      // A later flushSave() retries the same still-pending draft and this time succeeds.
      vi.mocked(saveProjectDraft).mockResolvedValueOnce(undefined);
      await act(async () => {
        fireEvent.click(screen.getByText('Flush (ignore errors)'));
      });

      expect(saveProjectDraft).toHaveBeenCalledTimes(2);
      const secondEvent = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(secondEvent);
      expect(secondEvent.defaultPrevented).toBe(false);
    } finally {
      vi.useRealTimers();
      consoleErrorSpy.mockRestore();
    }
  });

  it('propagates a flushSave() failure to the caller instead of swallowing it, while keeping the draft pending', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      vi.mocked(saveProjectDraft).mockRejectedValueOnce(new Error('db unreachable'));

      render(
        <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
          <TestConsumer />
        </EstimateProvider>,
      );

      fireEvent.click(screen.getByText('Set Client'));

      await act(async () => {
        fireEvent.click(screen.getByText('Flush (ignore errors)'));
        await flushMicrotasks();
      });

      expect(saveProjectDraft).toHaveBeenCalledTimes(1);
      const midEvent = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(midEvent);
      expect(midEvent.defaultPrevented).toBe(true); // still dirty — the failure wasn't treated as a save

      // Retrying (a plain flushSave(), no error swallowing needed this time) succeeds.
      vi.mocked(saveProjectDraft).mockResolvedValueOnce(undefined);
      await act(async () => {
        fireEvent.click(screen.getByText('Flush'));
      });

      expect(saveProjectDraft).toHaveBeenCalledTimes(2);
      const finalEvent = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(finalEvent);
      expect(finalEvent.defaultPrevented).toBe(false);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('sends a beacon with the pending draft on pagehide, before the debounce has a chance to fire', () => {
    // Regression test for real data loss on production: a hard page unload (tab close, browser
    // Back/Forward, typing a new URL, refresh) kills the JS runtime immediately, aborting any
    // in-flight or not-yet-started fetch (including a Server Action call) before it completes —
    // so a pending edit within the ~500ms debounce window was silently lost even though a
    // beforeunload warning appeared. sendBeacon is the browser-standard way to survive this.
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon });
    try {
      render(
        <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
          <TestConsumer />
        </EstimateProvider>,
      );

      fireEvent.click(screen.getByText('Set Client'));
      expect(saveProjectDraft).not.toHaveBeenCalled(); // still within the debounce window

      window.dispatchEvent(new Event('pagehide'));

      expect(sendBeacon).toHaveBeenCalledTimes(1);
      const [url, blob] = sendBeacon.mock.calls[0]!;
      expect(url).toBe('/api/projects/proj-1/draft');
      expect(blob).toBeInstanceOf(Blob);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not send a beacon on pagehide when there is nothing pending', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon });
    try {
      render(
        <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
          <TestConsumer />
        </EstimateProvider>,
      );

      window.dispatchEvent(new Event('pagehide'));

      expect(sendBeacon).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('flushSave awaits an already in-flight (timer-driven) save instead of firing a duplicate', async () => {
    vi.useFakeTimers();
    try {
      let resolveSave: (() => void) | undefined;
      vi.mocked(saveProjectDraft).mockImplementationOnce(
        () => new Promise<void>((resolve) => { resolveSave = resolve; }),
      );

      render(
        <EstimateProvider projectId="proj-1" referenceData={referenceData} estimateDefaults={estimateDefaults} initialDraft={null}>
          <TestConsumer />
        </EstimateProvider>,
      );

      fireEvent.click(screen.getByText('Set Client'));
      await act(async () => {
        vi.advanceTimersByTime(500); // the debounce timer fires; the mocked save is now in flight and unresolved
      });
      expect(saveProjectDraft).toHaveBeenCalledTimes(1);

      // flushSave() is called while that save is still in flight. It must await it rather than
      // starting a second, overlapping save of the same draft.
      fireEvent.click(screen.getByText('Flush'));

      resolveSave!();
      await act(() => flushMicrotasks());

      expect(saveProjectDraft).toHaveBeenCalledTimes(1);
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('buildBlankDraft / normalizeDraft', () => {
  it('normalizeDraft returns the standard blank draft when there is nothing persisted yet', () => {
    expect(normalizeDraft(null, estimateDefaults)).toEqual(buildBlankDraft(estimateDefaults));
    expect(normalizeDraft(undefined, estimateDefaults)).toEqual(buildBlankDraft(estimateDefaults));
  });

  it('fills in missing top-level and nested fields from the blank-draft defaults', () => {
    const loaded = {
      coverInfo: { client: 'Acme Corp' }, // missing every other CoverInfo field
      materials: [{ key: 'bom-3', quantity: 5 }],
      // contingencyPct, shippingHandling, loeTasks, sowTasks, technicianCount, passThroughs,
      // markups are all entirely absent, simulating an older/renamed draft shape.
    };

    const normalized = normalizeDraft(loaded, estimateDefaults);
    const blank = buildBlankDraft(estimateDefaults);

    expect(normalized.coverInfo).toEqual({ ...blank.coverInfo, client: 'Acme Corp' });
    expect(normalized.materials).toEqual([{ key: 'bom-3', quantity: 5 }]);
    expect(normalized.contingencyPct).toBe(blank.contingencyPct);
    expect(normalized.loeTasks).toEqual([]);
    expect(normalized.sowTasks).toEqual([]);
    expect(normalized.technicianCount).toBe(blank.technicianCount);
    expect(normalized.passThroughs).toEqual(blank.passThroughs);
    expect(normalized.markups).toEqual(blank.markups);
  });

  it('overrides (not merges) array-valued passThrough fields that are present, and defaults the rest', () => {
    const loaded = {
      passThroughs: {
        lodging: [{ role: 'Technician', nights: 3 }],
        // perDiem, travel, airfare, rentals, softCosts absent — should default to [].
      },
    };

    const normalized = normalizeDraft(loaded, estimateDefaults);

    expect(normalized.passThroughs.lodging).toEqual([{ role: 'Technician', nights: 3 }]);
    expect(normalized.passThroughs.perDiem).toEqual([]);
    expect(normalized.passThroughs.travel).toEqual([]);
    expect(normalized.passThroughs.airfare).toEqual([]);
    expect(normalized.passThroughs.rentals).toEqual([]);
    expect(normalized.passThroughs.softCosts).toEqual([]);
  });

  it('preserves a fully-populated draft unchanged', () => {
    const full: PersistedDraft = {
      coverInfo: {
        client: 'Restored Corp', project: 'P', rfpDate: '', bidDueDate: '', estimator: '',
        contactName: '', contactPhone: '', contactEmail: '', customerType: '',
        jobSiteAddress: '', projectOverview: '',
      },
      materials: [{ key: 'bom-3', quantity: 3 }],
      contingencyPct: 0.15,
      shippingHandling: 250,
      loeTasks: [],
      sowTasks: [],
      technicianCount: 6,
      passThroughs: { perDiem: [], lodging: [], travel: [], airfare: [], rentals: [], softCosts: [] },
      markups: {
        laborMarkupPct: 0.3, passThroughMarkupPct: 0.3, materialMarkupPct: 0.3,
        corporateMarkupPct: 0.05, marginTweak: 100, taxRate: 0.0825,
      },
    };

    expect(normalizeDraft(full, estimateDefaults)).toEqual(full);
  });
});
