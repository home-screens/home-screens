'use client';

import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useFullscreenDims } from '@/hooks/useFullscreenDims';
import { Sunrise, Sun, Sunset, Clock, Flame, Star, Check } from 'lucide-react';
import type { FullscreenChoreChartConfig, ModuleStyle, ChoreTimeOfDay } from '@/types/config';
import { getThemeTokens, migrateFromDarkMode, getTypoMultiplier, getDensityMultiplier, buildThemeCSSVars } from '@/lib/fullscreen-themes';
import { useChoreData } from '@/components/modules/chore-chart/useChoreData';
import {
  type ResolvedAssignment,
  DAY_NAMES_FULL,
  TIME_OF_DAY_META,
} from '@/components/modules/chore-chart/types';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import ChoreToast, { type ToastItem } from './ChoreToast';

// ─── Types ───

interface ChoreScale {
  bu: number;
  width: number;
  orientation: 'portrait' | 'landscape';
  densityMul: number;
  typoMul: number;
  isDark: boolean;
}

// ─── Helpers ───

function getOrientation(w: number, h: number): 'portrait' | 'landscape' {
  return h > w ? 'portrait' : 'landscape';
}


const TOD_ICONS: Record<ChoreTimeOfDay, typeof Sunrise> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  anytime: Clock,
};

const TOD_ORDER: ChoreTimeOfDay[] = ['morning', 'afternoon', 'evening', 'anytime'];

/** Compute shortest unique initial for each member. Uses first letter when
 *  unique; extends to 2–3 characters only where collisions exist. */
function getUniqueInitials(memberList: { id: string; name: string }[]): Map<string, string> {
  const result = new Map<string, string>();
  let remaining = [...memberList];

  for (let len = 1; len <= 3 && remaining.length > 0; len++) {
    const groups = new Map<string, typeof remaining>();
    for (const m of remaining) {
      const prefix = m.name.slice(0, len);
      const group = groups.get(prefix) ?? [];
      group.push(m);
      groups.set(prefix, group);
    }

    const next: typeof remaining = [];
    for (const [prefix, group] of groups) {
      if (group.length === 1) {
        result.set(group[0].id, prefix);
      } else {
        next.push(...group);
      }
    }
    remaining = next;
  }
  // Any still-colliding names get a 3-char prefix
  for (const m of remaining) {
    result.set(m.id, m.name.slice(0, 3));
  }
  return result;
}

function getCurrentTimeOfDay(hour: number): ChoreTimeOfDay | null {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 24) return 'evening';
  return null;
}

/** Group today's assignments by time-of-day, then deduplicate chores
 *  (a chore assigned to 3 people becomes one row with 3 assignee dots). */
interface ChoreRow {
  choreId: string;
  choreName: string;
  choreEmoji: string;
  timeOfDay: ChoreTimeOfDay;
  points: number;
  assignees: { memberId: string; isCompleted: boolean }[];
}

function buildChoreRows(assignments: ResolvedAssignment[]): Map<ChoreTimeOfDay, ChoreRow[]> {
  const choreMap = new Map<string, ChoreRow>();

  for (const a of assignments) {
    const existing = choreMap.get(a.chore.id);
    if (existing) {
      existing.assignees.push({ memberId: a.memberId, isCompleted: a.isCompleted });
    } else {
      choreMap.set(a.chore.id, {
        choreId: a.chore.id,
        choreName: a.chore.name,
        choreEmoji: a.chore.emoji,
        timeOfDay: a.chore.timeOfDay,
        points: a.chore.points,
        assignees: [{ memberId: a.memberId, isCompleted: a.isCompleted }],
      });
    }
  }

  const groups = new Map<ChoreTimeOfDay, ChoreRow[]>();
  for (const row of choreMap.values()) {
    const existing = groups.get(row.timeOfDay) ?? [];
    // Sort assignees: completed first
    row.assignees.sort((a, b) => (a.isCompleted === b.isCompleted ? 0 : a.isCompleted ? -1 : 1));
    existing.push(row);
    groups.set(row.timeOfDay, existing);
  }
  return groups;
}

