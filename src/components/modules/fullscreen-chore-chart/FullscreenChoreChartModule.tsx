'use client';

import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useFullscreenDims } from '@/hooks/useFullscreenDims';
import type { FullscreenChoreChartConfig, ModuleStyle, ChoreTimeOfDay } from '@/types/config';
import { getThemeTokens, migrateFromDarkMode, getTypoMultiplier, getDensityMultiplier, buildThemeCSSVars } from '@/lib/fullscreen-themes';
import { useChoreData } from '@/components/modules/chore-chart/useChoreData';
import { createTZDate, formatDateInTZ } from '@/lib/timezone';
import { useTranslate, useFormattingLocale } from '@/i18n';
import ChoreToast, { type ToastItem } from './ChoreToast';
import ChoreRowItem from './ChoreRowItem';
import TimeBand, { TimeBandHeader } from './TimeBand';
import MemberStrip from './MemberStrip';
import StarChart from './StarChart';
import { RewardsStoreView } from './RewardsStoreView';
import {
  type ChoreRow,
  type ToggleParams,
  TOD_ORDER,
  getOrientation,
  getUniqueInitials,
  getCurrentTimeOfDay,
  buildChoreRows,
} from './helpers';

// ─── Props ───

interface FullscreenChoreChartModuleProps {
  config: FullscreenChoreChartConfig;
  style: ModuleStyle;
  fullscreenTheme?: string;
  timezone?: string;
}

// ─── Component ───

