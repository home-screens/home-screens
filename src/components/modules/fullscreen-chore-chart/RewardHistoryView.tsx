'use client';

import type { FamilyMember } from '@/types/family';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Ticket } from 'lucide-react';

import type { RewardRedemption } from '@/lib/reward-data';
import { sortRedemptionsNewestFirst } from '@/lib/reward-rules';
import { groupRedemptionsByDay, summarizeRedemptions, SUMMARY_DAYS, type RedemptionGroup } from '@/lib/reward-history';
import { formatTimeAgoLocalized } from '@/lib/chore-constants';
import { getDensityMultiplier, onAccentFor } from '@/lib/fullscreen-themes';
import { useTranslate } from '@/i18n';
import FamilyEmptyState from '@/components/modules/FamilyEmptyState';
import { useElementBox } from '@/hooks/useElementBox';
import FitList from './FitList';
import { splitGroupsAt } from './rewards/historyLayout';

/** `days` groups the feed by how long ago, `totals` leads with sums, `spotlight` with the newest. */
export type RewardHistoryVariant = 'days' | 'totals' | 'spotlight';

interface RewardHistoryViewProps {
  variant: RewardHistoryVariant;
  members: FamilyMember[];
  /** Every redemption the hub still holds (it purges at 90 days). */
  redemptions: RewardRedemption[];
  /** min(w, h) / 1080: chrome scales with this alone. */
  k: number;
  /** Typography multiplier; text scales with k * typoMul. */
  typoMul: number;
  density: 'cozy' | 'snug' | string;
  isLandscape: boolean;
  /** Set when the view was opened from somewhere on the wall rather than configured. */
  onBack?: () => void;
  backLabel?: string;
  idleTimeoutMs?: number;
  /** Household zone: which evening counts as today in the day groups and totals. */
  timezone?: string;
}

