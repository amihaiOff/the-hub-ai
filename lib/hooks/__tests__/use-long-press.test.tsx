/**
 * Unit tests for use-long-press.ts
 * Tests press-and-hold gesture detection with fake timers.
 */

import { renderHook, act } from '@testing-library/react';
import { useLongPress } from '../use-long-press';

// Minimal pointer-event stand-in: the hook only reads button/clientX/clientY.
function pointer(overrides: Partial<{ button: number; clientX: number; clientY: number }> = {}) {
  return {
    button: 0,
    clientX: 0,
    clientY: 0,
    preventDefault: jest.fn(),
    ...overrides,
  } as unknown as React.PointerEvent;
}

describe('useLongPress', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('fires onLongPress after the delay and consumedClick() returns true once', () => {
    const onLongPress = jest.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 450 }));

    act(() => {
      result.current.handlers.onPointerDown(pointer());
    });

    expect(onLongPress).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(450);
    });

    expect(onLongPress).toHaveBeenCalledTimes(1);
    // consumedClick reports the long press exactly once, then resets.
    expect(result.current.consumedClick()).toBe(true);
    expect(result.current.consumedClick()).toBe(false);
  });

  it('cancels when the pointer moves beyond tolerance before the delay', () => {
    const onLongPress = jest.fn();
    const { result } = renderHook(() =>
      useLongPress(onLongPress, { delay: 450, moveTolerance: 10 })
    );

    act(() => {
      result.current.handlers.onPointerDown(pointer({ clientX: 0, clientY: 0 }));
      // Move 20px on the x-axis, beyond the 10px tolerance.
      result.current.handlers.onPointerMove(pointer({ clientX: 20, clientY: 0 }));
    });

    act(() => {
      jest.advanceTimersByTime(450);
    });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(result.current.consumedClick()).toBe(false);
  });

  it('does not cancel for movement within tolerance', () => {
    const onLongPress = jest.fn();
    const { result } = renderHook(() =>
      useLongPress(onLongPress, { delay: 450, moveTolerance: 10 })
    );

    act(() => {
      result.current.handlers.onPointerDown(pointer({ clientX: 0, clientY: 0 }));
      // Move only 5px — within tolerance, should NOT cancel.
      result.current.handlers.onPointerMove(pointer({ clientX: 5, clientY: 5 }));
    });

    act(() => {
      jest.advanceTimersByTime(450);
    });

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('cancels on onPointerUp before the delay', () => {
    const onLongPress = jest.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 450 }));

    act(() => {
      result.current.handlers.onPointerDown(pointer());
    });

    act(() => {
      jest.advanceTimersByTime(200);
      result.current.handlers.onPointerUp(pointer());
    });

    act(() => {
      jest.advanceTimersByTime(450);
    });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(result.current.consumedClick()).toBe(false);
  });

  it('cancels on onPointerLeave before the delay', () => {
    const onLongPress = jest.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 450 }));

    act(() => {
      result.current.handlers.onPointerDown(pointer());
    });

    act(() => {
      jest.advanceTimersByTime(200);
      result.current.handlers.onPointerLeave(pointer());
    });

    act(() => {
      jest.advanceTimersByTime(450);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('does nothing for a non-primary button (button !== 0)', () => {
    const onLongPress = jest.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 450 }));

    act(() => {
      result.current.handlers.onPointerDown(pointer({ button: 2 }));
    });

    act(() => {
      jest.advanceTimersByTime(450);
    });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(result.current.consumedClick()).toBe(false);
  });

  it('onContextMenu prevents the default browser menu', () => {
    const onLongPress = jest.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 450 }));

    const e = pointer() as unknown as React.MouseEvent & { preventDefault: jest.Mock };
    act(() => {
      result.current.handlers.onContextMenu(e);
    });

    expect(e.preventDefault as jest.Mock).toHaveBeenCalled();
  });

  it('uses the default delay of 450ms when no options are given', () => {
    const onLongPress = jest.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => {
      result.current.handlers.onPointerDown(pointer());
    });

    act(() => {
      jest.advanceTimersByTime(449);
    });
    expect(onLongPress).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});
