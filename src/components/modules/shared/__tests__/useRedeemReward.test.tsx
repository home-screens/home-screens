// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import deDEModules from '@/translations/de-DE/modules.json';
import type { FamilyMember } from '@/types/family';
import type { RewardDefinition } from '@/lib/reward-data';

/**
 * What the wall says when the hub refuses. The full-screen store and the
 * card's store draw the sheet differently, but the words come from here, and
 * they must be the wall's own in its own language: the hub's `error` is
 * developer English ("Insufficient point balance") and never shown to a kid.
 */

let answers: Response[] = [];
const displayFetch = vi.fn(async () => {
  const next = answers.shift();
  if (!next) throw new TypeError('Load failed');
  return next;
});
vi.mock('@/lib/display-fetch', () => ({ displayFetch: (...args: unknown[]) => displayFetch(...(args as [])) }));

const { useRedeemReward } = await import('../useRedeemReward');

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const stamp = '2026-01-01T00:00:00.000Z';
const ada: FamilyMember = { id: 'kid-1', name: 'Ada', emoji: '', color: '#8b5cf6', createdAt: stamp, updatedAt: stamp };
const movie = { id: 'r-1', name: 'Movie night', cost: 10, enabled: true, memberIds: [] } as unknown as RewardDefinition;

function wrapper(locale: 'en-US' | 'de-DE') {
  const blob = { modules: locale === 'de-DE' ? deDEModules : enUSModules };
  return function Wrapper({ children }: { children: ReactNode }) {
    return <I18nProvider locale={locale} blob={blob}>{children}</I18nProvider>;
  };
}

function setup(locale: 'en-US' | 'de-DE' = 'en-US') {
  const onRedeemed = vi.fn();
  const hook = renderHook(() => useRedeemReward({ enabled: true, onRedeemed }), { wrapper: wrapper(locale) });
  return { ...hook, onRedeemed };
}

async function askAndConfirm(hook: ReturnType<typeof setup>, balance?: number) {
  act(() => hook.result.current.ask(movie, ada, balance));
  await act(async () => { await hook.result.current.confirm(); });
}

beforeEach(() => { answers = []; displayFetch.mockClear(); });
afterEach(cleanup);

describe('useRedeemReward refusals', () => {
  it('never shows the hub\'s English for a switched-off, not-yours or removed-person refusal', async () => {
    for (const [status, line] of [
      [404, "That reward isn't on offer any more."],
      [403, "That reward isn't on offer any more."],
      [409, "That person isn't in the family any more."],
      [500, 'Something went wrong'],
    ] as const) {
      answers = [json(status, { error: 'Insufficient point balance / Reward not found or disabled' })];
      const hook = setup();
      await askAndConfirm(hook, 12);
      expect(hook.result.current.error).toBe(line);
      expect(hook.result.current.pending).not.toBeNull();
      expect(hook.onRedeemed).not.toHaveBeenCalled();
      hook.unmount();
    }
  });

  it('says "not enough tickets" for a 400, after asking the hub whether the kid already got it', async () => {
    answers = [json(400, { error: 'Insufficient point balance' }), json(200, { rewards: [], balances: {}, redemptions: [] })];
    const hook = setup();
    await askAndConfirm(hook, 12);
    expect(hook.result.current.error).toBe('Not enough tickets for that any more.');
    expect(displayFetch).toHaveBeenCalledTimes(2);
  });

  it('says "you already got it" when this reward was just redeemed for this kid from another screen', async () => {
    const recent = { id: 'x', rewardId: 'r-1', rewardName: 'Movie night', memberId: 'kid-1', memberName: 'Ada', cost: 10, redeemedAt: new Date(Date.now() - 5_000).toISOString() };
    answers = [json(400, { error: 'Insufficient point balance' }), json(200, { rewards: [], balances: {}, redemptions: [recent] })];
    const hook = setup();
    await askAndConfirm(hook, 12);
    expect(hook.result.current.error).toBe('You already got Movie night a moment ago!');
  });

  it('takes the hub numbers when the tickets moved, keeps the sheet up and quotes the new balance on a second Yes', async () => {
    const numbers = { balances: { 'kid-1': 4 }, redemptions: [], goals: {} };
    answers = [json(409, { error: 'The tickets changed since this was opened.', reason: 'balance', ...numbers }), json(200, { balances: { 'kid-1': 0 }, redemptions: [], goals: {} })];
    const hook = setup();
    await askAndConfirm(hook, 12);
    expect(hook.result.current.error).toBe('The tickets changed just now. Have another look.');
    expect(hook.onRedeemed).toHaveBeenCalledWith(numbers);
    expect(hook.result.current.pending?.balance).toBe(4);

    await act(async () => { await hook.result.current.confirm(); });
    const secondBody = JSON.parse((displayFetch.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(secondBody.expectedBalance).toBe(4);
    expect(hook.result.current.redeemed).toEqual({ memberName: 'Ada', rewardName: 'Movie night', cost: 10 });
    expect(hook.result.current.pending).toBeNull();
  });

  it('speaks the wall\'s language', async () => {
    answers = [json(404, { error: 'Reward not found or disabled' })];
    const hook = setup('de-DE');
    await askAndConfirm(hook, 12);
    expect(hook.result.current.error).toBe('Diese Belohnung gibt es nicht mehr.');
  });

  it('says "could not connect" when the hub cannot be reached', async () => {
    answers = [];
    const hook = setup();
    await askAndConfirm(hook, 12);
    expect(hook.result.current.error).toBe('Could not connect');
  });
});
