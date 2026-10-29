'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronRight, History, Ticket } from 'lucide-react';
import type { FamilyMember } from '@/types/family';
import type { ChoreChartConfig } from '@/types/config';
import type { RewardDefinition, RewardRedemption } from '@/lib/reward-data';
import { canAffordReward, isRewardOfferedTo, ticketsAfterRedeeming, ticketsStillNeeded } from '@/lib/reward-rules';
import { onAccentFor } from '@/lib/fullscreen-themes';
import { TEXT_OPACITY, ink } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import FamilyEmptyState from '../../FamilyEmptyState';
import ChoreIcon from '../ChoreIcon';
import { CHORE_ROW_ATTR, FitRows } from '../FitRows';
import { useRedeemReward } from '../../shared/useRedeemReward';
import type { MemberStats } from '../types';
import {
  STORE_RAIL_EM,
  STORE_RAIL_PER_ROW,
  STORE_TAP_PX,
  STORE_TILE_PILL_PX,
  fitChoreFontSize,
  resolveHistoryLimit,
  storeRailShowsBalances,
  storeTileColumns,
  storeUsesRail,
  type StoreLayout,
} from '../layout';
import { RewardHistoryView } from './RewardHistoryView';

interface StoreViewProps {
  config: ChoreChartConfig;
  data: {
    members: FamilyMember[];
    rewards: RewardDefinition[];
    memberStats: Map<string, MemberStats>;
    allRedemptions: RewardRedemption[];
    applyRedemption: (result: { balances?: Record<string, number>; redemptions?: RewardRedemption[] }) => void;
  };
  width: number;
  height: number;
  fontSize: number;
}

/** How long the history stays up with nobody touching it. */
const HISTORY_IDLE_MS = 60_000;
/** Dots shown on a price-list row before it just says the number. */
const MAX_DOTS = 4;

export function resolveStoreLayout(raw: unknown): StoreLayout {
  return raw === 'tiles' || raw === 'price-list' ? raw : 'list';
}

/**
 * The rewards store on a card: who has how many tickets, what they buy, and a
 * Redeem that asks first. Three layouts over the same rules and the same
 * redeem flow as the full-screen store (`useRedeemReward`).
 */
