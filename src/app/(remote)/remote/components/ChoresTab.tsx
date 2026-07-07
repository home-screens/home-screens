'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { Sunrise, Sun, Sunset, Clock, Settings } from 'lucide-react';
import type {
  ChoreChartConfig,
  ChoreMember,
  ChoreDefinition,
  ChoreCompletion,
  ChoreTimeOfDay,
  ChoreToggleRequest,
  ChoreToggleResponse,
} from '@/types/config';
import {
  resolveAssignee,
  choreAppliesToday,
  completionKey,
  todayStr,
  TIME_OF_DAY_META,
  getTimeOfDayLabelKey,
  getCurrentTimeOfDay,
} from '@/components/modules/chore-chart/types';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate, useFormattingLocale } from '@/i18n';
import ChoreHistoryNav from './ChoreHistoryNav';
import ChoreHistoryBanner from './ChoreHistoryBanner';
import ChoreRow from './ChoreRow';
import ChoresManageView from './ChoresManageView';
import RewardsView from './RewardsView';
import { logger } from '@/lib/logger';

const log = logger('chores');

const TOD_ICONS: Record<ChoreTimeOfDay, typeof Sunrise> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  anytime: Clock,
};

interface ChoresTabProps {
  config: ChoreChartConfig;
  /** When false, hides Manage sub-view and restricts Rewards to redeem/history only. */
  isAdmin?: boolean;
}

