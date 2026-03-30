'use client';

import type { ChoreChartConfig, ChoreMember } from '@/types/config';
import type { MemberStats } from '../types';
import ChoreIcon from '../ChoreIcon';

interface ProgressViewProps {
  config: ChoreChartConfig;
  data: {
    members: ChoreMember[];
    memberStats: Map<string, MemberStats>;
  };
}

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
        stroke="rgba(255,255,255,0.08)"
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

export function ProgressView({ config, data }: ProgressViewProps) {
  const { members, memberStats } = data;
  const showStreaks = config.showStreaks;
  const showPoints = config.showPoints;

  // Overall stats
  let totalCompleted = 0;
  let totalAssigned = 0;
  let bestStreak = { name: '', streak: 0 };
  let totalWeeklyPoints = 0;

  for (const member of members) {
    const stats = memberStats.get(member.id);
    if (stats) {
      totalCompleted += stats.completed;
      totalAssigned += stats.total;
      totalWeeklyPoints += stats.weeklyPoints;
      if (stats.streak > bestStreak.streak) {
        bestStreak = { name: member.name, streak: stats.streak };
      }
    }
  }

  const overallPct = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0;

  // Size the rings based on member count
  const ringSize = members.length <= 3 ? 80 : members.length <= 5 ? 60 : 50;

  return (
    <div className="flex flex-col h-full items-center" style={{ fontSize: 'inherit' }}>
      {/* Title */}
      <div className="text-center mb-3" style={{ fontSize: '0.85em', fontWeight: 600, opacity: 0.7 }}>
        &#128202; Family Progress
      </div>

      {/* Progress rings */}
      <div className="flex items-center justify-center gap-4 flex-wrap">
        {members.map((member) => {
          const stats = memberStats.get(member.id);
          const pct = stats?.percentage ?? 0;

          return (
            <div key={member.id} className="flex flex-col items-center gap-1">
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
              <div style={{ fontSize: '0.65em', fontWeight: 600, color: member.color }}>
                {member.name}
              </div>
              <div style={{ fontSize: '0.55em', opacity: 0.5 }}>
                {stats?.completed ?? 0}/{stats?.total ?? 0} done
              </div>
              {showStreaks && (stats?.streak ?? 0) >= 2 && (
                <div style={{ fontSize: '0.55em' }}>
                  &#128293; {stats!.streak} days
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Weekly summary */}
      <div className="mt-auto pt-3 w-full">
        <div
          className="text-center mb-1.5"
          style={{
            fontSize: '0.6em',
            opacity: 0.4,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          This Week
        </div>
        <div
          className="rounded-lg p-2 space-y-1"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', fontSize: '0.65em' }}
        >
          {showPoints && (
            <div className="flex items-center justify-between" style={{ opacity: 0.6 }}>
              <span>&#11088; Total points</span>
              <span style={{ fontWeight: 600 }}>{totalWeeklyPoints}</span>
            </div>
          )}
          {showStreaks && bestStreak.streak > 0 && (
            <div className="flex items-center justify-between" style={{ opacity: 0.6 }}>
              <span>&#127942; Best streak</span>
              <span style={{ fontWeight: 600 }}>{bestStreak.name} ({bestStreak.streak} days)</span>
            </div>
          )}
          <div className="flex items-center justify-between" style={{ opacity: 0.6 }}>
            <span>&#128200; Today&apos;s completion</span>
            <span style={{ fontWeight: 600 }}>{overallPct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