export default function FullscreenChoreChartModule({
  config,
  style: _style,
  fullscreenTheme,
  timezone,
}: FullscreenChoreChartModuleProps) {
  const { containerRef, dims } = useFullscreenDims();
  const t = useTranslate('modules');
  const locale = useFormattingLocale();

  const themeId = config.theme ?? fullscreenTheme ?? migrateFromDarkMode(config.darkMode);
  const theme = getThemeTokens(themeId);

  const scale = useMemo(() => ({
    bu: Math.min(dims.w, dims.h) / 100,
    width: dims.w,
    orientation: getOrientation(dims.w, dims.h),
    densityMul: getDensityMultiplier(config.density),
    typoMul: getTypoMultiplier(config.typographySize),
    isDark: theme.isDark,
  }), [dims, config.density, config.typographySize, theme.isDark]);

  const { todayAssignments, memberStats, weekData, members, rewards, recentRedemptions, toggleComplete } = useChoreData(config);
  const allowTouch = config.allowDisplayComplete ?? true;
  // `tzNow` is a "shifted" Date whose local-time methods reflect the
  // configured IANA timezone — used by `getCurrentTimeOfDay`/DAY_NAMES_FULL
  // which read `.getHours()`/`.getDay()`. `formatDateInTZ` further down
  // takes a real UTC instant (`new Date()`) so it can do its own zone
  // shift via `Intl.DateTimeFormat`; passing the shifted Date would
  // double-shift and yield the wrong day near midnight.
  const tzNow = createTZDate(timezone);
  const currentTod = getCurrentTimeOfDay(tzNow.getHours());

  // Toast state for completion feedback
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);
  const toastsRef = useRef(toasts);
  useEffect(() => { toastsRef.current = toasts; }, [toasts]);

  // Redemption toasts — show when new redemptions appear from polling
  const seenRedemptionIds = useRef(new Set<string>());
  const seededRedemptions = useRef(false);
  useEffect(() => {
    if (recentRedemptions.length === 0) return;
    // On first load, seed the set so we don't toast stale entries
    if (!seededRedemptions.current) {
      seededRedemptions.current = true;
      for (const r of recentRedemptions) seenRedemptionIds.current.add(r.id);
      return;
    }
    for (const r of recentRedemptions) {
      if (seenRedemptionIds.current.has(r.id)) continue;
      seenRedemptionIds.current.add(r.id);
      // Find member color
      const member = members.find((m) => m.id === r.memberId);
      const id = `redeem-${r.id}`;
      setToasts((prev) => [...prev.slice(-2), {
        id,
        choreId: '',
        memberId: r.memberId,
        choreName: `${r.rewardName} 🎟️`,
        memberName: r.memberName,
        memberColor: member?.color ?? '#a3a3a3',
        wasCompleted: true,
        verb: t('fullscreen-chore-chart.verbs.redeemed'),
      }]);
    }
  }, [recentRedemptions, members, t]);

  // ── Rewards Store view switching ──
  const [showRewardsOverride, setShowRewardsOverride] = useState(false);

  const effectiveView = showRewardsOverride ? 'rewards-store' : (config.view ?? 'chores');

  const rewardBalances = useMemo(() => {
    const b: Record<string, number> = {};
    for (const [id, stats] of memberStats) {
      b[id] = stats.rewardBalance;
    }
    return b;
  }, [memberStats]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleToggle = useCallback(({ choreId, memberId, choreName, memberName, memberColor, wasCompleted }: ToggleParams) => {
    toggleComplete(choreId, memberId);
    const id = String(++toastIdRef.current);
    setToasts((prev) => [...prev.slice(-2), { id, choreId, memberId, choreName, memberName, memberColor, wasCompleted: !wasCompleted }]);
  }, [toggleComplete]);

  const handleUndo = useCallback((toastId: string) => {
    const toast = toastsRef.current.find((t) => t.id === toastId);
    if (toast) toggleComplete(toast.choreId, toast.memberId);
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  }, [toggleComplete]);

  // Build chore rows grouped by time-of-day
  const choreGroups = useMemo(() => buildChoreRows(todayAssignments), [todayAssignments]);

  // Overall completion
  const totalChores = todayAssignments.length;
  const totalDone = todayAssignments.filter((a) => a.isCompleted).length;
  const overallPct = totalChores > 0 ? Math.round((totalDone / totalChores) * 100) : 0;

  // Date — `tzNow.getDay()` is correct because shifted-Date local-time
  // methods read in target zone, but `formatDateInTZ` needs a real UTC
  // instant so its internal `Intl` shift doesn't double-apply.
  const dayName = formatDateInTZ(new Date(), timezone, { weekday: 'long' }, locale);
  const dateStr = formatDateInTZ(new Date(), timezone, { month: 'long', day: 'numeric', year: 'numeric' }, locale);

  // Member lookup
  const memberMap = useMemo(() => {
    const map = new Map<string, (typeof members)[number]>();
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members]);

  const initialsMap = useMemo(() => getUniqueInitials(members), [members]);

  const isLandscape = scale.orientation === 'landscape';
  const s = scale.bu * scale.typoMul;
  const d = scale.densityMul;
  const pad = s * 2 * d;

  // If showTimeOfDay is off, merge all groups into a single list
  const mergedGroups = useMemo(() => {
    if (config.showTimeOfDay) return choreGroups;
    const all: ChoreRow[] = [];
    for (const tod of TOD_ORDER) {
      const rows = choreGroups.get(tod);
      if (rows) all.push(...rows);
    }
    const merged = new Map<ChoreTimeOfDay, ChoreRow[]>();
    if (all.length > 0) merged.set('anytime', all);
    return merged;
  }, [config.showTimeOfDay, choreGroups]);

  const displayTods = config.showTimeOfDay
    ? TOD_ORDER.filter((tod) => choreGroups.has(tod))
    : mergedGroups.has('anytime') ? ['anytime' as ChoreTimeOfDay] : [];

  const displayGroups = config.showTimeOfDay ? choreGroups : mergedGroups;

  const memberStripWidth = isLandscape ? scale.width * 0.65 : scale.width - pad * 2;

  return (
    <div
      ref={containerRef}
      className="fcc-root"
      style={{
        width: '100%',
        height: '100%',
        fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        ...buildThemeCSSVars('fcc', theme),
        '--fcc-accent': config.accentColor ?? '#f59e0b',
        colorScheme: theme.isDark ? 'dark' : 'light',
      } as React.CSSProperties}
    >
      <style>{`
        .fcc-root {
          background: var(--fcc-bg);
          color: var(--fcc-text);
        }
      `}</style>

      {effectiveView === 'rewards-store' ? (
        <RewardsStoreView
          members={members}
          rewards={rewards}
          balances={rewardBalances}
          redemptions={recentRedemptions}
          scale={s}
          isLandscape={isLandscape}
          onBack={showRewardsOverride ? () => setShowRewardsOverride(false) : undefined}
          idleTimeoutMs={showRewardsOverride ? 60_000 : undefined}
        />
      ) : (
        <>
      {/* ── Header + Members ── */}
      {isLandscape ? (
        <div style={{ display: 'flex', alignItems: 'stretch', padding: `${s * 1}px ${pad}px`, gap: s * 1.4, borderBottom: '1px solid var(--fcc-border-sub)', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingRight: s * 1.4, borderRight: '1px solid var(--fcc-border-sub)', minWidth: s * 12 }}>
            <div style={{ fontSize: s * 0.9, fontWeight: 600, color: 'var(--fcc-text-2)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {dayName}
            </div>
            <div style={{ fontSize: s * 1.5, fontWeight: 700, color: 'var(--fcc-text)', marginTop: s * 0.1 }}>
              {dateStr}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: s * 0.5, marginTop: s * 0.5 }}>
              <div style={{ flex: 1, height: s * 0.25, background: 'var(--fcc-border-sub)', borderRadius: s * 0.15, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--fcc-accent)', borderRadius: s * 0.15, width: `${overallPct}%`, transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ fontSize: s * 1.1, fontWeight: 800, color: 'var(--fcc-accent)', flexShrink: 0 }}>
                {overallPct}%
              </div>
              {config.showRewardsButton && (
                <button
                  onClick={() => setShowRewardsOverride(true)}
                  style={{
                    padding: `${s * 0.3}px ${s * 0.8}px`,
                    borderRadius: s * 1,
                    border: '1px solid var(--fcc-border)',
                    background: 'var(--fcc-surface)',
                    color: 'var(--fcc-accent)',
                    fontSize: s * 0.65,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: 'var(--fcc-card-shadow)',
                    flexShrink: 0,
                  }}
                >
                  ★ {t('fullscreen-chore-chart.rewardsButton')}
                </button>
              )}
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <MemberStrip members={members} memberStats={memberStats} chipHeight={s * 4} gap={s * 0.7} showStreaks={config.showStreaks} showPoints={config.showPoints} availableWidth={memberStripWidth} />
          </div>
        </div>
      ) : (
        <>
          <div style={{ padding: `${pad}px ${pad}px ${pad * 0.6}px`, flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: s * 1.2 }}>
              <div>
                <div style={{ fontSize: s * 1.1, fontWeight: 600, color: 'var(--fcc-text-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {dayName}
                </div>
                <div style={{ fontSize: s * 2, fontWeight: 700, color: 'var(--fcc-text)', marginTop: s * 0.15 }}>
                  {dateStr}
                </div>
              </div>
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <div style={{ fontSize: s * 2.5, fontWeight: 800, color: 'var(--fcc-accent)', lineHeight: 1 }}>
                  {overallPct}<span style={{ fontSize: s * 1.2, color: 'var(--fcc-text-2)' }}>%</span>
                </div>
                <div style={{ fontSize: s * 0.85, fontWeight: 500, color: 'var(--fcc-text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {t('fullscreen-chore-chart.complete')}
                </div>
                {config.showRewardsButton && (
                  <button
                    onClick={() => setShowRewardsOverride(true)}
                    style={{
                      marginTop: s * 0.6,
                      padding: `${s * 0.35}px ${s * 1}px`,
                      borderRadius: s * 1.5,
                      border: '1px solid var(--fcc-border)',
                      background: 'var(--fcc-surface)',
                      color: 'var(--fcc-accent)',
                      fontSize: s * 0.8,
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: 'var(--fcc-card-shadow)',
                    }}
                  >
                    ★ {t('fullscreen-chore-chart.rewardsButton')}
                  </button>
                )}
              </div>
            </div>
            <div style={{ height: s * 0.35, background: 'var(--fcc-border-sub)', borderRadius: s * 0.2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--fcc-accent)', borderRadius: s * 0.2, width: `${overallPct}%`, transition: 'width 0.5s ease' }} />
            </div>
          </div>
          <div style={{ padding: `${s * 0.8}px ${pad}px`, flexShrink: 0, borderBottom: '1px solid var(--fcc-border-sub)' }}>
            <MemberStrip members={members} memberStats={memberStats} chipHeight={s * 5.5} gap={s * 0.7} showStreaks={config.showStreaks} showPoints={config.showPoints} availableWidth={memberStripWidth} />
          </div>
        </>
      )}

      {/* ── Chore Content ── */}
      {isLandscape ? (
        <div style={{ flex: 1, display: 'flex', gap: 1, background: 'var(--fcc-surface)', minHeight: 0, overflow: 'hidden' }}>
          {displayTods.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--fcc-bg)' }}>
              <div style={{ textAlign: 'center', color: 'var(--fcc-text-2)', fontSize: s * 1.5 }}>{t('fullscreen-chore-chart.noChoresToday')}</div>
            </div>
          ) : displayTods.map((tod) => {
            const rows = displayGroups.get(tod) ?? [];
            const fontSize = s * 1.15;
            const dotSize = s * 2.2;

            return (
              <div key={tod} style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--fcc-bg)', minWidth: 0 }}>
                {config.showTimeOfDay && (
                  <TimeBandHeader tod={tod} fontSize={fontSize} currentTod={currentTod} style={{ padding: `${fontSize * 0.6}px ${fontSize * 0.8}px`, borderBottom: '1px solid var(--fcc-border-sub)', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, overflowY: 'auto', padding: `${fontSize * 0.3}px ${fontSize * 0.5}px`, scrollbarWidth: 'none', touchAction: 'manipulation' }}>
                  {rows.map((row, i) => (
                    <ChoreRowItem key={row.choreId} row={row} fontSize={fontSize} dotSize={dotSize} isFirst={i === 0} showPoints={config.showPoints} memberMap={memberMap} initialsMap={initialsMap} allowTouch={allowTouch} onToggle={handleToggle} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${pad}px`, scrollbarWidth: 'none', minHeight: 0, touchAction: 'manipulation' }}>
          {displayTods.map((tod) => {
            const rows = displayGroups.get(tod) ?? [];
            return (
              <TimeBand key={tod} tod={tod} rows={rows} fontSize={s * 1.2} dotSize={s * 2.5} showHeader={config.showTimeOfDay} showPoints={config.showPoints} currentTod={currentTod} memberMap={memberMap} initialsMap={initialsMap} allowTouch={allowTouch} onToggle={handleToggle} />
            );
          })}
          {displayTods.length === 0 && (
            <div style={{ textAlign: 'center', padding: `${s * 8}px 0`, color: 'var(--fcc-text-2)', fontSize: s * 1.5 }}>{t('fullscreen-chore-chart.noChoresToday')}</div>
          )}
        </div>
      )}

      {/* ── Star Chart + Footer ── */}
      <div style={{
        flexShrink: 0,
        padding: `${s * 0.8}px ${pad}px ${s * 1.2}px`,
        borderTop: '1px solid var(--fcc-border-sub)',
        display: isLandscape ? 'flex' : 'block',
        alignItems: 'center',
        gap: pad,
      }}>
        <div style={{ flex: 1 }}>
          <StarChart chartHeight={isLandscape ? s * 7 : s * 9} weekData={weekData} members={members} />
        </div>
        <div style={{
          display: 'flex',
          justifyContent: isLandscape ? 'flex-end' : 'space-between',
          flexDirection: isLandscape ? 'column' : 'row',
          gap: s * 0.3,
          paddingTop: isLandscape ? 0 : s * 0.5,
          borderLeft: isLandscape ? '1px solid var(--fcc-border-sub)' : 'none',
          paddingLeft: isLandscape ? pad : 0,
          flexShrink: 0,
        }}>
          {config.showPoints && (
            <div style={{ fontSize: s * 0.9, color: 'var(--fcc-text-3)', fontWeight: 500 }}>
              {t('fullscreen-chore-chart.weeklyTickets')} <span style={{ color: 'var(--fcc-text-2)', fontWeight: 600 }}>
                {t('fullscreen-chore-chart.weeklyTicketsValue', {
                  earned: Array.from(memberStats.values()).reduce((sum, ms) => sum + ms.weeklyPoints, 0),
                  total: Array.from(memberStats.values()).reduce((sum, ms) => sum + ms.weeklyPointsTotal, 0),
                })}
              </span>
            </div>
          )}
          {config.showStreaks && (
            <div style={{ fontSize: s * 0.9, color: 'var(--fcc-text-3)', fontWeight: 500 }}>
              {t('fullscreen-chore-chart.bestStreakLabel')} <span style={{ color: 'var(--fcc-text-2)', fontWeight: 600 }}>
                {(() => {
                  let best = { name: '', streak: 0 };
                  for (const m of members) {
                    const ms = memberStats.get(m.id);
                    if (ms && ms.streak > best.streak) best = { name: m.name, streak: ms.streak };
                  }
                  return best.streak > 0
                    ? t('fullscreen-chore-chart.bestStreakValue', { name: best.name, count: best.streak })
                    : t('fullscreen-chore-chart.bestStreakNone');
                })()}
              </span>
            </div>
          )}
        </div>
      </div>

    </>
      )}

      {/* Touch completion toasts — always rendered */}
      {allowTouch && <ChoreToast toasts={toasts} onDismiss={dismissToast} onUndo={handleUndo} />}
    </div>
  );
}
