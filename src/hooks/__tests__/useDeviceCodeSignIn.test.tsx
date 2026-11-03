// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { HubUnreachableError } from '@/lib/hub-request';
import {
  useDeviceCodeSignIn,
  MAX_CONSECUTIVE_MISSES,
  type DeviceCodePoll,
  type DeviceCodeStart,
} from '../useDeviceCodeSignIn';

const START: DeviceCodeStart = {
  userCode: 'ABCD-EFGH',
  verificationUrl: 'https://example.test/activate',
  intervalMs: 5000,
  expiresInMs: 600_000,
};

const WORDS = { codeExpired: 'That code expired.', hubUnreachable: "Couldn't reach Home Screens." };

/** What each poll answers, in order; an Error is a poll that threw. Once empty, pending. */
let polls: (DeviceCodePoll | Error)[];
const poll = vi.fn(async (): Promise<DeviceCodePoll> => {
  const next = polls.shift() ?? { status: 'pending' };
  if (next instanceof Error) throw next;
  return next;
});
const start = vi.fn(async () => START);
const onConnected = vi.fn();

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

function mount() {
  return renderHook(() => useDeviceCodeSignIn({ start, poll, onConnected, words: WORDS }));
}

async function startSignIn() {
  const view = mount();
  await act(async () => { await view.result.current.start(); });
  return view;
}

beforeEach(() => {
  vi.useFakeTimers();
  polls = [];
  poll.mockClear();
  start.mockReset();
  start.mockResolvedValue(START);
  onConnected.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useDeviceCodeSignIn', () => {
  it('shows the code once the hub starts a flow and polls at the interval the hub named', async () => {
    const { result } = await startSignIn();

    expect(result.current.code).toEqual({ userCode: 'ABCD-EFGH', verificationUrl: 'https://example.test/activate' });
    expect(result.current.busy).toBe(true);
    await advance(4999);
    expect(poll).not.toHaveBeenCalled();
    await advance(1);
    expect(poll).toHaveBeenCalledTimes(1);
    await advance(5000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('clears the code and tells the surface once the sign-in connects', async () => {
    polls = [{ status: 'pending' }, { status: 'connected' }];
    const { result } = await startSignIn();

    await advance(10_000);

    expect(result.current.code).toBeNull();
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
    expect(onConnected).toHaveBeenCalledTimes(1);
    await advance(20_000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('stops with the surface\'s words when the sign-in ends without connecting', async () => {
    polls = [{ status: 'ended', message: 'Sign-in was cancelled' }];
    const { result } = await startSignIn();

    await advance(5000);

    expect(result.current.code).toBeNull();
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBe('Sign-in was cancelled');
    expect(onConnected).not.toHaveBeenCalled();
    await advance(20_000);
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it('keeps polling through a short run of polls that could not reach the hub', async () => {
    polls = [new HubUnreachableError(), new HubUnreachableError(), { status: 'connected' }];
    const { result } = await startSignIn();

    await advance(10_000);
    expect(result.current.code).not.toBeNull();
    expect(result.current.error).toBeNull();

    await advance(5000);
    expect(onConnected).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('gives up on the code only after the hub has gone quiet for the whole bounded run', async () => {
    polls = Array.from({ length: MAX_CONSECUTIVE_MISSES }, () => new HubUnreachableError());
    const { result } = await startSignIn();

    await advance(5000 * (MAX_CONSECUTIVE_MISSES - 1));
    expect(result.current.code).not.toBeNull();
    expect(result.current.error).toBeNull();

    await advance(5000);
    expect(result.current.code).toBeNull();
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBe(WORDS.hubUnreachable);
    await advance(20_000);
    expect(poll).toHaveBeenCalledTimes(MAX_CONSECUTIVE_MISSES);
  });

  it('counts misses in a row, so an answer in between starts the count over', async () => {
    polls = [
      ...Array.from({ length: MAX_CONSECUTIVE_MISSES - 1 }, () => new HubUnreachableError()),
      { status: 'pending' },
      ...Array.from({ length: MAX_CONSECUTIVE_MISSES - 1 }, () => new HubUnreachableError()),
      { status: 'connected' },
    ];
    const { result } = await startSignIn();

    await advance(5000 * (2 * MAX_CONSECUTIVE_MISSES));

    expect(result.current.error).toBeNull();
    expect(onConnected).toHaveBeenCalledTimes(1);
  });

  it('spaces polls five seconds further apart each time the provider asks to slow down', async () => {
    polls = [{ status: 'pending', slowDown: true }, { status: 'pending' }, { status: 'pending', slowDown: true }];
    await startSignIn();

    await advance(5000);
    expect(poll).toHaveBeenCalledTimes(1);
    await advance(9999);
    expect(poll).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(poll).toHaveBeenCalledTimes(2);
    await advance(10_000);
    expect(poll).toHaveBeenCalledTimes(3);
    await advance(14_999);
    expect(poll).toHaveBeenCalledTimes(3);
    await advance(1);
    expect(poll).toHaveBeenCalledTimes(4);
  });

  it('ends the sign-in itself when the code runs out, even with the hub silent', async () => {
    start.mockResolvedValue({ ...START, expiresInMs: 12_000 });
    polls = Array.from({ length: 3 }, () => new HubUnreachableError());
    const { result } = await startSignIn();

    await advance(15_000);

    expect(result.current.code).toBeNull();
    expect(result.current.error).toBe(WORDS.codeExpired);
  });

  it('cancel stops the polling and drops the code', async () => {
    const { result } = await startSignIn();

    act(() => result.current.cancel());

    expect(result.current.code).toBeNull();
    expect(result.current.busy).toBe(false);
    await advance(30_000);
    expect(poll).not.toHaveBeenCalled();
  });

  it('a cancel that lands while a poll is in flight discards that poll\'s answer', async () => {
    let release!: () => void;
    polls = [];
    poll.mockImplementationOnce(() => new Promise<DeviceCodePoll>((resolve) => {
      release = () => resolve({ status: 'connected' });
    }));
    const { result } = await startSignIn();
    await advance(5000);
    expect(poll).toHaveBeenCalledTimes(1);

    act(() => result.current.cancel());
    await act(async () => { release(); });

    expect(onConnected).not.toHaveBeenCalled();
    expect(result.current.code).toBeNull();
  });

  it('starting again replaces the earlier flow instead of running two', async () => {
    const { result } = await startSignIn();
    await advance(5000);
    expect(poll).toHaveBeenCalledTimes(1);

    start.mockResolvedValue({ ...START, userCode: 'WXYZ-1234' });
    await act(async () => { await result.current.start(); });

    expect(result.current.code?.userCode).toBe('WXYZ-1234');
    await advance(5000);
    // One poll for the new flow; the old one's timer never fired again.
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('shows the hub\'s refusal to start a flow in its own words, and ours when it could not be reached', async () => {
    start.mockRejectedValueOnce(new Error('Add the Client ID first.'));
    const { result } = mount();
    await act(async () => { await result.current.start(); });
    expect(result.current.error).toBe('Add the Client ID first.');
    expect(result.current.busy).toBe(false);
    expect(result.current.code).toBeNull();

    start.mockRejectedValueOnce(new HubUnreachableError());
    await act(async () => { await result.current.start(); });
    expect(result.current.error).toBe(WORDS.hubUnreachable);

    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it('stops polling when the surface unmounts', async () => {
    const view = await startSignIn();
    await advance(5000);
    expect(poll).toHaveBeenCalledTimes(1);

    view.unmount();
    await advance(30_000);

    expect(poll).toHaveBeenCalledTimes(1);
  });
});
