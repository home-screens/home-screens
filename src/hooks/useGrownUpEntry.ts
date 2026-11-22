'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GROWN_UP_CODE_LENGTH } from '@/lib/grown-up-code';
import { setUnlock } from '@/lib/grown-up-client';

/** How long a wrong code stays red before the dots empty for another go. */
export const GROWN_UP_WRONG_SHOWN_MS = 900;

export type GrownUpEntryState =
  | { kind: 'typing' }
  | { kind: 'checking' }
  | { kind: 'wrong' }
  | { kind: 'waiting'; secondsLeft: number }
  | { kind: 'offline' };

/** The keys of a grown-up code pad, in reading order; '' is the blank under 7, 'del' takes a digit back. */
export const GROWN_UP_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;
export type GrownUpKey = (typeof GROWN_UP_KEYS)[number];

/**
 * Typing a grown-up code, the same on the wall and the phone: digits in, the
 * last one sends it to the hub, a right code stores the unlock and calls
 * `onUnlocked`, a wrong one shows red for a moment and empties, and too many
 * wrong ones rest the keys until the hub's wait is over. Only the pads'
 * looks differ.
 */
export function useGrownUpEntry(fetcher: (url: string, init?: RequestInit) => Promise<Response>, onUnlocked: () => void) {
  const [digits, setDigits] = useState('');
  const [state, setState] = useState<GrownUpEntryState>({ kind: 'typing' });
  const until = useRef(0);
  const wrongTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (wrongTimer.current) clearTimeout(wrongTimer.current); }, []);

  const waiting = state.kind === 'waiting';
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => {
      const left = Math.ceil((until.current - Date.now()) / 1000);
      setState(left > 0 ? { kind: 'waiting', secondsLeft: left } : { kind: 'typing' });
    }, 500);
    return () => clearInterval(id);
  }, [waiting]);

  const send = useCallback(async (code: string) => {
    setState({ kind: 'checking' });
    try {
      const res = await fetcher('/api/grown-up-code/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const body = await res.json().catch(() => null) as { token?: string; expiresAt?: number; retryAfterSeconds?: number } | null;
      if (res.ok && body?.token && body.expiresAt) {
        setUnlock({ token: body.token, expiresAt: body.expiresAt });
        onUnlocked();
        return;
      }
      // No code on the hub after all (removed a moment ago): nothing to unlock.
      if (res.status === 409) {
        onUnlocked();
        return;
      }
      if (res.status === 429) {
        const seconds = Math.max(1, body?.retryAfterSeconds ?? 60);
        until.current = Date.now() + seconds * 1000;
        setDigits('');
        setState({ kind: 'waiting', secondsLeft: seconds });
        return;
      }
      setState({ kind: 'wrong' });
      wrongTimer.current = setTimeout(() => {
        setDigits('');
        setState((current) => (current.kind === 'wrong' ? { kind: 'typing' } : current));
      }, GROWN_UP_WRONG_SHOWN_MS);
    } catch {
      setDigits('');
      setState({ kind: 'offline' });
    }
  }, [fetcher, onUnlocked]);

  const press = useCallback((key: GrownUpKey) => {
    if (state.kind === 'checking' || state.kind === 'waiting' || state.kind === 'wrong') return;
    if (key === 'del') {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    if (!key) return;
    const next = (digits + key).slice(0, GROWN_UP_CODE_LENGTH);
    setDigits(next);
    if (state.kind === 'offline') setState({ kind: 'typing' });
    if (next.length === GROWN_UP_CODE_LENGTH) void send(next);
  }, [digits, state.kind, send]);

  return { digits, state, press };
}
