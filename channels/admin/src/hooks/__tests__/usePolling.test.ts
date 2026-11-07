import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePolling } from '../usePolling';

// We test usePolling's error-handling logic by mocking React's hooks.
// This avoids needing jsdom or @testing-library/react for the admin tests.
//
// The mock useState returns [initialValue, mockSetter] so we can inspect
// what values were "set" during error handling. useCallback passes through
// so refresh() is the actual function body with try/catch.

type StateSetter = (val: unknown) => void;
const stateSetters: StateSetter[] = [];
let useStateIndex = 0;

vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...(actual as object),
    useState: vi.fn().mockImplementation((initial: unknown) => {
      const setter = vi.fn() as StateSetter;
      stateSetters.push(setter);
      return [initial, setter];
    }),
    useEffect: vi.fn().mockImplementation((fn: () => unknown) => {
      // Call the effect immediately so we can test it synchronously
      // But skip cleanup functions (don't call their return value)
      const cleanup = fn();
      if (typeof cleanup === 'function') return;
    }),
    useCallback: vi.fn().mockImplementation((fn: () => unknown) => fn),
    useRef: vi.fn().mockImplementation((initial: unknown) => ({ current: initial })),
  };
});

describe('usePolling error handling', () => {
  beforeEach(() => {
    stateSetters.length = 0;
    useStateIndex = 0;
    // clearAllMocks resets call history but keeps the hook implementations
    // installed by vi.mock — restoreAllMocks would strip them.
    vi.clearAllMocks();
  });

  it('wraps non-Error thrown values in Error', async () => {
    const fetchFn = vi.fn().mockRejectedValue('string failure');
    usePolling(fetchFn, 0);
    // Wait for the immediate refresh() promise to settle
    await new Promise((r) => setTimeout(r, 0));

    const errorSetter = stateSetters[2];
    const errorCall = errorSetter.mock?.calls.find(([val]) => val instanceof Error);
    expect(errorCall?.[0]).toBeInstanceOf(Error);
    expect((errorCall?.[0] as Error).message).toBe('Unknown error in usePolling');
  });

  it('passes through Error objects unchanged', async () => {
    const fetchError = new Error('network down');
    const fetchFn = vi.fn().mockRejectedValue(fetchError);
    usePolling(fetchFn, 0);
    await new Promise((r) => setTimeout(r, 0));

    const errorSetter = stateSetters[2];
    const errorCall = errorSetter.mock?.calls.find(([val]) => val === fetchError);
    expect(errorCall?.[0]).toBe(fetchError);
  });

  it('logs errors to console for debugging', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = vi.fn().mockRejectedValue(new Error('test'));
    usePolling(fetchFn, 0);
    await new Promise((r) => setTimeout(r, 0));

    expect(consoleSpy).toHaveBeenCalledWith(
      '[usePolling] Fetch failed:',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});
