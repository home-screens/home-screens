import { describe, it, expect } from 'vitest';
import type { RewardAdjustment, RewardRedemption } from '../reward-data';
import type { ChoreCompletion, ChoreDefinition } from '@/types/config';
import { buildTicketLedger, groupRedemptionsByDay, groupTicketLedgerByDay, summarizeRedemptions, summarizeTicketLedger } from '../reward-history';

// Local time throughout: the wall reads "yesterday" off its own clock.
const now = new Date(2026, 8, 20, 7, 0);
const at = (daysBack: number, hour = 12) => new Date(2026, 8, 20 - daysBack, hour).toISOString();

const redemption = (id: string, redeemedAt: string, rewardName = 'Candy', cost = 4): RewardRedemption =>
  ({ id, rewardId: `r-${rewardName}`, rewardName, memberId: 'kid-1', memberName: 'Kid', cost, redeemedAt });

describe('groupRedemptionsByDay', () => {
  it('splits by calendar day, newest first, and leaves out empty groups', () => {
    const groups = groupRedemptionsByDay([
      redemption('week', at(3)),
      redemption('today-early', at(0, 1)),
      redemption('today-late', at(0, 6)),
      redemption('old', at(12)),
    ], now);
    expect(groups.map((g) => [g.bucket, g.redemptions.map((r) => r.id)])).toEqual([
      ['today', ['today-late', 'today-early']],
      ['thisWeek', ['week']],
      ['earlier', ['old']],
    ]);
  });

  it('calls last night yesterday even when it was under a day ago', () => {
    const [group] = groupRedemptionsByDay([redemption('night', at(1, 21))], now);
    expect(group.bucket).toBe('yesterday');
  });

  it('draws the week line at seven days', () => {
    const groups = groupRedemptionsByDay([redemption('six', at(6)), redemption('seven', at(7))], now);
    expect(groups.map((g) => g.bucket)).toEqual(['thisWeek', 'earlier']);
  });

  it('keeps a row it cannot date, and one from a fast clock, where they can be seen', () => {
    const groups = groupRedemptionsByDay([redemption('bad', 'not a date'), redemption('future', at(-2))], now);
    expect(groups.map((g) => [g.bucket, g.redemptions.map((r) => r.id)])).toEqual([
      ['today', ['future']],
      ['earlier', ['bad']],
    ]);
  });
});

describe('summarizeRedemptions', () => {
  it('adds up the last thirty days and names the favorite', () => {
    const summary = summarizeRedemptions([
      redemption('1', at(1), 'Candy', 4),
      redemption('2', at(2), 'Stay Up Late', 12),
      redemption('3', at(9), 'Stay Up Late', 12),
      redemption('4', at(45), 'New Book', 20),
    ], now);
    expect(summary).toEqual({ ticketsSpent: 28, count: 3, favorite: { rewardName: 'Stay Up Late', count: 2 } });
  });

  it('gives a tie to the reward redeemed most recently', () => {
    const summary = summarizeRedemptions([redemption('1', at(5), 'Candy'), redemption('2', at(1), 'New Book')], now);
    expect(summary.favorite).toEqual({ rewardName: 'New Book', count: 1 });
  });

  it('has no favorite when nothing was redeemed', () => {
    expect(summarizeRedemptions([], now)).toEqual({ ticketsSpent: 0, count: 0, favorite: null });
  });
});

// The wall's days are the household's, whatever zone the Pi's clock is on.
describe('in the household zone', () => {
  const CHICAGO = 'America/Chicago';

  it('keeps an evening redemption under today once UTC has rolled over', () => {
    // Redeemed Tuesday 6 PM Chicago, read at 8 PM: UTC is already Wednesday.
    const [group] = groupRedemptionsByDay(
      [redemption('treat', '2026-09-22T23:00:00Z')],
      new Date('2026-09-23T01:00:00Z'),
      CHICAGO,
    );
    expect(group.bucket).toBe('today');
  });

  it('calls last night yesterday when both instants share a UTC day', () => {
    // Redeemed Monday 8 PM Chicago (01:00Z Tuesday), read Tuesday 6 PM (23:00Z).
    const [group] = groupRedemptionsByDay(
      [redemption('treat', '2026-09-22T01:00:00Z')],
      new Date('2026-09-22T23:00:00Z'),
      CHICAGO,
    );
    expect(group.bucket).toBe('yesterday');
  });

  it('draws the thirty-day window on household days', () => {
    // 29 household days back at 8 PM Chicago is 30 UTC days back.
    const now = new Date('2026-09-23T01:00:00Z');
    const summary = summarizeRedemptions([redemption('edge', '2026-08-24T12:00:00Z')], now, 30, CHICAGO);
    expect(summary.count).toBe(1);
  });
});