export default function ChoresTab({ config, isAdmin = false }: ChoresTabProps) {
  const locale = useFormattingLocale();
  const t = useTranslate('remote');
  const tModules = useTranslate('modules');
  // ── Lifted state (shared between Today + Manage views) ──
  const [members, setMembers] = useState<ChoreMember[]>(config.members ?? []);
  const [chores, setChores] = useState<ChoreDefinition[]>(config.chores ?? []);
  const [subView, setSubView] = useState<'today' | 'manage' | 'rewards'>('today');
  const accentColor = config.accentColor ?? '#f59e0b';

  // Debounced auto-save. `skipInitial` skips the first effect run after mount
  // (initial state comes from props), and `flushOnUnmount` ensures any pending
  // save in the debounce window runs before the component unmounts.
  useDebouncedSave({
    values: [members, chores],
    flushOnUnmount: true,
    save: () =>
      editorFetch('/api/chores/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members,
          chores,
          force: members.length === 0 && chores.length === 0,
        }),
      }),
  });


  // ── Today view state ──
  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.id ?? '');
  const [completions, setCompletions] = useState<ChoreCompletion[]>([]);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  // Last warning surfaced from POST /api/chores (e.g. balance went negative on un-complete).
  // Rendered as a dismissible banner so the admin gets in-UI feedback without DevTools.
  const [lastWarning, setLastWarning] = useState<string | null>(null);

  // Track mounted state so in-flight fetches don't setState after unmount.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Each new poll cancels the previous in-flight poll.
  const fetchAbortRef = useRef<AbortController | null>(null);

  // Keep selectedMemberId valid when members change
  useEffect(() => {
    if (members.length > 0 && !members.find((m) => m.id === selectedMemberId)) {
      setSelectedMemberId(members[0].id);
    }
  }, [members, selectedMemberId]);

  // Fetch completions
  const fetchCompletions = useCallback(async () => {
    // Cancel any prior in-flight poll
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    try {
      const res = await editorFetch('/api/chores', { signal: controller.signal });
      if (!res.ok) return;
      const data = await res.json();
      if (!isMountedRef.current || controller.signal.aborted) return;
      setCompletions((prev) => {
        const next: ChoreCompletion[] = data.completions ?? [];
        if (
          prev.length === next.length &&
          prev.every((c, i) => {
            const n = next[i];
            return c.choreId === n.choreId && c.memberId === n.memberId && c.date === n.date;
          })
        ) {
          return prev; // identity-stable when content unchanged
        }
        return next;
      });
    } catch { /* silent (includes AbortError) */ }
  }, []);

  useEffect(() => {
    fetchCompletions();
    const interval = setInterval(fetchCompletions, 15_000);
    return () => {
      clearInterval(interval);
      fetchAbortRef.current?.abort();
    };
  }, [fetchCompletions]);

  // Re-render at midnight and advance the viewing window if the user is on "today"
  // Both initial values come from a single snapshot so they can't straddle midnight.
  const initialDate = useRef(todayStr()).current;
  const [dateKey, setDateKey] = useState(initialDate);
  const [viewingDate, setViewingDate] = useState<string>(initialDate);
  useEffect(() => {
    const check = () => {
      const now = todayStr();
      if (now !== dateKey) {
        setDateKey(now);
        // If the user was parked on what used to be today, walk them forward.
        // If they're explicitly viewing a past day, leave them alone.
        setViewingDate((prev) => (prev === dateKey ? now : prev));
      }
    };
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, [dateKey]);

  const realToday = dateKey;
  const isViewingPast = viewingDate !== realToday;
  const canEdit = !isViewingPast || isAdmin;

  // Completion lookup
  const completionSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of completions) {
      set.add(completionKey(c.choreId, c.memberId, c.date));
    }
    return set;
  }, [completions]);

  // Assignments for the selected member on the currently-viewed date
  const myAssignments = useMemo(() => {
    const day = viewingDate;
    const dayOfWeek = new Date(day + 'T00:00:00').getDay();
    const assignments: { choreId: string; choreName: string; choreEmoji: string; timeOfDay: ChoreTimeOfDay; points: number; isCompleted: boolean }[] = [];

    for (const chore of chores) {
      if (!choreAppliesToday(chore, dayOfWeek, day)) continue;
      const assignees = resolveAssignee(chore, day);
      if (!assignees.includes(selectedMemberId)) continue;

      assignments.push({
        choreId: chore.id,
        choreName: chore.name,
        choreEmoji: chore.emoji,
        timeOfDay: chore.timeOfDay,
        points: chore.points,
        isCompleted: completionSet.has(completionKey(chore.id, selectedMemberId, day)),
      });
    }

    return assignments.sort((a, b) => {
      const orderA = TIME_OF_DAY_META[a.timeOfDay].order;
      const orderB = TIME_OF_DAY_META[b.timeOfDay].order;
      if (orderA !== orderB) return orderA - orderB;
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
      return 0;
    });
  }, [chores, viewingDate, selectedMemberId, completionSet]);

  // Group by time of day
  const grouped = useMemo(() => {
    const groups = new Map<ChoreTimeOfDay, typeof myAssignments>();
    for (const a of myAssignments) {
      const existing = groups.get(a.timeOfDay) ?? [];
      existing.push(a);
      groups.set(a.timeOfDay, existing);
    }
    return groups;
  }, [myAssignments]);

  const totalDone = myAssignments.filter((a) => a.isCompleted).length;
  const totalCount = myAssignments.length;

  // Per-member completion counts for tabs (on the currently-viewed date)
  const memberTabStats = useMemo(() => {
    const day = viewingDate;
    const dayOfWeek = new Date(day + 'T00:00:00').getDay();
    const stats: Record<string, { total: number; done: number }> = {};
    for (const member of members) {
      let total = 0;
      let done = 0;
      for (const c of chores) {
        if (!choreAppliesToday(c, dayOfWeek, day)) continue;
        if (!resolveAssignee(c, day).includes(member.id)) continue;
        total++;
        if (completionSet.has(completionKey(c.id, member.id, day))) done++;
      }
      stats[member.id] = { total, done };
    }
    return stats;
  }, [members, chores, viewingDate, completionSet]);

  // Toggle completion — accepts the viewing date so backdated edits hit the right day
  const toggle = async (choreId: string) => {
    if (!canEdit) return; // kids viewing a past day can't edit
    const day = viewingDate;
    const key = completionKey(choreId, selectedMemberId, day);
    setToggling((prev) => new Set(prev).add(key));

    // Optimistic update
    setCompletions((prev) => {
      const idx = prev.findIndex(
        (c) => c.choreId === choreId && c.memberId === selectedMemberId && c.date === day,
      );
      if (idx >= 0) {
        return prev.filter((_, i) => i !== idx);
      }
      return [...prev, { choreId, memberId: selectedMemberId, date: day }];
    });

    try {
      const reqBody: ChoreToggleRequest = {
        choreId,
        memberId: selectedMemberId,
        date: day,
      };
      const res = await editorFetch('/api/chores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) throw new Error('Failed to toggle');
      const data: ChoreToggleResponse = await res.json();
      if (!isMountedRef.current) return;
      setCompletions(data.completions ?? []);
      if (data.warning) {
        log.warn(data.warning);
        setLastWarning(data.warning);
      }
    } catch {
      if (isMountedRef.current) fetchCompletions();
    } finally {
      if (isMountedRef.current) {
        setToggling((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    }
  };

  const selectedMember = members.find((m) => m.id === selectedMemberId);
  const dayName = (() => {
    const [y, m, d] = viewingDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'long' });
  })();
  const currentTimeOfDay = getCurrentTimeOfDay(new Date().getHours());

  return (
    <div>
      {/* Day header */}
      <div style={{ padding: '12px 0 4px' }}>
        <div style={{ fontSize: 12, color: 'var(--hs-text-faint)' }}>{dayName}</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--hs-text-primary)' }}>{t('choresTab.header')}</h2>
      </div>

      {/* Sub-nav: Today / Manage / Rewards */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: 3,
          background: 'var(--hs-bg-card)',
          borderRadius: 10,
          marginTop: 12,
          marginBottom: 16,
        }}
      >
        {(isAdmin ? ['today', 'manage', 'rewards'] as const : ['today', 'rewards'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setSubView(v)}
            style={{
              flex: 1,
              padding: '8px 12px',
              minHeight: 40,
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s',
              background: subView === v ? 'var(--hs-bg-hover)' : 'transparent',
              color: subView === v ? 'var(--hs-text-body)' : 'var(--hs-text-faint)',
            }}
          >
            {t(`choresTab.subNav.${v}`)}
          </button>
        ))}
      </div>

      {subView === 'rewards' ? (
        <RewardsView members={members} accentColor={accentColor} isAdmin={isAdmin} />
      ) : subView === 'manage' ? (
        <ChoresManageView
          members={members}
          chores={chores}
          onMembersChange={setMembers}
          onChoresChange={setChores}
        />
      ) : members.length === 0 || chores.length === 0 ? (
        /* Empty state */
        <div style={{ textAlign: 'center', padding: '48px 16px' }}>
          <Settings size={40} color="var(--hs-border-strong)" style={{ marginBottom: 16 }} />
          <p style={{ fontSize: 15, color: 'var(--hs-text-faint)', marginBottom: 4 }}>{t('choresTab.empty.title')}</p>
          <p style={{ fontSize: 13, color: 'var(--hs-text-faint)', marginBottom: 20 }}>
            {t('choresTab.empty.description')}
          </p>
          <button
            onClick={() => setSubView('manage')}
            style={{
              padding: '10px 24px',
              minHeight: 44,
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              background: accentColor,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {t('choresTab.empty.setUpButton')}
          </button>
        </div>
      ) : (
        <>
          {/* Server-side warning banner — e.g. balance went negative after an un-complete.
              Dismissible so admins acknowledge it explicitly. */}
          {lastWarning && (
            <div
              role="alert"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '12px 14px',
                background: 'color-mix(in srgb, var(--hs-danger) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--hs-danger) 30%, transparent)',
                borderRadius: 10,
                marginBottom: 10,
                fontSize: 13,
                color: 'var(--hs-danger)',
                lineHeight: 1.4,
              }}
            >
              <span style={{ flex: 1 }}>{lastWarning}</span>
              <button
                type="button"
                onClick={() => setLastWarning(null)}
                aria-label={t('choresTab.warningDismissAriaLabel')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--hs-danger)',
                  cursor: 'pointer',
                  fontSize: 16,
                  lineHeight: 1,
                  padding: '0 4px',
                  fontWeight: 700,
                }}
              >
                ×
              </button>
            </div>
          )}

          {/* Day history strip */}
          <ChoreHistoryNav
            viewingDate={viewingDate}
            realToday={realToday}
            members={members}
            chores={chores}
            completionSet={completionSet}
            accentColor={accentColor}
            onSelect={setViewingDate}
          />

          {/* History banner — visible only when the user has navigated away from today */}
          {isViewingPast && (
            <ChoreHistoryBanner viewingDate={viewingDate} realToday={realToday} canEdit={canEdit} />
          )}

          {/* Member pills */}
          <div style={{ display: 'flex', gap: 6, padding: '12px 0', overflowX: 'auto', scrollbarWidth: 'none' as const }}>
            {members.map((member) => {
              const isActive = member.id === selectedMemberId;
              const tabStats = memberTabStats[member.id];
              const allDone = (tabStats?.total ?? 0) > 0 && tabStats?.done === tabStats?.total;

              return (
                <button
                  key={member.id}
                  className="press-scale"
                  onClick={() => setSelectedMemberId(member.id)}
                  aria-label={
                    allDone
                      ? t('choresTab.memberAriaLabelAllDone', { name: member.name })
                      : t('choresTab.memberAriaLabel', { name: member.name })
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    minHeight: 44,
                    borderRadius: 999,
                    border: `2px solid ${isActive ? member.color : 'transparent'}`,
                    background: isActive ? `color-mix(in srgb, ${member.color} 15%, transparent)` : 'var(--hs-bg-card)',
                    color: isActive ? member.color : 'var(--hs-text-muted)',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    flexShrink: 0,
                    whiteSpace: 'nowrap' as const,
                    transition: 'all 0.15s',
                  }}
                >
                  {member.emoji ? (
                    <ChoreIcon value={member.emoji} size={18} color={isActive ? member.color : 'var(--hs-text-muted)'} />
                  ) : (
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{member.name[0]}</span>
                  )}
                  <span>{member.name}</span>
                  {allDone && <span style={{ fontSize: 12, marginLeft: -2 }}>&#10003;</span>}
                </button>
              );
            })}
          </div>

          {/* Progress */}
          <div style={{ padding: '0 0 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--hs-text-faint)' }}>
                {t('choresTab.progress.completion', { done: totalDone, total: totalCount })}
              </span>
              {totalCount > 0 && totalDone === totalCount && (
                <span style={{ fontSize: 13, color: 'var(--hs-success)', fontWeight: 500 }}>{t('choresTab.progress.allDone')}</span>
              )}
            </div>
            <div style={{ height: 8, background: 'var(--hs-border)', borderRadius: 4, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: 4,
                  width: totalCount > 0 ? `${(totalDone / totalCount) * 100}%` : '0%',
                  backgroundColor: selectedMember?.color ?? accentColor,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>

          {/* Chore list */}
          <div style={{ paddingBottom: 80 }}>
            {myAssignments.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <p style={{ fontSize: 14, color: 'var(--hs-text-faint)' }}>{t('choresTab.noChoresToday')}</p>
              </div>
            )}

            {(['morning', 'afternoon', 'evening', 'anytime'] as ChoreTimeOfDay[]).map((section) => {
              const items = grouped.get(section);
              if (!items?.length) return null;

              const TodIcon = TOD_ICONS[section];
              const isCurrent = !isViewingPast && section === currentTimeOfDay;
              const sectionAllDone = items.every((a) => a.isCompleted);

              return (
                <div key={section} style={{ marginBottom: 16 }}>
                  {/* Section header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0' }}>
                    <TodIcon size={16} color={isCurrent ? accentColor : 'var(--hs-text-faint)'} strokeWidth={2} />
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.08em',
                        color: isCurrent ? accentColor : 'var(--hs-text-faint)',
                      }}
                    >
                      {tModules(getTimeOfDayLabelKey(section))}
                    </span>
                    {sectionAllDone && (
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--hs-success)' }}>&#10003;</span>
                    )}
                  </div>

                  {/* Chore cards */}
                  {items.map((assignment) => {
                    const key = completionKey(assignment.choreId, selectedMemberId, viewingDate);
                    return (
                      <ChoreRow
                        key={assignment.choreId}
                        assignment={assignment}
                        isToggling={toggling.has(key)}
                        readOnly={!canEdit}
                        checkedColor={selectedMember?.color ?? accentColor}
                        showPoints={!!config.showPoints}
                        onToggle={() => toggle(assignment.choreId)}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