// ─── Props ───

interface FullscreenChoreChartModuleProps {
  config: FullscreenChoreChartConfig;
  style: ModuleStyle;
  fullscreenTheme?: string;
}

// ─── Component ───

export default function FullscreenChoreChartModule({
  config,
  style: _style,
  fullscreenTheme,
}: FullscreenChoreChartModuleProps) {
  const { containerRef, dims } = useFullscreenDims();

  const themeId = config.theme ?? fullscreenTheme ?? migrateFromDarkMode(config.darkMode);
  const theme = getThemeTokens(themeId);

  const scale: ChoreScale = useMemo(() => ({
    bu: Math.min(dims.w, dims.h) / 100,
    width: dims.w,
    orientation: getOrientation(dims.w, dims.h),
    densityMul: getDensityMultiplier(config.density),
    typoMul: getTypoMultiplier(config.typographySize),
    isDark: theme.isDark,
  }), [dims, config.density, config.typographySize, theme.isDark]);

  const { todayAssignments, memberStats, weekData, members, toggleComplete } = useChoreData(config);
  const allowTouch = config.allowDisplayComplete ?? true;
  const currentTod = getCurrentTimeOfDay(new Date().getHours());

  // Toast state for completion feedback
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);
  const toastsRef = useRef(toasts);
  useEffect(() => { toastsRef.current = toasts; }, [toasts]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleToggle = useCallback((choreId: string, memberId: string, choreName: string, memberName: string, memberColor: string, wasCompleted: boolean) => {
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

  // Date
  const today = new Date();
  const dayName = DAY_NAMES_FULL[today.getDay()];
  const dateStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Member lookup
  const memberMap = useMemo(() => {
    const map = new Map<string, (typeof members)[number]>();
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members]);

  // Disambiguated initials (fallback when member has no emoji)
  const initialsMap = useMemo(() => getUniqueInitials(members), [members]);

  const isLandscape = scale.orientation === 'landscape';
  const s = scale.bu * scale.typoMul;
  const d = scale.densityMul; // spacing multiplier: cozy=1.2, snug=1.0

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

  // ── Render helpers ──

  function renderAssigneeDot(
    assignee: { memberId: string; isCompleted: boolean },
    dotSize: number,
    choreId: string,
    choreName: string,
  ) {
    const member = memberMap.get(assignee.memberId);
    if (!member) return null;
    const iconSz = dotSize * 0.55;
    const initial = initialsMap.get(assignee.memberId) ?? member.name[0];

    if (assignee.isCompleted) {
      return (
        <div
          key={assignee.memberId}
          className={allowTouch ? 'press-dot' : undefined}
          role={allowTouch ? 'button' : undefined}
          tabIndex={allowTouch ? 0 : undefined}
          onClick={allowTouch ? () => handleToggle(choreId, assignee.memberId, choreName, member.name, member.color, assignee.isCompleted) : undefined}
          aria-label={allowTouch ? `Undo ${choreName} for ${member.name}` : undefined}
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: '50%',
            background: member.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: allowTouch ? 'pointer' : 'default',
          }}
        >
          <Check size={iconSz} color="white" strokeWidth={3} />
        </div>
      );
    }
    return (
      <div
        key={assignee.memberId}
        className={allowTouch ? 'press-dot' : undefined}
        role={allowTouch ? 'button' : undefined}
        tabIndex={allowTouch ? 0 : undefined}
        onClick={allowTouch ? () => handleToggle(choreId, assignee.memberId, choreName, member.name, member.color, assignee.isCompleted) : undefined}
        aria-label={allowTouch ? `Complete ${choreName} for ${member.name}` : undefined}
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          border: `2px solid ${member.color}`,
          opacity: 0.4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: member.color,
          fontSize: dotSize * (initial.length > 1 ? 0.32 : 0.4),
          fontWeight: 700,
          cursor: allowTouch ? 'pointer' : 'default',
        }}
      >
        {initial}
      </div>
    );
  }

  function renderChoreRow(row: ChoreRow, fontSize: number, dotSize: number, isFirst: boolean) {
    return (
      <div
        key={row.choreId}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: `${fontSize * 0.4}px ${fontSize * 0.3}px`,
          gap: fontSize * 0.6,
          borderTop: isFirst ? 'none' : '1px solid var(--fcc-border-sub)',
        }}
      >
        {row.choreEmoji && (
          <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <ChoreIcon value={row.choreEmoji} size={fontSize * 1.15} color="var(--fcc-text-2)" />
          </span>
        )}
        <span
          style={{
            flex: 1,
            fontSize,
            fontWeight: 500,
            color: 'var(--fcc-text)',
            minWidth: 0,
          }}
        >
          {row.choreName}
          {config.showPoints && row.points > 1 && (
            <span style={{ fontSize: fontSize * 0.7, color: 'var(--fcc-text-2)', fontWeight: 600, marginLeft: fontSize * 0.3 }}>
              {row.points}pt
            </span>
          )}
        </span>
        <div style={{ display: 'flex', gap: Math.max(dotSize * 0.2, 8), flexShrink: 0 }}>
          {row.assignees.map((a) => renderAssigneeDot(a, dotSize, row.choreId, row.choreName))}
        </div>
      </div>
    );
  }

  function renderTimeBand(tod: ChoreTimeOfDay, rows: ChoreRow[], fontSize: number, dotSize: number, showHeader: boolean) {
    const TodIcon = TOD_ICONS[tod];
    const isCurrent = tod === currentTod;
    const meta = TIME_OF_DAY_META[tod];
    const iconSize = fontSize * 1.1;
    const headerColor = isCurrent ? 'var(--fcc-accent)' : 'var(--fcc-text-3)';

    return (
      <div key={tod}>
        {showHeader && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: fontSize * 0.4,
              padding: `${fontSize * 0.6}px ${fontSize * 0.3}px ${fontSize * 0.3}px`,
            }}
          >
            <TodIcon size={iconSize} color={headerColor} strokeWidth={2} />
            <span
              style={{
                fontSize: fontSize * 0.8,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: headerColor,
              }}
            >
              {meta.label}
            </span>
          </div>
        )}
        {rows.map((row, i) => renderChoreRow(row, fontSize, dotSize, i === 0))}
      </div>
    );
  }

  function renderMemberStrip(chipHeight: number, gap: number, containerStyle?: React.CSSProperties) {
    // Calculate how many chips fit per row: each chip needs at least chipHeight * 2.2 width for name + avatar
    const minChipWidth = chipHeight * 2.6;
    // Estimate available width (landscape: members strip gets ~65%, portrait: full width minus padding)
    const availableWidth = scale.orientation === 'landscape'
      ? scale.width * 0.65
      : scale.width - pad * 2;
    const perRow = Math.max(1, Math.floor((availableWidth + gap) / (minChipWidth + gap)));
    const rows: string[][] = [];
    for (let i = 0; i < members.length; i += perRow) {
      rows.push(members.slice(i, i + perRow).map((m) => m.id));
    }
    // Evenly distribute: if last row has fewer items, re-balance across rows
    const rowCount = rows.length;
    let balanced = rows;
    if (rowCount > 1) {
      const itemsPerRow = Math.ceil(members.length / rowCount);
      balanced = [];
      for (let i = 0; i < members.length; i += itemsPerRow) {
        balanced.push(members.slice(i, i + itemsPerRow).map((m) => m.id));
      }
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap, ...containerStyle }}>
        {balanced.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap }}>
            {row.map((id) => renderMemberChip(id, chipHeight))}
          </div>
        ))}
      </div>
    );
  }

  function renderMemberChip(memberId: string, chipHeight: number) {
    const member = memberMap.get(memberId);
    if (!member) return null;
    const stats = memberStats.get(memberId);
    const avatarSize = chipHeight * 0.65;
    const nameFontSize = chipHeight * 0.24;
    const statFontSize = chipHeight * 0.19;

    return (
      <div
        key={memberId}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: chipHeight * 0.2,
          padding: `${chipHeight * 0.15}px ${chipHeight * 0.2}px`,
          background: 'var(--fcc-surface)',
          borderRadius: chipHeight * 0.2,
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: avatarSize,
            height: avatarSize,
            borderRadius: '50%',
            background: member.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <ChoreIcon value={member.emoji} size={avatarSize * 0.5} color="white" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: nameFontSize, fontWeight: 600, color: 'var(--fcc-text)' }}>
            {member.name}
          </div>
          <div style={{ fontSize: statFontSize, color: 'var(--fcc-text-2)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 3 }}>
            {config.showStreaks && stats && stats.streak > 0 && (
              <span style={{ color: 'var(--fcc-accent)', display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                <Flame size={statFontSize} /> {stats.streak}
                <span style={{ color: 'var(--fcc-text-2)', margin: '0 2px' }}>&middot;</span>
              </span>
            )}
            {stats?.completed ?? 0}/{stats?.total ?? 0}
          </div>
          {/* Mini progress bar */}
          <div style={{ height: chipHeight * 0.05, background: 'var(--fcc-border)', borderRadius: 2, marginTop: chipHeight * 0.05, width: '100%', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, background: member.color, width: `${stats?.percentage ?? 0}%` }} />
          </div>
        </div>
      </div>
    );
  }

  function renderStarChart(chartHeight: number) {
    const nameWidth = chartHeight * 0.55;
    const starSize = chartHeight * 0.14;
    const labelSize = chartHeight * 0.1;

    return (
      <div style={{ padding: `${chartHeight * 0.1}px 0` }}>
        <div style={{ fontSize: labelSize, fontWeight: 700, color: 'var(--fcc-text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: chartHeight * 0.08 }}>
          This Week
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `${nameWidth}px repeat(7, 1fr)`, gap: 1, alignItems: 'center' }}>
          {/* Day headers */}
          <div />
          {weekData.map((day) => (
            <div key={day.date} style={{ fontSize: labelSize * 0.9, fontWeight: 600, color: day.isToday ? 'var(--fcc-accent)' : 'var(--fcc-text-3)', textAlign: 'center' }}>
              {day.dayName}
            </div>
          ))}
          {/* Member rows */}
          {members.map((member) => (
            <React.Fragment key={member.id}>
              <div style={{ fontSize: labelSize, fontWeight: 500, color: 'var(--fcc-text-2)' }}>
                {member.name}
              </div>
              {weekData.map((day) => {
                const earned = day.memberStars[member.id];
                return (
                  <div key={day.date} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: starSize * 1.5 }}>
                    <Star
                      size={starSize}
                      color={earned ? member.color : 'var(--fcc-text-3)'}
                      fill={earned ? member.color : 'none'}
                      strokeWidth={earned ? 0 : 1.5}
                    />
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }

  // ── Layout ──

  const pad = s * 2 * d;

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

      {/* ── Header + Members ── */}
      {isLandscape ? (
        /* Landscape: single top bar with date block | member chips */
        <div style={{ display: 'flex', alignItems: 'stretch', padding: `${s * 1}px ${pad}px`, gap: s * 1.4, borderBottom: '1px solid var(--fcc-border-sub)', flexShrink: 0 }}>
          {/* Date block */}
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
            </div>
          </div>
          {/* Members strip */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            {renderMemberStrip(s * 4, s * 0.7)}
          </div>
        </div>
      ) : (
        /* Portrait: date/percentage header + separate members row */
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
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: s * 2.5, fontWeight: 800, color: 'var(--fcc-accent)', lineHeight: 1 }}>
                  {overallPct}<span style={{ fontSize: s * 1.2, color: 'var(--fcc-text-2)' }}>%</span>
                </div>
                <div style={{ fontSize: s * 0.85, fontWeight: 500, color: 'var(--fcc-text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Complete
                </div>
              </div>
            </div>
            {/* Overall progress bar */}
            <div style={{ height: s * 0.35, background: 'var(--fcc-border-sub)', borderRadius: s * 0.2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--fcc-accent)', borderRadius: s * 0.2, width: `${overallPct}%`, transition: 'width 0.5s ease' }} />
            </div>
          </div>
          <div style={{ padding: `${s * 0.8}px ${pad}px`, flexShrink: 0, borderBottom: '1px solid var(--fcc-border-sub)' }}>
            {renderMemberStrip(s * 5.5, s * 0.7)}
          </div>
        </>
      )}

      {/* ── Chore Content ── */}
      {isLandscape ? (
        /* Landscape: 3 time-of-day columns side by side */
        <div style={{ flex: 1, display: 'flex', gap: 1, background: 'var(--fcc-surface)', minHeight: 0, overflow: 'hidden' }}>
          {displayTods.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--fcc-bg)' }}>
              <div style={{ textAlign: 'center', color: 'var(--fcc-text-2)', fontSize: s * 1.5 }}>
                No chores today
              </div>
            </div>
          ) : displayTods.map((tod) => {
            const rows = displayGroups.get(tod) ?? [];
            const TodIcon = TOD_ICONS[tod];
            const isCurrent = tod === currentTod;
            const headerColor = isCurrent ? 'var(--fcc-accent)' : 'var(--fcc-text-3)';
            const fontSize = s * 1.15;
            const dotSize = s * 2.2;
            const iconSize = fontSize * 1.1;

            return (
              <div
                key={tod}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'var(--fcc-bg)',
                  minWidth: 0,
                }}
              >
                {/* Column header */}
                {config.showTimeOfDay && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: fontSize * 0.4,
                    padding: `${fontSize * 0.6}px ${fontSize * 0.8}px`,
                    borderBottom: '1px solid var(--fcc-border-sub)',
                    flexShrink: 0,
                  }}>
                    <TodIcon size={iconSize} color={headerColor} strokeWidth={2} />
                    <span style={{ fontSize: fontSize * 0.8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: headerColor }}>
                      {TIME_OF_DAY_META[tod].label}
                    </span>
                  </div>
                )}
                {/* Column body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: `${fontSize * 0.3}px ${fontSize * 0.5}px`, scrollbarWidth: 'none', touchAction: 'manipulation' }}>
                  {rows.map((row, i) => renderChoreRow(row, fontSize, dotSize, i === 0))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Portrait: stacked time-of-day bands */
        <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${pad}px`, scrollbarWidth: 'none', minHeight: 0, touchAction: 'manipulation' }}>
          {displayTods.map((tod) => {
            const rows = displayGroups.get(tod) ?? [];
            const fontSize = s * 1.2;
            const dotSize = s * 2.5;
            return renderTimeBand(tod, rows, fontSize, dotSize, config.showTimeOfDay);
          })}
          {displayTods.length === 0 && (
            <div style={{ textAlign: 'center', padding: `${s * 8}px 0`, color: 'var(--fcc-text-2)', fontSize: s * 1.5 }}>
              No chores today
            </div>
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
          {renderStarChart(isLandscape ? s * 7 : s * 9)}
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
              Weekly points: <span style={{ color: 'var(--fcc-text-2)', fontWeight: 600 }}>
                {Array.from(memberStats.values()).reduce((sum, ms) => sum + ms.weeklyPoints, 0)} / {Array.from(memberStats.values()).reduce((sum, ms) => sum + ms.weeklyPointsTotal, 0)}
              </span>
            </div>
          )}
          {config.showStreaks && (
            <div style={{ fontSize: s * 0.9, color: 'var(--fcc-text-3)', fontWeight: 500 }}>
              Best streak: <span style={{ color: 'var(--fcc-text-2)', fontWeight: 600 }}>
                {(() => {
                  let best = { name: '', streak: 0 };
                  for (const m of members) {
                    const ms = memberStats.get(m.id);
                    if (ms && ms.streak > best.streak) best = { name: m.name, streak: ms.streak };
                  }
                  return best.streak > 0 ? `${best.name} — ${best.streak} days` : 'None';
                })()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Touch completion toasts */}
      {allowTouch && <ChoreToast toasts={toasts} onDismiss={dismissToast} onUndo={handleUndo} />}
    </div>
  );
}
