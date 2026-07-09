/**
 * Unit tests for use-back-to-close.ts
 *
 * This is a browser-history hook (pushState/popstate), NOT a data-fetching
 * hook. It makes the browser Back button close an in-app overlay by pushing a
 * dummy same-URL history entry while `active` is true and popping it when the
 * overlay is closed by other means.
 */

import { renderHook, act } from '@testing-library/react';
import { useBackToClose } from '../use-back-to-close';

describe('useBackToClose', () => {
  let pushStateSpy: jest.SpyInstance;
  let backSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset history state so a leftover { backClose: true } from a previous
    // test does not leak into the next one.
    window.history.replaceState(null, '');
    // pushState keeps its real implementation (so window.history.state is
    // actually updated), we only observe the calls.
    pushStateSpy = jest.spyOn(window.history, 'pushState');
    // back() is stubbed to a no-op so jsdom does not attempt real navigation.
    backSpy = jest.spyOn(window.history, 'back').mockImplementation(() => {});
  });

  afterEach(() => {
    pushStateSpy.mockRestore();
    backSpy.mockRestore();
    window.history.replaceState(null, '');
  });

  it('pushes a dummy history entry when opened', () => {
    const onClose = jest.fn();
    renderHook(({ active }) => useBackToClose(active, onClose), {
      initialProps: { active: true },
    });

    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(pushStateSpy).toHaveBeenCalledWith({ backClose: true }, '');
    expect(window.history.state).toEqual({ backClose: true });
  });

  it('does nothing when it is not open (no-op branch)', () => {
    const onClose = jest.fn();
    renderHook(({ active }) => useBackToClose(active, onClose), {
      initialProps: { active: false },
    });

    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(backSpy).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when the browser Back button fires popstate while open', () => {
    const onClose = jest.fn();
    renderHook(({ active }) => useBackToClose(active, onClose), {
      initialProps: { active: true },
    });

    expect(pushStateSpy).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on popstate when nothing was pushed', () => {
    const onClose = jest.fn();
    renderHook(({ active }) => useBackToClose(active, onClose), {
      initialProps: { active: false },
    });

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('only fires onClose once even if popstate fires again after closing', () => {
    const onClose = jest.fn();
    renderHook(({ active }) => useBackToClose(active, onClose), {
      initialProps: { active: true },
    });

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    // pushedRef is now false, a second popstate should be a no-op.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pops the dummy entry when closed by other means (active -> false)', () => {
    const onClose = jest.fn();
    const { rerender } = renderHook(({ active }) => useBackToClose(active, onClose), {
      initialProps: { active: true },
    });

    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(window.history.state).toEqual({ backClose: true });

    rerender({ active: false });

    // Should have popped our dummy entry, without calling onClose (it was not
    // closed via Back).
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not pop when closing if our dummy entry is no longer current', () => {
    const onClose = jest.fn();
    const { rerender } = renderHook(({ active }) => useBackToClose(active, onClose), {
      initialProps: { active: true },
    });

    // Simulate a real navigation pushing a different state on top of ours.
    window.history.replaceState({ someRealNav: true }, '');

    rerender({ active: false });

    // Our entry is no longer current, so we must not undo the real navigation.
    expect(backSpy).not.toHaveBeenCalled();
  });

  it('pops the dummy entry on unmount while still open', () => {
    const onClose = jest.fn();
    const { unmount } = renderHook(({ active }) => useBackToClose(active, onClose), {
      initialProps: { active: true },
    });

    expect(window.history.state).toEqual({ backClose: true });

    unmount();

    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it('does not pop on unmount when it was never opened', () => {
    const onClose = jest.fn();
    const { unmount } = renderHook(({ active }) => useBackToClose(active, onClose), {
      initialProps: { active: false },
    });

    unmount();

    expect(backSpy).not.toHaveBeenCalled();
  });

  it('uses the latest onClose reference (ref is kept in sync)', () => {
    const firstOnClose = jest.fn();
    const secondOnClose = jest.fn();

    const { rerender } = renderHook(({ onClose }) => useBackToClose(true, onClose), {
      initialProps: { onClose: firstOnClose },
    });

    // Swap the callback without changing `active`.
    rerender({ onClose: secondOnClose });

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(firstOnClose).not.toHaveBeenCalled();
    expect(secondOnClose).toHaveBeenCalledTimes(1);
  });
});
