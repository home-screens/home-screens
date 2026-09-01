'use client';

import React, { useRef, useState, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { useFullscreenDims } from '@/hooks/useFullscreenDims';
import type { FullscreenChoreChartConfig, ModuleStyle, ChoreTimeOfDay } from '@/types/config';
import { getThemeTokens, migrateFromDarkMode, getTypoMultiplier, getDensityMultiplier, buildThemeCSSVars, resolveFullscreenAccent } from '@/lib/fullscreen-themes';
import { DEFAULT_ACCENT_COLOR } from '@/lib/meal-constants';
import { useChoreData } from '@/components/modules/chore-chart/useChoreData';
import { createTZDate, formatDateInTZ } from '@/lib/timezone';
import { useTranslate, useFormattingLocale } from '@/i18n';
import ChoreToast, { type ToastItem } from './ChoreToast';
import ChoreRowItem from './ChoreRowItem';
import TimeBand, { TimeBandHeader } from './TimeBand';
import MemberStrip from './MemberStrip';
import StarChart from './StarChart';
import WeekStrip from './WeekStrip';
import { RewardsStoreView } from './RewardsStoreView';
import {
  type ChoreRow,
  type ToggleParams,
  TOD_ORDER,
  HEADER_ROW_UNITS,
  getOrientation,
  getUniqueInitials,
  getCurrentTimeOfDay,
  buildChoreRows,
  fitRowHeight,
} from './helpers';

interface FullscreenChoreChartModuleProps {
  config: FullscreenChoreChartConfig;
  style: ModuleStyle;
  fullscreenTheme?: string;
  timezone?: string;
}

/** Width the block sizes below are authored against. */
const REF_W = 1080;
/** Assignee dots never drop below a fingertip, whatever the row height. */
const MIN_DOT_PX = 44;
/** Or grow past this on the standard kiosk. */
const MAX_DOT_REF = 84;

/**
 * Content height of an element, tracked with ResizeObserver. The list box is
 * `flex: 1` with `minHeight: 0`, so its height comes from the canvas minus
 * the fixed blocks, never from its own rows — measuring it cannot feed back
 * into the row size it decides.
 */
function useMeasuredHeight(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setHeight(entry.contentRect.height);
    });
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  return [ref, height];
}

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

  const isLandscape = getOrientation(dims.w, dims.h) === 'landscape';
  // Canvas scale: the fixed blocks (header, member chips, week, footer) are
  // authored in px for a 1080-wide panel and scale with the short side, so a
  // 720-wide panel or the editor preview shrinks them proportionally. The
  // chore list is not authored — it takes whatever height is left.
  const k = Math.min(dims.w, dims.h) / REF_W;
  const typoMul = getTypoMultiplier(config.typographySize ?? 'extra-large');
  const d = getDensityMultiplier(config.density);
  const pad = 40 * k * d;
  const weekProgress = config.weekProgress ?? 'chips';

  const { todayAssignments, memberStats, weekData, members, rewards, recentRedemptions, toggleComplete } = useChoreData(config);
  const allowTouch = config.allowDisplayComplete ?? true;
  // `tzNow` is a "shifted" Date whose local-time methods reflect the
  // configured IANA timezone — used by `getCurrentTimeOfDay` which reads
  // `.getHours()`. `formatDateInTZ` further down takes a real UTC instant
  // (`new Date()`) so it can do its own zone shift via `Intl.DateTimeFormat`;
  // passing the shifted Date would double-shift and yield the wrong day
  // near midnight.
  const tzNow = createTZDate(timezone);
  const currentTod = getCurrentTimeOfDay(tzNow.getHours());

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

  const displayTods = useMemo<ChoreTimeOfDay[]>(() => (
    config.showTimeOfDay
      ? TOD_ORDER.filter((tod) => choreGroups.has(tod))
      : mergedGroups.has('anytime') ? ['anytime'] : []
  ), [config.showTimeOfDay, choreGroups, mergedGroups]);

  const displayGroups = config.showTimeOfDay ? choreGroups : mergedGroups;

  // ── The fit rule ──
  // Portrait stacks every band, so the list has to hold all rows and headers;
  // landscape gives each time-of-day its own column, so the tallest column
  // sets the row height and every column shares it.
  const [listRef, listHeight] = useMeasuredHeight();
  const { chores: fitChores, headers: fitHeaders } = useMemo(() => {
    let chores = 0;
    let headers = 0;
    if (isLandscape) {
      for (const tod of displayTods) {
        const n = (displayGroups.get(tod) ?? []).length + (config.showTimeOfDay ? HEADER_ROW_UNITS : 0);
        if (n > chores) chores = n;
      }
      // The header is already folded into `chores` above as a fractional row.
      return { chores, headers: 0 };
    }
    for (const tod of displayTods) {
      chores += (displayGroups.get(tod) ?? []).length;
      if (config.showTimeOfDay) headers += 1;
    }
    return { chores, headers };
  }, [isLandscape, displayTods, displayGroups, config.showTimeOfDay]);

  const rowHeight = fitRowHeight({ listHeight, chores: fitChores, headers: fitHeaders, k, typoMul });
  const headerHeight = rowHeight * HEADER_ROW_UNITS;
  // Landscape columns are narrow (a 1920 panel with four time-of-day columns
  // gives each ~480px), so a row stacks its name over its dots and splits the
  // height between the two lines instead of sharing one line.
  const columnWidth = isLandscape ? (dims.w - pad * 2) / Math.max(1, displayTods.length) : dims.w;
  const stackedRows = isLandscape && columnWidth < 900 * k;
  // What a row can use for icon, name and dots: the column minus its own padding.
  const rowWidth = isLandscape ? columnWidth - pad : dims.w - pad * 2;
  const nameSize = rowHeight * (stackedRows ? 0.36 : 0.5);
  const dotSize = Math.max(MIN_DOT_PX, Math.min(MAX_DOT_REF * k, rowHeight * (stackedRows ? 0.42 : 0.62)));
  const bandLabelSize = 22 * k;
  // Rows at the floor no longer fit: let the list scroll instead of clipping.
  const listOverflows = listHeight > 0 && rowHeight * (fitChores + HEADER_ROW_UNITS * fitHeaders) > listHeight + 1;

  const memberStripWidth = isLandscape ? dims.w * 0.65 : dims.w - pad * 2;
  const chipScale = isLandscape ? k * 0.75 : k;
  const chipDetail = weekProgress === 'chips' ? 'stars' : 'bar';

  const weekBottom = weekProgress === 'grid'
    ? <StarChart k={k} weekData={weekData} members={members} />
    : weekProgress === 'strip'
      ? <WeekStrip k={k} weekData={weekData} members={members} />
      : null;

  const footer = (config.showPoints || config.showStreaks) && (
    <div style={{
      flexShrink: 0,
      padding: `${18 * k}px ${pad}px ${30 * k}px`,
      borderTop: '1px solid var(--fcc-border-sub)',
      display: 'flex',
      justifyContent: 'space-between',
      gap: pad,
      fontSize: 21 * k,
      color: 'var(--fcc-text-3)',
      fontWeight: 500,
    }}>
      {config.showPoints && (
        <div>
          {t('fullscreen-chore-chart.weeklyTickets')} <span style={{ color: 'var(--fcc-text-2)', fontWeight: 600 }}>
            {t('fullscreen-chore-chart.weeklyTicketsValue', {
              earned: Array.from(memberStats.values()).reduce((sum, ms) => sum + ms.weeklyPoints, 0),
              total: Array.from(memberStats.values()).reduce((sum, ms) => sum + ms.weeklyPointsTotal, 0),
            })}
          </span>
        </div>
      )}
      {config.showStreaks && (
        <div>
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
  );

  const rewardsButton = config.showRewardsButton && (
    <button
      onClick={() => setShowRewardsOverride(true)}
      style={{
        padding: `${8 * k}px ${20 * k}px`,
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
      }}
    >
      ★ {t('fullscreen-chore-chart.rewardsButton')}
    </button>
  );

  const emptyState = (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fcc-text-2)', fontSize: 40 * k, textAlign: 'center' }}>
      {t('fullscreen-chore-chart.noChoresToday')}
    </div>
  );

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
        // Empty accentColor follows the theme's own accent (see the registry default).
        '--fcc-accent': resolveFullscreenAccent(config.accentColor, theme, DEFAULT_ACCENT_COLOR),
        colorScheme: theme.isDark ? 'dark' : 'light',
      } as React.CSSProperties}
    >
      <style>{`
        .fcc-root {
          background-color: var(--fcc-bg);
          background-image: var(--fcc-bg-image);
          color: var(--fcc-text);
        }
      `}</style>

      {effectiveView === 'rewards-store' ? (
        <RewardsStoreView
          members={members}
          rewards={rewards}
          balances={rewardBalances}
          redemptions={recentRedemptions}
          scale={k * 10.8 * typoMul}
          isLandscape={isLandscape}
          onBack={showRewardsOverride ? () => setShowRewardsOverride(false) : undefined}
          idleTimeoutMs={showRewardsOverride ? 60_000 : undefined}
        />
      ) : isLandscape ? (
        <>
          {/* Landscape header: date + progress on the left, member chips on the right. */}
          <div style={{ display: 'flex', alignItems: 'stretch', padding: `${20 * k}px ${pad}px`, gap: 28 * k, borderBottom: '1px solid var(--fcc-border-sub)', flexShrink: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingRight: 28 * k, borderRight: '1px solid var(--fcc-border-sub)', minWidth: 300 * k }}>
              <div style={{ fontSize: 20 * k, fontWeight: 600, color: 'var(--fcc-text-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {dayName}
              </div>
              <div style={{ fontSize: 38 * k, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--fcc-text)', marginTop: 2 * k }}>
                {dateStr}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 * k, marginTop: 14 * k }}>
                <div style={{ flex: 1, height: 8 * k, background: 'var(--fcc-border-sub)', borderRadius: 4 * k, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--fcc-accent)', borderRadius: 4 * k, width: `${overallPct}%`, transition: 'width 0.5s ease' }} />
                </div>
                <div style={{ fontSize: 34 * k, fontWeight: 800, color: 'var(--fcc-accent)', flexShrink: 0, lineHeight: 1 }}>
                  {overallPct}%
                </div>
                {rewardsButton}
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <div style={{ width: '100%' }}>
                <MemberStrip members={members} memberStats={memberStats} weekData={weekData} detail={chipDetail} c={chipScale} gap={12 * k} showStreaks={config.showStreaks} showPoints={config.showPoints} availableWidth={memberStripWidth} />
              </div>
            </div>
          </div>

          <div ref={listRef} style={{ flex: 1, display: 'flex', gap: 1, background: 'var(--fcc-surface)', minHeight: 0, overflow: 'hidden' }}>
            {displayTods.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', background: 'var(--fcc-bg)' }}>{emptyState}</div>
            ) : displayTods.map((tod) => {
              const rows = displayGroups.get(tod) ?? [];
              return (
                <div key={tod} style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--fcc-bg)', minWidth: 0 }}>
                  {config.showTimeOfDay && (
                    <TimeBandHeader tod={tod} fontSize={bandLabelSize} currentTod={currentTod} style={{ height: headerHeight, boxSizing: 'border-box', alignItems: 'flex-end', padding: `0 ${pad * 0.5}px ${bandLabelSize * 0.3}px`, borderBottom: '1px solid var(--fcc-border-sub)', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, overflowY: listOverflows ? 'auto' : 'hidden', padding: `0 ${pad * 0.5}px`, scrollbarWidth: 'none', touchAction: 'pan-y' }}>
                    {rows.map((row, i) => (
                      <ChoreRowItem key={row.choreId} row={row} fontSize={nameSize} dotSize={dotSize} rowHeight={rowHeight} rowWidth={rowWidth} stacked={stackedRows} isFirst={i === 0} showPoints={config.showPoints} memberMap={memberMap} initialsMap={initialsMap} allowTouch={allowTouch} onToggle={handleToggle} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {weekBottom && (
            <div style={{ flexShrink: 0, margin: `0 ${pad}px`, borderTop: '1px solid var(--fcc-border-sub)' }}>{weekBottom}</div>
          )}
          {footer}
        </>
      ) : (
        <>
          {/* Portrait header: day + date left, completion + rewards right. */}
          <div style={{ padding: `${pad}px ${pad}px 0`, flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: pad }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 22 * k, fontWeight: 600, color: 'var(--fcc-text-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {dayName}
                </div>
                <div style={{ fontSize: 46 * k, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--fcc-text)', marginTop: 2 * k, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {dateStr}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 * k, flexShrink: 0 }}>
                <div style={{ fontSize: 64 * k, fontWeight: 800, color: 'var(--fcc-accent)', lineHeight: 1, letterSpacing: '-0.02em' }}>
                  {overallPct}<span style={{ fontSize: 28 * k, color: 'var(--fcc-text-2)', fontWeight: 700 }}>%</span>
                </div>
                <div style={{ fontSize: 16 * k, fontWeight: 600, color: 'var(--fcc-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {t('fullscreen-chore-chart.complete')}
                </div>
                {rewardsButton}
              </div>
            </div>
            <div style={{ height: 10 * k, background: 'var(--fcc-border-sub)', borderRadius: 5 * k, overflow: 'hidden', marginTop: 18 * k }}>
              <div style={{ height: '100%', background: 'var(--fcc-accent)', borderRadius: 5 * k, width: `${overallPct}%`, transition: 'width 0.5s ease' }} />
            </div>
          </div>
          <div style={{ padding: `${24 * k}px ${pad}px`, flexShrink: 0, borderBottom: '1px solid var(--fcc-border-sub)' }}>
            <MemberStrip members={members} memberStats={memberStats} weekData={weekData} detail={chipDetail} c={chipScale} gap={14 * k} showStreaks={config.showStreaks} showPoints={config.showPoints} availableWidth={memberStripWidth} />
          </div>

          {/* The list: every pixel between the chips and the week block. */}
          <div
            ref={listRef}
            data-testid="fcc-list"
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              // Rows at the cap leave slack; spread it between the bands
              // rather than pooling it at the bottom.
              justifyContent: listOverflows || displayTods.length === 0 ? 'flex-start' : 'space-evenly',
              overflowY: listOverflows ? 'auto' : 'hidden',
              padding: `0 ${pad}px`,
              scrollbarWidth: 'none',
              touchAction: 'pan-y',
            }}
          >
            {displayTods.map((tod) => (
              <TimeBand
                key={tod}
                tod={tod}
                rows={displayGroups.get(tod) ?? []}
                fontSize={nameSize}
                dotSize={dotSize}
                rowHeight={rowHeight}
                headerHeight={headerHeight}
                headerFontSize={bandLabelSize}
                rowWidth={rowWidth}
                showHeader={config.showTimeOfDay}
                showPoints={config.showPoints}
                currentTod={currentTod}
                memberMap={memberMap}
                initialsMap={initialsMap}
                allowTouch={allowTouch}
                onToggle={handleToggle}
              />
            ))}
            {displayTods.length === 0 && emptyState}
          </div>

          {weekBottom && (
            <div style={{ flexShrink: 0, margin: `0 ${pad}px`, borderTop: '1px solid var(--fcc-border-sub)' }}>{weekBottom}</div>
          )}
          {footer}
        </>
      )}

      {/* Touch completion toasts — always rendered */}
      {allowTouch && <ChoreToast toasts={toasts} onDismiss={dismissToast} onUndo={handleUndo} />}
    </div>
  );
}
