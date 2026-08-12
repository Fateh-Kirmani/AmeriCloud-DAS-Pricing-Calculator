// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Sidebar } from './Sidebar';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/project/proj-1',
}));

const flushSaveMock = vi.fn();
vi.mock('@/lib/estimate/EstimateContext', () => ({
  useEstimate: () => ({ projectId: 'proj-1', flushSave: flushSaveMock }),
}));

describe('Sidebar', () => {
  beforeEach(() => {
    pushMock.mockClear();
    flushSaveMock.mockReset();
    // jsdom doesn't implement matchMedia; Sidebar's auto-collapse-on-narrow-viewport effect
    // calls it on mount, so it needs a minimal stub for the component to render at all.
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it('flushes the pending draft then navigates to /projects', async () => {
    flushSaveMock.mockResolvedValue(undefined);
    render(<Sidebar />);

    await act(async () => {
      fireEvent.click(screen.getByText('All Projects'));
    });

    expect(flushSaveMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith('/projects');
  });

  it('still navigates to /projects when flushSave() rejects, logging the failure instead of trapping the user', async () => {
    // Regression test: a rejected flushSave() used to be an unhandled rejection that stopped
    // router.push from ever running, so the "All Projects" click appeared to do nothing.
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    flushSaveMock.mockRejectedValue(new Error('save failed'));
    render(<Sidebar />);

    await act(async () => {
      fireEvent.click(screen.getByText('All Projects'));
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to save before navigating:', expect.any(Error));
    expect(pushMock).toHaveBeenCalledWith('/projects');

    consoleErrorSpy.mockRestore();
  });
});
