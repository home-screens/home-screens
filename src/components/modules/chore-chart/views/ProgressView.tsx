'use client';

import type { ChoreChartConfig, ChoreMember } from '@/types/config';
import type { MemberStats } from '../types';
import { balanceRows, fitPerRow, partitionMembers } from '../layout';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import ChoreIcon from '../ChoreIcon';

interface ProgressViewProps {
  config: ChoreChartConfig;
  data: {
    members: ChoreMember[];
    memberStats: Map<string, MemberStats>;
  };
  /** Measured box width in px (0 until measured). */
  width: number;
  /** Module font size in px. */
  fontSize: number;
}

/** A ring plus its name and fraction is about this wide, in em of the module font. */
const RING_ITEM_EM = 5;
const RING_GAP = 16;

function ProgressRing({
  percentage,
  color,
  size,
}: {
  percentage: number;
  color: string;
  size: number;
}) {
  const strokeWidth = size * 0.12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={DIVIDER.default}
        strokeWidth={strokeWidth}
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
    </svg>
  );
}

export function ProgressView({ config, data, width, fontSize }: ProgressViewProps) {
  const { members, memberStats } = data;
  const showStreaks = config.showStreaks;
  const showPoints = config.showPoints;
  const t = useTranslate('modules');

  let totalCompleted = 0;
  let totalAssigned = 0;
  let bestStreak = { name: '', streak: 0 };
  let totalWeeklyPoints = 0;
  let totalRewardBalance = 0;

  for (const member of members) {
    const stats = memberStats.get(member.id);
    if (stats) {
      totalCompleted += stats.completed;
      totalAssigned += stats.total;
      totalWeeklyPoints += stats.weeklyPoints;
      totalRewardBalance += stats.rewardBalance;
      if (stats.streak > bestStreak.streak) {
        bestStreak = { name: member.name, streak: stats.streak };
      }
    }
  }

  const overallPct = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0;

  // Rings only for people with chores today: a 0% ring for a parent with no
  // chores, or a kid on a day off, reads as a failure that never happened.
  const { active, dayOff } = partitionMembers(members, memberStats);
  const ringSize = active.length <= 3 ? 80 : active.length <= 5 ? 60 : 50;
  const itemWidth = Math.max(ringSize, RING_ITEM_EM * fontSize);
  const rows = balanceRows(active, fitPerRow(width, itemWidth, RING_GAP, active.length));

  return (
    <div className="flex flex-col h-full items-center" style={{ fontSize: 'inherit' }}>
      {/* Title */}
      {config.showTitle !== false && (
        <div className="text-center mb-3" style={{ fontSize: '0.85em', fontWeight: 600, opacity: TEXT_OPACITY.secondary }}>
          &#128202; {t('chore-chart.familyProgress')}
        </div>
      )}

      {/* Progress rings, in balanced rows */}
      <div className="flex flex-col items-center" style={{ gap: RING_GAP * 0.75 }}>
        {rows.map((row, ri) => (
          <div key={ri} className="flex items-start justify-center" style={{ gap: RING_GAP }}>
            {row.map((member) => {
              const stats = memberStats.get(member.id);
              const pct = stats?.percentage ?? 0;

              return (
                <div key={member.id} className="flex flex-col items-center gap-1 min-w-0" style={{ width: itemWidth }}>
                  <div className="relative">
                    <ProgressRing percentage={pct} color={member.color} size={ringSize} />
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ fontSize: `${ringSize * 0.22}px`, fontWeight: 700 }}
                    >
                      {pct}%
                    </div>
                  </div>
                  <div style={{ fontSize: '1.1em' }} className="flex justify-center">
                    {member.emoji ? <ChoreIcon value={member.emoji} size={22} color={member.color} /> : <span style={{ color: member.color }}>{member.name[0]}</span>}
                  </div>
                  <div className="truncate max-w-full" title={member.name} style={{ fontSize: '0.65em', fontWeight: 600, color: member.color }}>
                    {member.name}
                  </div>
                  <div style={{ fontSize: '0.55em', opacity: TEXT_OPACITY.dim }}>
                    {t('chore-chart.doneFraction', { done: stats?.completed ?? 0, total: stats?.total ?? 0 })}
                  </div>
                  {showStreaks && (stats?.streak ?? 0) >= 2 && (
                    <div style={{ fontSize: '0.55em' }}>
                      &#128293; {t('chore-chart.streakDays', { count: stats!.streak })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {active.length === 0 && (
          <div style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.tertiary }}>{t('chore-chart.noChoresToday')}</div>
        )}
        {dayOff.length > 0 && (
          <div className="text-center" style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.tertiary }}>
            {t('chore-chart.dayOffList', { names: dayOff.map((m) => m.name).join(', ') })}
          </div>
        )}
      </div>

      {/* Weekly summary */}
      <div className="mt-auto pt-3 w-full">
        <div
          className="text-center mb-1.5"
          style={{
            fontSize: '0.6em',
            opacity: TEXT_OPACITY.tertiary,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          {t('chore-chart.thisWeek')}
        </div>
        <div
          className="rounded-lg p-2 space-y-1"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', fontSize: '0.65em' }}
        >
          {showPoints && (
            <div className="flex items-center justify-between" style={{ opacity: TEXT_OPACITY.secondary }}>
              <span>&#11088; {t('chore-chart.totalTickets')}</span>
              <span style={{ fontWeight: 600 }}>{totalWeeklyPoints}</span>
            </div>
          )}
          {showStreaks && bestStreak.streak > 0 && (
            <div className="flex items-center justify-between" style={{ opacity: TEXT_OPACITY.secondary }}>
              <span>&#127942; {t('chore-chart.bestStreak')}</span>
              <span style={{ fontWeight: 600 }}>{t('chore-chart.bestStreakValue', { name: bestStreak.name, count: bestStreak.streak })}</span>
            </div>
          )}
          <div className="flex items-center justify-between" style={{ opacity: TEXT_OPACITY.secondary }}>
            <span>&#128200; {t('chore-chart.todaysCompletion')}</span>
            <span style={{ fontWeight: 600 }}>{overallPct}%</span>
          </div>
          {showPoints && totalRewardBalance > 0 && (
            <>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 0' }} />
              <div className="flex items-center justify-between" style={{ color: '#a78bfa' }}>
                <span>🎟️ {t('chore-chart.rewardBalances')}</span>
                <span style={{ fontWeight: 600 }}>{t('chore-chart.ticketsCount', { count: totalRewardBalance })}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