/** The "how long ago" column and the day groups both go stale on a quiet wall. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function RewardHistoryView({
  variant,
  members,
  redemptions,
  k,
  typoMul,
  density,
  isLandscape,
  onBack,
  backLabel,
  idleTimeoutMs,
  timezone,
}: RewardHistoryViewProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const now = useMinuteClock();

  const tt = k * typoMul;
  const d = getDensityMultiplier(density);
  const pad = 40 * k * d;

  const sorted = useMemo(() => sortRedemptionsNewestFirst(redemptions), [redemptions]);
  const groups = useMemo(() => groupRedemptionsByDay(redemptions, now, timezone), [redemptions, now, timezone]);
  const summary = useMemo(() => summarizeRedemptions(redemptions, now, SUMMARY_DAYS, timezone), [redemptions, now, timezone]);
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const [bodyRef, bodyBox] = useElementBox();

  // Opened from the wall: go back on its own once nobody is touching it.
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetIdleTimer = useCallback(() => {
    if (!idleTimeoutMs || !onBack) return;
    if (idleTimerRef.current !== null) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(onBack, idleTimeoutMs);
  }, [idleTimeoutMs, onBack]);
  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current !== null) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  const avatar = (redemption: RewardRedemption, size: number) => {
    const member = memberMap.get(redemption.memberId);
    const name = member?.name ?? redemption.memberName;
    const color = member?.color;
    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          // Someone who has left the family keeps their rows, without a colour.
          background: color ?? 'var(--fcc-surface)',
          border: color ? undefined : '1px solid var(--fcc-border)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: size * 0.44,
          fontWeight: 800,
          lineHeight: 1,
          color: color ? onAccentFor(color) : 'var(--fcc-text-2)',
        }}
      >
        {name.charAt(0).toUpperCase()}
      </span>
    );
  };

  const nameOf = (redemption: RewardRedemption) => memberMap.get(redemption.memberId)?.name ?? redemption.memberName;

  const cost = (count: number, size: number, long: boolean) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.3, fontSize: size, fontWeight: 600, color: 'var(--fcc-text-2)', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
      <Ticket size={size} strokeWidth={2} aria-hidden="true" />
      {long ? t(count === 1 ? 'fullscreen-chore-chart.ticketCount' : 'fullscreen-chore-chart.ticketsCount', { count }) : count}
    </span>
  );

  const label = (text: string, accent = false) => (
    <div
      style={{
        fontSize: 22 * tt,
        lineHeight: 1.3,
        fontWeight: 700,
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        color: accent ? 'var(--fcc-accent)' : 'var(--fcc-text-2)',
      }}
    >
      {text}
    </div>
  );

  /** Two lines: the reward is the headline, the person under it. */
  const tallRow = (r: RewardRedemption, padY: number) => (
    <div
      key={r.id}
      data-testid="fcc-row"
      style={{ display: 'flex', alignItems: 'center', gap: 24 * k * d, padding: `${padY}px ${10 * k}px`, borderBottom: '1px solid var(--fcc-border-sub)' }}
    >
      {avatar(r, 60 * tt)}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 30 * tt, fontWeight: 500, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.rewardName}</div>
        <div style={{ fontSize: 21 * tt, lineHeight: 1.3, color: 'var(--fcc-text-2)', marginTop: 2 * k }}>{nameOf(r)}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div>{cost(r.cost, 24 * tt, true)}</div>
        <div style={{ fontSize: 20 * tt, lineHeight: 1.3, color: 'var(--fcc-text-3)', marginTop: 2 * k, whiteSpace: 'nowrap' }}>
          {formatTimeAgoLocalized(r.redeemedAt, tCore, now)}
        </div>
      </div>
    </div>
  );

  /** One line, for the totals view, which is there to fit the most history. */
  const tableRow = (r: RewardRedemption) => (
    <div
      key={r.id}
      data-testid="fcc-row"
      style={{
        display: 'grid',
        // Fixed cost and time columns: each row is its own grid, and an `auto`
        // column would sit the names at a different place on every row.
        gridTemplateColumns: `${48 * tt}px minmax(0, 0.7fr) minmax(0, 1.3fr) ${84 * tt}px ${110 * tt}px`,
        alignItems: 'center',
        columnGap: 20 * k * d,
        padding: `${19 * k * d}px ${10 * k}px`,
        borderBottom: '1px solid var(--fcc-border-sub)',
        fontSize: 28 * tt,
        lineHeight: 1.25,
      }}
    >
      {avatar(r, 48 * tt)}
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(r)}</span>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.rewardName}</span>
      <span style={{ textAlign: 'right' }}>{cost(r.cost, 23 * tt, false)}</span>
      <span style={{ fontSize: 20 * tt, color: 'var(--fcc-text-3)', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {formatTimeAgoLocalized(r.redeemedAt, tCore, now)}
      </span>
    </div>
  );

  const tile = (children: React.ReactNode, caption: string, key: string) => (
    <div key={key} data-testid="fcc-history-tile" style={{ background: 'var(--fcc-surface)', borderRadius: 20 * k, padding: `${22 * k * d}px ${24 * k * d}px`, boxShadow: 'var(--fcc-card-shadow)', minWidth: 0 }}>
      {children}
      <div style={{ fontSize: 20 * tt, lineHeight: 1.3, color: 'var(--fcc-text-2)', marginTop: 8 * k }}>{caption}</div>
    </div>
  );
  const bigNumber = (value: number, unit: string) => (
    <div style={{ fontSize: 54 * tt, fontWeight: 800, lineHeight: 1, color: 'var(--fcc-accent)', whiteSpace: 'nowrap' }}>
      {value}
      <span style={{ fontSize: 24 * tt, fontWeight: 700, marginLeft: 6 * k }}>{unit}</span>
    </div>
  );

  const tiles = (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isLandscape ? '1fr' : 'repeat(3, minmax(0, 1fr))',
        gap: 14 * k * d,
        flexShrink: 0,
        alignContent: 'start',
      }}
    >
      {tile(bigNumber(summary.ticketsSpent, t('fullscreen-chore-chart.rewardHistory.ticketsUnit', { count: summary.ticketsSpent })), t('fullscreen-chore-chart.rewardHistory.spentByFamily'), 'spent')}
      {tile(bigNumber(summary.count, t('fullscreen-chore-chart.rewardHistory.rewardsUnit', { count: summary.count })), t('fullscreen-chore-chart.rewardHistory.redeemed'), 'count')}
      {summary.favorite && tile(
        <div style={{ fontSize: 30 * tt, fontWeight: 700, lineHeight: 1.15 }}>{summary.favorite.rewardName}</div>,
        t('fullscreen-chore-chart.rewardHistory.favorite', { count: summary.favorite.count }),
        'favorite',
      )}
    </div>
  );

  const [latest, ...rest] = sorted;
  const hero = latest && (
    <div
      data-testid="fcc-history-hero"
      style={{
        flexShrink: 0,
        background: 'var(--fcc-surface)',
        border: '1px solid var(--fcc-border)',
        borderRadius: 28 * k,
        padding: 36 * k * d,
        display: 'flex',
        alignItems: 'center',
        gap: 32 * k * d,
        boxShadow: 'var(--fcc-card-shadow)',
      }}
    >
      {avatar(latest, 150 * k * Math.min(typoMul, 1.35))}
      <div style={{ minWidth: 0 }}>
        {label(t('fullscreen-chore-chart.rewardHistory.latest'), true)}
        <div style={{ fontSize: 52 * tt, fontWeight: 800, lineHeight: 1.1, margin: `${8 * k}px 0 ${10 * k}px` }}>{latest.rewardName}</div>
        <div style={{ fontSize: 26 * tt, lineHeight: 1.3, color: 'var(--fcc-text-2)' }}>
          {t('fullscreen-chore-chart.rewardHistory.latestLine', {
            member: nameOf(latest),
            count: latest.cost,
            when: formatTimeAgoLocalized(latest.redeemedAt, tCore, now),
          })}
        </div>
      </div>
    </div>
  );

  const listStyle: React.CSSProperties = { flex: 1, minHeight: 0 };
  let body: React.ReactNode;
  if (sorted.length === 0) {
    body = (
      <div style={{ flex: 1, display: 'flex', color: 'var(--fcc-text-2)' }}>
        <FamilyEmptyState
          icon={<Ticket size="1em" strokeWidth={1.75} aria-hidden="true" />}
          title={t('chore-chart.noRewardHistory')}
          hint={t('fullscreen-chore-chart.rewardHistory.emptyHint')}
          fontSize={44 * k}
        />
      </div>
    );
  } else if (variant === 'days') {
    const padY = 22 * k * d;
    const groupGap = 34 * k * d;
    const renderGroups = (list: RedemptionGroup[], testId: string) => (
      <FitList fontSize={20 * tt} style={{ ...listStyle, minWidth: 0 }} testId={testId}>
        {list.map((group, i) => (
          <div key={group.bucket} style={{ marginTop: i === 0 ? 0 : groupGap }}>
            {label(t(`fullscreen-chore-chart.rewardHistory.bucket.${group.bucket}`), group.bucket === 'today')}
            {group.redemptions.map((r) => tallRow(r, padY))}
          </div>
        ))}
      </FitList>
    );
    if (!isLandscape) {
      body = renderGroups(groups, 'fcc-history-list');
    } else {
      // A wide screen reads as two columns, newest at the top left. The left
      // one takes what its height holds, so only the right one ever says
      // "more below" and the order still runs down, then across.
      const rowPx = (30 * 1.2 + 21 * 1.3) * tt + 2 * k + 2 * padY + 1;
      const [left, right] = splitGroupsAt(groups, bodyBox.height, rowPx, 22 * tt * 1.3, groupGap);
      body = (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 56 * k * d }}>
          {renderGroups(left, 'fcc-history-list')}
          {right.length > 0 ? renderGroups(right, 'fcc-history-list-2') : <div style={{ flex: 1 }} />}
        </div>
      );
    }
  } else if (variant === 'totals') {
    const list = (
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: 6 * k, flexShrink: 0 }}>{label(t('fullscreen-chore-chart.rewardHistory.latestList'))}</div>
        <FitList fontSize={20 * tt} style={listStyle} testId="fcc-history-list">
          {sorted.map(tableRow)}
        </FitList>
      </div>
    );
    body = isLandscape ? (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 40 * k * d }}>
        <div style={{ width: '28%', flexShrink: 0 }}>{tiles}</div>
        {list}
      </div>
    ) : (
      <>
        {tiles}
        <div style={{ height: 40 * k * d, flexShrink: 0 }} />
        {list}
      </>
    );
  } else {
    const before = rest.length > 0 && (
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: 6 * k, flexShrink: 0 }}>{label(t('fullscreen-chore-chart.rewardHistory.beforeThat'))}</div>
        <FitList fontSize={20 * tt} style={listStyle} testId="fcc-history-list">
          {rest.map((r) => tallRow(r, 18 * k * d))}
        </FitList>
      </div>
    );
    body = isLandscape ? (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-start', gap: 40 * k * d }}>
        <div style={{ width: '42%', flexShrink: 0 }}>{hero}</div>
        <div style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', display: 'flex' }}>{before}</div>
      </div>
    ) : (
      <>
        {hero}
        <div style={{ height: 40 * k * d, flexShrink: 0 }} />
        {before}
      </>
    );
  }

  return (
    <div
      data-testid="fcc-history"
      data-variant={variant}
      onPointerDown={resetIdleTimer}
      style={{
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--fcc-bg)',
        color: 'var(--fcc-text)',
      }}
    >
      <div style={{ flexShrink: 0, padding: `${pad}px ${pad}px 0`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 * k * d }}>
        <div style={{ minWidth: 0 }}>
          <div data-testid="fcc-history-title" style={{ fontSize: Math.max(46 * k, 28 * tt), fontWeight: 800, lineHeight: 1.1 }}>
            {t('chore-chart.rewardHistory')}
          </div>
          <div style={{ fontSize: 22 * tt, fontWeight: 500, color: 'var(--fcc-text-2)', marginTop: 4 * k, lineHeight: 1.2 }}>
            {variant === 'totals'
              ? t('fullscreen-chore-chart.rewardHistory.lastDays', { count: SUMMARY_DAYS })
              : t('fullscreen-chore-chart.rewardHistory.subtitle')}
          </div>
        </div>
        {onBack && (
          <button
            data-testid="fcc-history-back"
            onClick={onBack}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8 * k,
              padding: `${8 * k}px ${20 * k}px`,
              minHeight: 44 * k,
              borderRadius: 999,
              border: '1px solid var(--fcc-border)',
              background: 'var(--fcc-surface)',
              color: 'var(--fcc-accent)',
              fontSize: 22 * k,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: 'var(--fcc-card-shadow)',
              flexShrink: 0,
              whiteSpace: 'nowrap',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          >
            <ArrowLeft size={22 * k} strokeWidth={2.5} aria-hidden="true" />
            {backLabel}
          </button>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: `${30 * k * d}px ${pad}px ${pad}px` }}>
        <div ref={bodyRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {body}
        </div>
      </div>
    </div>
  );
}