describe('the ticket ledger', () => {
  const chores: ChoreDefinition[] = [
    { id: 'bed', name: 'Make your bed', emoji: '', points: 1, frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'morning', assigneeIds: ['kid-1'], rotation: 'fixed' },
    { id: 'car', name: 'Wash the car', emoji: '', points: 3, frequency: 'daily', daysOfWeek: [6], timeOfDay: 'anytime', assigneeIds: ['kid-1'], rotation: 'fixed', bonus: { claim: 'first', comesBack: 'weekly' } },
    { id: 'free', name: 'Smile', emoji: '', points: 0, frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: ['kid-1'], rotation: 'fixed' },
  ];
  const day = (daysBack: number) => `2026-09-${String(20 - daysBack).padStart(2, '0')}`;
  const completions: ChoreCompletion[] = [
    { choreId: 'bed', memberId: 'kid-1', date: day(0), at: at(0, 8) },
    { choreId: 'bed', memberId: 'kid-2', date: day(0), at: at(0, 8) },
    { choreId: 'bed', memberId: 'kid-1', date: day(1), status: 'skipped' },
    { choreId: 'car', memberId: 'kid-1', date: day(3), at: at(3, 15) },
    { choreId: 'free', memberId: 'kid-1', date: day(0), at: at(0, 9) },
    // Saved before timestamps were recorded, of a chore since removed.
    { choreId: 'gone', memberId: 'kid-1', date: day(4) },
  ];
  const adjustments: RewardAdjustment[] = [
    { id: 'a1', memberId: 'kid-1', delta: 5, reason: 'Helped carry the groceries', at: at(0, 5) },
    { id: 'a2', memberId: 'kid-1', delta: -1, at: at(1, 18) },
    { id: 'a3', memberId: 'kid-2', delta: 2, at: at(0, 5) },
  ];
  const redemptions = [redemption('lego', at(1, 17), 'Lego set', 10), { ...redemption('other', at(0, 10)), memberId: 'kid-2' }];

  it('merges one person\'s chores, rewards and adjustments newest first, skipping what moved nothing', () => {
    const rows = buildTicketLedger({ memberId: 'kid-1', completions, chores, redemptions, adjustments });
    expect(rows.map((r) => [r.id, r.kind, r.delta, r.title, r.date])).toEqual([
      ['earned:bed:2026-09-20', 'earned', 1, 'Make your bed', day(0)],
      ['adjusted:a1', 'adjusted', 5, 'Helped carry the groceries', day(0)],
      ['adjusted:a2', 'adjusted', -1, null, day(1)],
      ['spent:lego', 'spent', -10, 'Lego set', day(1)],
      ['earned:car:2026-09-17', 'earned', 3, 'Wash the car', day(3)],
      ['earned:gone:2026-09-16', 'earned', null, null, day(4)],
    ]);
    expect(rows.find((r) => r.id === 'earned:car:2026-09-17')?.bonus).toBe(true);
    expect(rows.find((r) => r.id === 'earned:bed:2026-09-20')?.bonus).toBeUndefined();
  });

  it('sums the last thirty days, with the removed chore counting nothing', () => {
    const rows = buildTicketLedger({ memberId: 'kid-1', completions, chores, redemptions, adjustments });
    expect(summarizeTicketLedger(rows, now)).toEqual({ earned: 4, spent: 10, adjusted: 4 });
    expect(summarizeTicketLedger(rows, now, 1)).toEqual({ earned: 1, spent: 0, adjusted: 5 });
  });

  it('groups the rows into the same day buckets as the redemption feeds', () => {
    const rows = buildTicketLedger({ memberId: 'kid-1', completions, chores, redemptions, adjustments });
    expect(groupTicketLedgerByDay(rows, now).map((g) => [g.bucket, g.rows.length])).toEqual([
      ['today', 2], ['yesterday', 2], ['thisWeek', 2],
    ]);
  });

  it('dates a redemption on the household day, not the UTC one', () => {
    // Redeemed Tuesday 6 PM Chicago: UTC is already Wednesday.
    const rows = buildTicketLedger({
      memberId: 'kid-1', completions: [], chores, adjustments: [],
      redemptions: [redemption('treat', '2026-09-22T23:00:00Z')],
      timeZone: 'America/Chicago',
    });
    expect(rows[0].date).toBe('2026-09-22');
  });
});