export function StoreView({ config, data, width, height, fontSize }: StoreViewProps) {
  const t = useTranslate('modules');
  const layout = resolveStoreLayout(config.storeLayout);
  const allowTouch = config.allowDisplayComplete !== false;
  const accent = config.accentColor || '#f59e0b';
  const onAccent = onAccentFor(accent);
  const { members } = data;

  // Straight from the shared chore data, which a redeem publishes into. A copy
  // kept here was overwritten with the old balance by the next chores poll.
  const balances = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, stats] of data.memberStats) out[id] = stats.rewardBalance;
    return out;
  }, [data.memberStats]);
  const redemptions = data.allRedemptions;

  const [selectedId, setSelectedId] = useState<string | null>(members[0]?.id ?? null);
  const selected = members.find((m) => m.id === selectedId) ?? members[0] ?? null;
  const selectedBalance = selected ? balances[selected.id] ?? 0 : 0;

  const redeem = useRedeemReward({ enabled: allowTouch, onRedeemed: data.applyRedemption });
  /** Price list only: the reward somebody tapped, waiting to hear who it is for. */
  const [choosingFor, setChoosingFor] = useState<RewardDefinition | null>(null);

  // ── History, opened in place ──
  const [showHistory, setShowHistory] = useState(false);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armIdle = useCallback(() => {
    if (idleRef.current !== null) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => setShowHistory(false), HISTORY_IDLE_MS);
  }, []);
  useEffect(() => {
    if (showHistory) armIdle();
    return () => { if (idleRef.current !== null) clearTimeout(idleRef.current); };
  }, [showHistory, armIdle]);

  const rewards = useMemo(
    () => (layout === 'price-list'
      ? data.rewards.filter((r) => r.enabled)
      : data.rewards.filter((r) => isRewardOfferedTo(r, selected?.id ?? null))),
    [data.rewards, layout, selected],
  );

  if (showHistory) {
    const historyData = { members, allRedemptions: redemptions };
    const rows = Math.min(redemptions.length, resolveHistoryLimit(config.historyLimit));
    return (
      <div className="h-full" onPointerDown={armIdle}>
        <RewardHistoryView
          config={config}
          data={historyData}
          width={width}
          fontSize={fitChoreFontSize({ width, height, requested: fontSize, rows, sections: 0, view: 'reward-history' })}
          onBack={() => setShowHistory(false)}
          backLabel={t('fullscreen-chore-chart.rewardsStore.title')}
        />
      </div>
    );
  }

  const rail = layout !== 'price-list' && storeUsesRail(width, height);
  const showPicker = layout !== 'price-list' && members.length > 1;
  // Balances ride under the avatars while there is room: across the card when
  // the picker is a strip, down the card when it is a rail.
  const showChipBalance = rail
    ? storeRailShowsBalances(showPicker ? members.length : 0, height, fontSize, config.showTitle !== false)
    : width / Math.max(1, members.length) >= 3.2 * fontSize;

  const tickets = (count: number, size: string, long = false) => (
    <span className="inline-flex items-center whitespace-nowrap" style={{ fontSize: size, gap: '0.25em', opacity: TEXT_OPACITY.secondary }}>
      <Ticket size="0.95em" strokeWidth={2.2} aria-hidden="true" />
      {long ? t('fullscreen-chore-chart.rewardsStore.rewardCost', { count }) : count}
    </span>
  );

  const avatar = (member: FamilyMember, size = '1.7em') => (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, fontSize: '0.8em', fontWeight: 800, lineHeight: 1, background: member.color, color: onAccentFor(member.color) }}
    >
      {member.name.charAt(0).toUpperCase()}
    </span>
  );

  const chip = (member: FamilyMember, opts: { selected?: boolean; dim?: boolean; withBalance?: boolean; outlined?: boolean; onPick?: () => void; testId: string }) => (
    <button
      key={member.id}
      type="button"
      data-testid={opts.testId}
      aria-pressed={opts.selected}
      aria-label={member.name}
      disabled={!opts.onPick}
      onClick={opts.onPick}
      className="flex min-w-0 flex-col items-center"
      style={{
        flex: rail ? `0 0 ${Math.floor(100 / STORE_RAIL_PER_ROW) - 3}%` : 1,
        gap: '0.15em',
        padding: '0.3em 0 0.25em',
        borderRadius: '0.6em',
        border: `1.5px solid ${opts.selected ? accent : opts.outlined ? 'rgba(255,255,255,0.14)' : 'transparent'}`,
        background: opts.selected ? ink(0.08) : 'none',
        opacity: opts.dim ? 0.4 : 1,
        color: 'inherit',
        font: 'inherit',
        cursor: opts.onPick ? 'pointer' : 'default',
      }}
    >
      {avatar(member)}
      {(opts.withBalance ?? showChipBalance) && (
        <span className="inline-flex items-center" style={{ fontSize: '0.62em', fontWeight: 700, gap: '0.2em', opacity: 0.75, lineHeight: 1.5 }}>
          <Ticket size="0.95em" strokeWidth={2.2} aria-hidden="true" />
          {balances[member.id] ?? 0}
        </span>
      )}
    </button>
  );

  const picker = showPicker && (
    <div data-testid="store-picker" className="flex shrink-0" style={{ gap: '0.45em', flexWrap: rail ? 'wrap' : 'nowrap', marginTop: rail ? 0 : '0.6em' }}>
      {members.map((m) => chip(m, { selected: m.id === selected?.id, onPick: () => setSelectedId(m.id), testId: 'store-member' }))}
    </div>
  );

  const balanceLine = layout !== 'price-list' && selected && (
    <div data-testid="store-balance" className="flex shrink-0 items-baseline" style={{ gap: '0.4em', margin: '0.55em 0 0.35em' }}>
      <b style={{ fontSize: '1.5em', fontWeight: 800, lineHeight: 1, color: accent }}>{selectedBalance}</b>
      <span style={{ fontSize: '0.72em', opacity: TEXT_OPACITY.secondary }}>
        {t('fullscreen-chore-chart.rewardsStore.memberTickets', { member: selected.name })}
      </span>
    </div>
  );

  // In the rail the number leads, so it loses the strip's top margin.
  const railBalanceLine = balanceLine && <div style={{ marginTop: '-0.55em' }}>{balanceLine}</div>;

  const pill = (reward: RewardDefinition, minHeight: number) => (
    <button
      type="button"
      data-testid="store-redeem"
      onClick={() => selected && redeem.ask(reward, selected, balances[selected.id] ?? 0)}
      className="flex shrink-0 items-center whitespace-nowrap rounded-full"
      style={{ minHeight, padding: '0 0.95em', fontSize: '0.72em', fontWeight: 800, background: accent, color: onAccent, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
    >
      {t('fullscreen-chore-chart.rewardsStore.redeem')}
    </button>
  );
  const stillNeeded = (reward: RewardDefinition, style?: CSSProperties) => (
    <span className="shrink-0 whitespace-nowrap" style={{ fontSize: '0.66em', fontWeight: 600, opacity: 0.55, ...style }}>
      {t('fullscreen-chore-chart.rewardsStore.moreTickets', { count: ticketsStillNeeded(selectedBalance, reward) })}
    </span>
  );
  // `ChoreIcon` sizes in px, so the icon follows the fitted type by hand.
  const icon = (reward: RewardDefinition, em: number) => reward.emoji && (
    <span className="flex shrink-0 items-center justify-center" style={{ lineHeight: 1, width: `${em * 1.15}em` }}>
      <ChoreIcon value={reward.emoji} size={Math.round(fontSize * em)} color="currentColor" />
    </span>
  );

  const rowStyle = (i: number): CSSProperties => ({
    padding: '0.42em 0.55em',
    gap: '0.55em',
    borderTop: i > 0 ? `1px solid ${ink(0.08)}` : 'none',
    lineHeight: 1.5,
  });

  let body: ReactNode;
  if (rewards.length === 0) {
    body = (
      <div className="flex min-h-0 flex-1">
        <FamilyEmptyState
          icon={<Ticket size="1em" strokeWidth={1.75} aria-hidden="true" />}
          title={t('fullscreen-chore-chart.rewardsStore.noneAvailable')}
          hint={t('fullscreen-chore-chart.rewardsStore.addFromPhoneHint')}
        />
      </div>
    );
  } else if (layout === 'tiles') {
    const listWidth = rail ? width - (STORE_RAIL_EM + 1) * fontSize : width;
    body = (
      <FitRows
        className="grid gap-[0.45em] [grid-template-columns:repeat(var(--store-cols),minmax(0,1fr))]"
        style={{ ['--store-cols' as string]: storeTileColumns(listWidth, fontSize) }}
      >
        {rewards.map((reward) => {
          const ok = canAffordReward(selectedBalance, reward);
          return (
            <div
              key={reward.id}
              {...{ [CHORE_ROW_ATTR]: '' }}
              data-testid="store-reward"
              className="flex flex-col items-center text-center"
              style={{ gap: '0.18em', padding: '0.5em 0.4em 0.45em', borderRadius: '0.7em', background: ink(0.06), border: `1px solid ${ink(0.1)}`, opacity: ok ? 1 : 0.55 }}
            >
              {icon(reward, 1.6)}
              <span className="flex items-center" style={{ fontSize: '0.78em', fontWeight: 600, lineHeight: 1.15, minHeight: '2.3em', overflow: 'hidden' }}>{reward.name}</span>
              {tickets(reward.cost, '0.62em', true)}
              {allowTouch && (ok
                ? pill(reward, STORE_TILE_PILL_PX)
                : stillNeeded(reward, { minHeight: STORE_TILE_PILL_PX, display: 'flex', alignItems: 'center' }))}
            </div>
          );
        })}
      </FitRows>
    );
  } else if (layout === 'price-list') {
    body = (
      <FitRows>
        <div style={{ borderRadius: '0.5em', background: ink(0.04), overflow: 'hidden' }}>
          {rewards.map((reward, i) => {
            const can = members.filter((m) => isRewardOfferedTo(reward, m.id) && canAffordReward(balances[m.id] ?? 0, reward));
            const tappable = allowTouch && can.length > 0;
            return (
              <button
                key={reward.id}
                type="button"
                {...{ [CHORE_ROW_ATTR]: '' }}
                data-testid="store-reward"
                disabled={!tappable}
                onClick={tappable ? () => setChoosingFor(reward) : undefined}
                className="flex w-full items-center text-left"
                style={{ ...rowStyle(i), minHeight: allowTouch ? STORE_TAP_PX : undefined, boxSizing: 'border-box', background: 'none', border: 'none', borderTop: rowStyle(i).borderTop, color: 'inherit', font: 'inherit', cursor: tappable ? 'pointer' : 'default' }}
              >
                {icon(reward, 1.2)}
                <span className="min-w-0 flex-1 truncate" style={{ fontWeight: 500 }}>{reward.name}</span>
                {tickets(reward.cost, '0.72em')}
                <span className="inline-flex shrink-0 items-center whitespace-nowrap" style={{ fontSize: '0.64em', fontWeight: 600, gap: '0.3em', opacity: TEXT_OPACITY.secondary }}>
                  {/* Dots and a count, never names: this has to hold up at seven people. */}
                  {can.length > 0 && (
                    <span className="flex" style={{ paddingLeft: '0.25em' }}>
                      {can.slice(0, MAX_DOTS).map((m) => (
                        <i key={m.id} className="rounded-full" style={{ width: '0.85em', height: '0.85em', marginLeft: '-0.25em', background: m.color, border: `1.5px solid ${ink(0.35)}` }} />
                      ))}
                    </span>
                  )}
                  {can.length > 0
                    ? t('chore-chart.store.canGetIt', { count: can.length })
                    : t('chore-chart.store.nobodyYet')}
                </span>
                {tappable && <ChevronRight size="0.9em" className="shrink-0" style={{ opacity: 0.4 }} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </FitRows>
    );
  } else {
    body = (
      <FitRows>
        <div style={{ borderRadius: '0.5em', background: ink(0.04), overflow: 'hidden' }}>
          {rewards.map((reward, i) => {
            const ok = canAffordReward(selectedBalance, reward);
            return (
              <div key={reward.id} {...{ [CHORE_ROW_ATTR]: '' }} data-testid="store-reward" className="flex items-center" style={rowStyle(i)}>
                <span className="flex min-w-0 flex-1 items-center" style={{ gap: '0.55em', opacity: ok || !allowTouch ? 1 : 0.5 }}>
                  {icon(reward, 1.2)}
                  <span className="min-w-0 flex-1 truncate" style={{ fontWeight: 500 }}>{reward.name}</span>
                </span>
                {tickets(reward.cost, '0.72em')}
                {allowTouch && (ok ? pill(reward, STORE_TAP_PX) : stillNeeded(reward, { minWidth: '5.2em', textAlign: 'right' }))}
              </div>
            );
          })}
        </div>
      </FitRows>
    );
  }

  // A short card gives the sheet less air and no big icon: the question, the
  // people and the buttons all matter more.
  const roomy = height >= 16 * fontSize;
  // Bounded by the card: a short card scrolls the sheet's middle and keeps its
  // buttons in view, so there is always a way out that can be reached.
  const sheet = (content: ReactNode, buttons: ReactNode, testId: string) => (
    <div data-testid={testId} className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(3px)', padding: roomy ? '0.6em' : '0.3em', borderRadius: 'inherit' }}>
      {/* The sheet is its own dark surface, so it reads the same on a light card. */}
      <div className="flex w-full flex-col text-center" style={{ background: '#1f2937', color: '#fff', border: '1px solid rgba(255,255,255,0.16)', borderRadius: '0.9em', padding: roomy ? '0.8em' : '0.55em', maxWidth: '34em', maxHeight: '100%', boxSizing: 'border-box' }}>
        <div className="min-h-0" style={{ flex: '0 1 auto', overflowY: 'auto', scrollbarWidth: 'none', touchAction: 'pan-y' }}>{content}</div>
        <div className="flex shrink-0" style={{ gap: '0.5em', paddingTop: '0.6em' }}>{buttons}</div>
      </div>
    </div>
  );
  const sheetIcon = (reward: RewardDefinition) => roomy && reward.emoji && (
    <div className="flex justify-center" style={{ lineHeight: 1.1 }}>
      <ChoreIcon value={reward.emoji} size={Math.round(fontSize * 2)} color="currentColor" />
    </div>
  );
  const sheetButton = (label: string, onClick: () => void, primary: boolean, testId: string, disabled = false) => (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className="flex flex-1 items-center justify-center rounded-full"
      style={{ minHeight: 48, fontSize: '0.78em', fontWeight: 800, border: 'none', fontFamily: 'inherit', cursor: 'pointer', background: primary ? accent : 'rgba(255,255,255,0.1)', color: primary ? onAccent : '#fff', opacity: disabled ? 0.6 : 1 }}
    >
      {label}
    </button>
  );

  const pending = redeem.pending;
  return (
    <div data-testid="store-view" data-layout={layout} className="relative flex h-full min-h-0 flex-col" style={{ fontSize: `${fontSize}px` }}>
      {config.showTitle !== false && (
        <div className="flex shrink-0 items-center justify-between" style={{ fontSize: '0.8em', fontWeight: 600, lineHeight: 1.5 }}>
          <span style={{ opacity: TEXT_OPACITY.secondary }}>{t('fullscreen-chore-chart.rewardsStore.title')}</span>
          {redemptions.length > 0 && (
            <button
              type="button"
              data-testid="store-history"
              onClick={() => setShowHistory(true)}
              className="inline-flex items-center rounded-full"
              style={{ gap: '0.3em', fontSize: '0.85em', fontWeight: 600, padding: '0.15em 0.7em', border: `1px solid ${ink(0.22)}`, background: 'none', color: 'inherit', fontFamily: 'inherit', cursor: 'pointer', opacity: 0.9 }}
            >
              <History size="0.95em" strokeWidth={2.2} aria-hidden="true" />
              {t('fullscreen-chore-chart.rewardsStore.history')}
            </button>
          )}
        </div>
      )}

      {rail ? (
        <div className="flex min-h-0 flex-1" style={{ gap: '1em', marginTop: '0.5em' }}>
          {/* The picked person's tickets go first: if a big family outgrows a
              very short card, the rail scrolls and the number stays in view. */}
          <div data-testid="store-rail" className="flex shrink-0 flex-col" style={{ width: `${STORE_RAIL_EM}em`, overflowY: 'auto', scrollbarWidth: 'none', touchAction: 'pan-y' }}>
            {railBalanceLine}
            {picker}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">{body}</div>
        </div>
      ) : (
        <>
          {picker}
          {balanceLine}
          {layout === 'price-list' && <div className="shrink-0" style={{ height: '0.6em' }} />}
          {body}
        </>
      )}

      {choosingFor && !pending && sheet(
        <>
          {sheetIcon(choosingFor)}
          <div style={{ fontSize: '0.95em', fontWeight: 700, lineHeight: 1.2, margin: '0.2em 0 0.15em' }}>{t('chore-chart.store.whoFor', { reward: choosingFor.name })}</div>
          <div style={{ fontSize: '0.68em', opacity: 0.7, marginBottom: '0.6em' }}>{t('fullscreen-chore-chart.rewardsStore.rewardCost', { count: choosingFor.cost })}</div>
          {/* As many across as fit, so a wide card does not stack seven people three deep. */}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(4.2em, 1fr))', gap: '0.4em' }}>
            {members.filter((m) => isRewardOfferedTo(choosingFor, m.id)).map((m) => {
              const ok = canAffordReward(balances[m.id] ?? 0, choosingFor);
              return chip(m, { dim: !ok, withBalance: true, outlined: true, onPick: ok ? () => redeem.ask(choosingFor, m, balances[m.id] ?? 0) : undefined, testId: 'store-who' });
            })}
          </div>
        </>,
        sheetButton(t('chore-chart.store.notNow'), () => setChoosingFor(null), false, 'store-who-cancel'),
        'store-who-sheet',
      )}

      {allowTouch && pending && sheet(
        <>
          {sheetIcon(pending.reward)}
          <div style={{ fontSize: '0.95em', fontWeight: 700, lineHeight: 1.2, margin: '0.2em 0 0.15em' }}>{t('chore-chart.store.confirmTitle', { reward: pending.reward.name, member: pending.member.name })}</div>
          <div style={{ fontSize: '0.68em', opacity: 0.7 }}>
            {t('chore-chart.store.confirmBody', { count: pending.reward.cost, member: pending.member.name, left: ticketsAfterRedeeming(balances[pending.member.id] ?? 0, pending.reward) })}
          </div>
          {redeem.error && <div data-testid="store-error" style={{ fontSize: '0.68em', color: '#fca5a5' }}>{redeem.error}</div>}
        </>,
        <>
          {sheetButton(t('chore-chart.store.notNow'), () => { redeem.cancel(); setChoosingFor(null); }, false, 'store-cancel')}
          {sheetButton(t('fullscreen-chore-chart.rewardsStore.confirmYes'), () => { void redeem.confirm().then(() => setChoosingFor(null)); }, true, 'store-confirm', redeem.busy)}
        </>,
        'store-confirm-sheet',
      )}

      {redeem.redeemed && (
        <button
          type="button"
          data-testid="store-redeemed"
          onClick={redeem.dismissRedeemed}
          className="absolute text-center"
          style={{ left: '0.6em', right: '0.6em', bottom: '0.6em', background: accent, color: onAccent, borderRadius: '0.8em', padding: '0.55em 0.8em', fontSize: '0.8em', fontWeight: 800, lineHeight: 1.25, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
        >
          {t('fullscreen-chore-chart.rewardsStore.redeemedTitle')}
          <span className="block" style={{ fontWeight: 600, fontSize: '0.82em' }}>
            {t('fullscreen-chore-chart.rewardsStore.redeemedBody', { member: redeem.redeemed.memberName, reward: redeem.redeemed.rewardName, count: redeem.redeemed.cost })}
          </span>
        </button>
      )}
    </div>
  );
}
