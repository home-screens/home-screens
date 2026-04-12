'use client';

import type { ChoreChartConfig, ChoreMember } from '@/types/config';
import type { MemberStats, WeekDayData } from '../types';
import { TEXT_OPACITY } from '@/lib/constants';
import ChoreIcon from '../ChoreIcon';

interface StarChartViewProps {
  config: ChoreChartConfig;
  data: {
    members: ChoreMember[];
    memberStats: Map<string, MemberStats>;
    weekData: WeekDayData[];
  };
}

export function StarChartView({ config, data }: StarChartViewProps) {
  const { members, memberStats, weekData } = data;
  const accentColor = config.accentColor ?? '#f59e0b';
  const showStreaks = config.showStreaks;

  return (
    <div className="flex flex-col h-full" style={{ fontSize: 'inherit' }}>
      {/* Title */}
      <div className="text-center mb-2" style={{ fontSize: '0.85em', fontWeight: 600, opacity: TEXT_OPACITY.secondary }}>
        &#11088; Star Chart &#11088;
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'none' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.3em', fontWeight: 500, opacity: TEXT_OPACITY.dim }} />
              {weekData.map((day) => (
                <th
                  key={day.date}
                  style={{
                    textAlign: 'center',
                    padding: '0.3em',
                    fontWeight: day.isToday ? 700 : 500,
                    color: day.isToday ? accentColor : undefined,
                    opacity: day.isToday ? TEXT_OPACITY.primary : TEXT_OPACITY.secondary,
                    fontSize: '0.85em',
                  }}
                >
                  {day.dayName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const stats = memberStats.get(member.id);
              return (
                <tr key={member.id}>
                  <td style={{ padding: '0.4em 0.3em', whiteSpace: 'nowrap' }}>
                    <span className="inline-flex items-center gap-1">
                      {member.emoji ? <ChoreIcon value={member.emoji} size={18} color={member.color} /> : <span style={{ color: member.color }}>{member.name[0]}</span>}
                      <span style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.heading }}>{member.name}</span>
                    </span>
                    {showStreaks && (stats?.streak ?? 0) >= 2 && (
                      <span style={{ marginLeft: '0.3em', fontSize: '0.8em' }}>
                        &#128293;{stats!.streak}
                      </span>
                    )}
                  </td>
                  {weekData.map((day) => {
                    const earned = day.memberStars[member.id];
                    const isPast = !day.isToday && new Date(day.date) < new Date();
                    return (
                      <td
                        key={day.date}
                        style={{
                          textAlign: 'center',
                          padding: '0.3em',
                          fontSize: '1.4em',
                          backgroundColor: day.isToday ? `${accentColor}10` : undefined,
                        }}
                      >
                        {earned ? (
                          day.isToday ? '\ud83c\udf1f' : '\u2b50'
                        ) : isPast ? (
                          <span style={{ opacity: 0.15 }}>&times;</span>
                        ) : (
                          ''
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Weekly totals */}
      {config.showPoints && (
        <div
          className="mt-2 flex items-center justify-center gap-3 flex-wrap"
          style={{ fontSize: '0.65em', opacity: TEXT_OPACITY.dim }}
        >
          {members.map((m) => {
            const stats = memberStats.get(m.id);
            return (
              <span key={m.id} className="inline-flex items-center gap-1">
                {m.emoji ? <ChoreIcon value={m.emoji} size={12} color={m.color} /> : <span style={{ color: m.color }}>{m.name[0]}</span>} {stats?.weeklyPoints ?? 0} tickets
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
