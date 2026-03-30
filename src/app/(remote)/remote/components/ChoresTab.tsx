'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Sunrise, Sun, Sunset, Clock, Check } from 'lucide-react';
import type { ChoreChartConfig, ChoreCompletion, ChoreTimeOfDay } from '@/types/config';
import {
  resolveAssignee,
  choreAppliesToday,
  completionKey,
  todayStr,
  TIME_OF_DAY_META,
  getCurrentTimeOfDay,
} from '@/components/modules/chore-chart/types';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';

const TOD_ICONS: Record<ChoreTimeOfDay, typeof Sunrise> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  anytime: Clock,
};

interface ChoresTabProps {
  config: ChoreChartConfig;
}

export default function ChoresTab({ config }: ChoresTabProps) {
  const members = useMemo(() => config.members ?? [], [config.members]);
  const chores = useMemo(() => config.chores ?? [], [config.chores]);
  const accentColor = config.accentColor ?? '#f59e0b';

  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.id ?? '');
  const [completions, setCompletions] = useState<ChoreCompletion[]>([]);
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  // Fetch completions
  const fetchCompletions = useCallback(async () => {
    try {
      const res = await fetch('/api/chores');
      if (!res.ok) return;
      const data = await res.json();
      setCompletions(data.completions ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchCompletions();
    const interval = setInterval(fetchCompletions, 15_000);
    return () => clearInterval(interval);
  }, [fetchCompletions]);

  // Re-render at midnight
  const [dateKey, setDateKey] = useState(todayStr);
  useEffect(() => {
    const check = () => {
      const now = todayStr();
      if (now !== dateKey) setDateKey(now);
    };
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, [dateKey]);

  // Completion lookup
  const completionSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of completions) {
      set.add(completionKey(c.choreId, c.memberId, c.date));
    }
    return set;
  }, [completions]);

  // Today's assignments for the selected member
  const myAssignments = useMemo(() => {
    const today = dateKey;
    const dayOfWeek = new Date(today + 'T00:00:00').getDay();
    const assignments: { choreId: string; choreName: string; choreEmoji: string; timeOfDay: ChoreTimeOfDay; points: number; isCompleted: boolean }[] = [];

    for (const chore of chores) {
      if (!choreAppliesToday(chore, dayOfWeek, today)) continue;
      const assignees = resolveAssignee(chore, today);
      if (!assignees.includes(selectedMemberId)) continue;

      assignments.push({
        choreId: chore.id,
        choreName: chore.name,
        choreEmoji: chore.emoji,
        timeOfDay: chore.timeOfDay,
        points: chore.points,
        isCompleted: completionSet.has(completionKey(chore.id, selectedMemberId, today)),
      });
    }

    return assignments.sort((a, b) => {
      const orderA = TIME_OF_DAY_META[a.timeOfDay].order;
      const orderB = TIME_OF_DAY_META[b.timeOfDay].order;
      if (orderA !== orderB) return orderA - orderB;
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
      return 0;
    });
  }, [chores, dateKey, selectedMemberId, completionSet]);

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

  // Per-member completion counts for tabs
  const memberTabStats = useMemo(() => {
    const today = dateKey;
    const dayOfWeek = new Date(today + 'T00:00:00').getDay();
    const stats: Record<string, { total: number; done: number }> = {};
    for (const member of members) {
      let total = 0;
      let done = 0;
      for (const c of chores) {
        if (!choreAppliesToday(c, dayOfWeek, today)) continue;
        if (!resolveAssignee(c, today).includes(member.id)) continue;
        total++;
        if (completionSet.has(completionKey(c.id, member.id, today))) done++;
      }
      stats[member.id] = { total, done };
    }
    return stats;
  }, [members, chores, dateKey, completionSet]);

  // Toggle completion
  const toggle = async (choreId: string) => {
    const today = todayStr();
    const key = completionKey(choreId, selectedMemberId, today);
    setToggling((prev) => new Set(prev).add(key));

    // Optimistic update
    setCompletions((prev) => {
      const idx = prev.findIndex(
        (c) => c.choreId === choreId && c.memberId === selectedMemberId && c.date === today,
      );
      if (idx >= 0) {
        return prev.filter((_, i) => i !== idx);
      }
      return [...prev, { choreId, memberId: selectedMemberId, date: today, completedAt: new Date().toISOString() }];
    });

    try {
      const res = await fetch('/api/chores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choreId, memberId: selectedMemberId, date: today }),
      });
      if (!res.ok) throw new Error('Failed to toggle');
        const data = await res.json();
        setCompletions(data.completions ?? []);
    } catch {
      fetchCompletions();
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const selectedMember = members.find((m) => m.id === selectedMemberId);
  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const currentTimeOfDay = getCurrentTimeOfDay(new Date().getHours());

  return (
    <div>
      {/* Day header */}
      <div style={{ padding: '12px 0 4px' }}>
        <div style={{ fontSize: 12, color: '#525252' }}>{dayName}</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fafafa' }}>Chores</h2>
      </div>

      {/* Member pills */}
      <div style={{ display: 'flex', gap: 6, padding: '12px 0', overflowX: 'auto', scrollbarWidth: 'none' as const }}>
        {members.map((member) => {
          const isActive = member.id === selectedMemberId;
          const tabStats = memberTabStats[member.id];
          const allDone = (tabStats?.total ?? 0) > 0 && tabStats?.done === tabStats?.total;

          return (
            <button
              key={member.id}
              onClick={() => setSelectedMemberId(member.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                minHeight: 44,
                borderRadius: 999,
                border: `2px solid ${isActive ? member.color : 'transparent'}`,
                background: isActive ? `color-mix(in srgb, ${member.color} 15%, transparent)` : 'rgba(255,255,255,0.05)',
                color: isActive ? member.color : 'rgba(255,255,255,0.6)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap' as const,
                transition: 'all 0.15s',
              }}
            >
              {member.emoji ? (
                <ChoreIcon value={member.emoji} size={18} color={isActive ? member.color : 'rgba(255,255,255,0.6)'} />
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
          <span style={{ fontSize: 13, color: '#737373' }}>
            {totalDone}/{totalCount} complete
          </span>
          {totalCount > 0 && totalDone === totalCount && (
            <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 500 }}>All done!</span>
          )}
        </div>
        <div style={{ height: 8, background: '#262626', borderRadius: 4, overflow: 'hidden' }}>
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
      <div style={{ paddingBottom: 32 }}>
        {myAssignments.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <p style={{ fontSize: 14, color: '#525252' }}>No chores today!</p>
          </div>
        )}

        {(['morning', 'afternoon', 'evening', 'anytime'] as ChoreTimeOfDay[]).map((section) => {
          const items = grouped.get(section);
          if (!items?.length) return null;

          const meta = TIME_OF_DAY_META[section];
          const TodIcon = TOD_ICONS[section];
          const isCurrent = section === currentTimeOfDay;
          const sectionAllDone = items.every((a) => a.isCompleted);

          return (
            <div key={section} style={{ marginBottom: 16 }}>
              {/* Section header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0' }}>
                <TodIcon size={16} color={isCurrent ? accentColor : '#525252'} strokeWidth={2} />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.08em',
                    color: isCurrent ? accentColor : '#525252',
                  }}
                >
                  {meta.label}
                </span>
                {sectionAllDone && (
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#22c55e' }}>&#10003;</span>
                )}
              </div>

              {/* Chore cards */}
              {items.map((assignment) => {
                const key = completionKey(assignment.choreId, selectedMemberId, dateKey);
                const isToggling = toggling.has(key);
                const done = assignment.isCompleted;

                return (
                  <button
                    key={assignment.choreId}
                    onClick={() => toggle(assignment.choreId)}
                    disabled={isToggling}
                    aria-label={`${done ? 'Completed' : 'Mark complete'}: ${assignment.choreName}`}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 16px',
                      background: done ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                      borderRadius: 12,
                      marginBottom: 6,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      border: 'none',
                      color: 'inherit',
                      textAlign: 'left' as const,
                      opacity: isToggling ? 0.6 : 1,
                    }}
                  >
                    {/* Checkbox */}
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'all 0.15s',
                        background: done ? (selectedMember?.color ?? accentColor) : 'transparent',
                        border: done ? 'none' : '2px solid rgba(255,255,255,0.2)',
                      }}
                    >
                      {done && <Check size={16} color="white" strokeWidth={2.5} />}
                    </div>

                    {/* Icon */}
                    {assignment.choreEmoji && (
                      <span style={{ flexShrink: 0 }}>
                        <ChoreIcon value={assignment.choreEmoji} size={20} color={done ? '#525252' : '#a3a3a3'} />
                      </span>
                    )}

                    {/* Name */}
                    <span
                      style={{
                        flex: 1,
                        fontSize: 15,
                        fontWeight: 500,
                        textDecoration: done ? 'line-through' : 'none',
                        color: done ? '#525252' : '#e5e5e5',
                      }}
                    >
                      {assignment.choreName}
                    </span>

                    {/* Points */}
                    {config.showPoints && assignment.points > 1 && (
                      <span
                        style={{
                          fontSize: 11,
                          flexShrink: 0,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'rgba(255,255,255,0.08)',
                          color: '#525252',
                          opacity: done ? 0.3 : 1,
                        }}
                      >
                        {assignment.points}pt
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
