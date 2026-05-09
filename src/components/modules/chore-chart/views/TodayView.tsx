'use client';

import type { ChoreChartConfig, ChoreTimeOfDay, ChoreMember } from '@/types/config';
import type { ResolvedAssignment, MemberStats } from '../types';
import { TIME_OF_DAY_META, getCurrentTimeOfDay } from '../types';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { createTZDate, formatDateInTZ } from '@/lib/timezone';
import { useTranslate, useFormattingLocale } from '@/i18n';
import ChoreIcon from '../ChoreIcon';

interface TodayViewProps {
  config: ChoreChartConfig;
  data: {
    members: ChoreMember[];
    todayAssignments: ResolvedAssignment[];
    memberStats: Map<string, MemberStats>;
    toggleComplete: (choreId: string, memberId: string) => Promise<void>;
  };
  timezone?: string;
}

const TIME_SECTIONS: ChoreTimeOfDay[] = ['morning', 'afternoon', 'evening', 'anytime'];

export function TodayView({ config, data, timezone }: TodayViewProps) {
  const { todayAssignments, members, toggleComplete } = data;
  const allowTouch = config.allowDisplayComplete;
  const accentColor = config.accentColor ?? '#f59e0b';
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  // `tzNow` is a "shifted" Date whose local-time methods (getHours, getDay…)
  // reflect the configured IANA timezone — used by `getCurrentTimeOfDay`
  // which reads `getHours()`. `formatDateInTZ` does its own zone shift via
  // `Intl.DateTimeFormat`, so it must receive a real UTC instant; passing
  // `tzNow` would shift twice and yield the wrong weekday near midnight.
  const tzNow = createTZDate(timezone);
  const currentTime = getCurrentTimeOfDay(tzNow.getHours());

  const dayName = formatDateInTZ(new Date(), timezone, { weekday: 'long' }, locale);
  const totalAssigned = todayAssignments.length;
  const totalDone = todayAssignments.filter((a) => a.isCompleted).length;

  // Group assignments by time of day
  const byTime = new Map<ChoreTimeOfDay, ResolvedAssignment[]>();
  for (const section of TIME_SECTIONS) {
    byTime.set(section, []);
  }
  for (const a of todayAssignments) {
    const time = a.chore.timeOfDay;
    byTime.get(time)?.push(a);
  }

  return (
    <div className="flex flex-col h-full" style={{ fontSize: 'inherit' }}>
      {/* Header */}
      <div className="text-center mb-2">
        <div style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.dim }}>&#128203; {t('chore-chart.today')}</div>
        <div style={{ fontSize: '0.85em', fontWeight: 600 }}>{dayName}</div>
      </div>

      {/* Time sections */}
      <div className="flex-1 overflow-y-auto space-y-2" style={{ scrollbarWidth: 'none' }}>
        {TIME_SECTIONS.map((section) => {
          const items = byTime.get(section) ?? [];
          if (items.length === 0) return null;

          const meta = TIME_OF_DAY_META[section];
          const isCurrent = section === currentTime;
          const sectionDone = items.every((a) => a.isCompleted);
          const isPast = meta.order < TIME_OF_DAY_META[currentTime].order;

          return (
            <div key={section}>
              {/* Section header */}
              <div
                className="flex items-center gap-1.5 mb-1"
                style={{
                  fontSize: '0.85em',
                  fontWeight: isCurrent ? 700 : 500,
                  opacity: isPast && sectionDone ? TEXT_OPACITY.tertiary : isCurrent ? TEXT_OPACITY.primary : TEXT_OPACITY.secondary,
                  color: isCurrent ? accentColor : undefined,
                }}
              >
                <span>{meta.icon}</span>
                <span>{t(`chore-chart.timeOfDay.${section}`)}</span>
                {sectionDone && isPast && <span style={{ marginLeft: 'auto' }}>&check;</span>}
              </div>

              {/* Chore rows */}
              <div
                className="rounded-lg overflow-hidden"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
              >
                {items.map((assignment, i) => {
                  const { chore, memberId, isCompleted } = assignment;
                  const member = members.find((m) => m.id === memberId);

                  return (
                    <button
                      key={`${chore.id}-${memberId}`}
                      type="button"
                      onClick={allowTouch ? () => toggleComplete(chore.id, memberId) : undefined}
                      disabled={!allowTouch}
                      className="w-full flex items-center gap-2 transition-all"
                      style={{
                        padding: '0.5em 0.6em',
                        fontSize: '1em',
                        opacity: isCompleted ? 0.45 : 1,
                        cursor: allowTouch ? 'pointer' : 'default',
                        background: 'none',
                        border: 'none',
                        borderTop: i > 0 ? `1px solid ${DIVIDER.subtle}` : 'none',
                        color: 'inherit',
                        textAlign: 'left',
                      }}
                    >
                      {chore.emoji && <span className="shrink-0"><ChoreIcon value={chore.emoji} size={18} color="currentColor" /></span>}
                      <span
                        className="flex-1 truncate"
                        style={{ textDecoration: isCompleted ? 'line-through' : 'none' }}
                      >
                        {chore.name}
                      </span>
                      {member && member.emoji && (
                        <span className="shrink-0" title={member.name}>
                          <ChoreIcon value={member.emoji} size={16} color={member.color} />
                        </span>
                      )}
                      <span style={{ fontSize: '1.3em' }}>
                        {isCompleted ? '\u2705' : '\u2610'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="mt-2">
        <div className="flex items-center gap-2" style={{ fontSize: '0.65em', opacity: TEXT_OPACITY.dim }}>
          <span>{t('chore-chart.progressLabel')}</span>
          <div className="flex-1">
            <div
              className="rounded-full overflow-hidden"
              style={{ height: '0.4em', backgroundColor: DIVIDER.default }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: totalAssigned > 0 ? `${(totalDone / totalAssigned) * 100}%` : '0%',
                  backgroundColor: accentColor,
                }}
              />
            </div>
          </div>
          <span>{t('chore-chart.doneFraction', { done: totalDone, total: totalAssigned })}</span>
        </div>
      </div>
    </div>
  );
}
