import { describe, it, expect } from 'vitest';
import type { RewardRedemption } from '../reward-data';
import { groupRedemptionsByDay, summarizeRedemptions } from '../reward-history';

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
