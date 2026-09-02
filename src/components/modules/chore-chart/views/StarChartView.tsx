'use client';

import type { ChoreChartConfig, ChoreMember } from '@/types/config';
import { todayStr, type MemberStats, type WeekDayData } from '../types';
import { balanceRows, fitPerRow, weekMembers } from '../layout';
import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import ChoreIcon from '../ChoreIcon';

interface StarChartViewProps {
  config: ChoreChartConfig;
  data: {
    members: ChoreMember[];
    memberStats: Map<string, MemberStats>;
    weekData: WeekDayData[];
  };
  /** Measured box width in px (0 until measured). */
  width: number;
  /** Module font size in px. */
  fontSize: number;
}

/** One "icon + N tickets" legend entry is about this wide, in em of its own (0.65em) size. */
const LEGEND_ITEM_EM = 5.5;
const LEGEND_FONT = 0.65;
const LEGEND_GAP = 12;

export function StarChartView({ config, data, width, fontSize }: StarChartViewProps) {
  const { members, memberStats, weekData } = data;
  const accentColor = config.accentColor ?? '#f59e0b';
  const showStreaks = config.showStreaks;
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  // A row of seven empty stars for someone with no chores this week says
  // nothing; only members who take part are charted.
  const charted = weekMembers(members, memberStats);
  const legendRows = balanceRows(
    charted,
    fitPerRow(width, LEGEND_ITEM_EM * LEGEND_FONT * fontSize, LEGEND_GAP, charted.length),
  );

  return (
    <div className="flex flex-col h-full" style={{ fontSize: 'inherit' }}>
      {/* Title */}
      {config.showTitle !== false && (
        <div className="text-center mb-2" style={{ fontSize: '0.85em', fontWeight: 600, opacity: TEXT_OPACITY.secondary }}>
          &#11088; {t('chore-chart.starChart')} &#11088;
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'none' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.3em', fontWeight: 500, opacity: TEXT_OPACITY.dim }} />
              {weekData.map((day) => {
                const [y, m, d] = day.date.split('-').map(Number);
                const dayDate = new Date(y, (m ?? 1) - 1, d ?? 1);
                return (
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
                    {formatDateSync(dayDate, 'EEE', { locale })}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {charted.map((member) => {
              const stats = memberStats.get(member.id);
              return (
                <tr key={member.id}>
                  <td style={{ padding: '0.4em 0.3em', whiteSpace: 'nowrap', maxWidth: '8em' }}>
                    <span className="inline-flex items-center gap-1 max-w-full align-bottom">
                      <span className="shrink-0 flex">{member.emoji ? <ChoreIcon value={member.emoji} size={18} color={member.color} /> : <span style={{ color: member.color }}>{member.name[0]}</span>}</span>
                      <span className="truncate min-w-0" title={member.name} style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.heading }}>{member.name}</span>
                    </span>
                    {showStreaks && (stats?.streak ?? 0) >= 2 && (
                      <span style={{ marginLeft: '0.3em', fontSize: '0.8em' }}>
                        &#128293;{stats!.streak}
                      </span>
                    )}
                  </td>
                  {weekData.map((day) => {
                    const earned = day.memberStars[member.id];
                    // ISO string compare in local terms — `new Date('YYYY-MM-DD')`
                    // parses as UTC midnight, which marked tomorrow as missed
                    // every evening west of Greenwich.
                    const isPast = day.date < todayStr();
                    // A day with nothing assigned is neither earned nor missed.
                    const assigned = day.memberAssigned[member.id];
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
                          day.isToday ? '🌟' : '⭐'
                        ) : isPast && assigned ? (
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
        <div className="mt-2 flex flex-col items-center" style={{ fontSize: `${LEGEND_FONT}em`, opacity: TEXT_OPACITY.dim, gap: 4 }}>
          {legendRows.map((row, ri) => (
            <div key={ri} className="flex items-center justify-center" style={{ gap: LEGEND_GAP }}>
              {row.map((m) => {
                const stats = memberStats.get(m.id);
                return (
                  <span key={m.id} className="inline-flex items-center gap-1 whitespace-nowrap">
                    {m.emoji ? <ChoreIcon value={m.emoji} size={12} color={m.color} /> : <span style={{ color: m.color }}>{m.name[0]}</span>} {t('chore-chart.ticketsCount', { count: stats?.weeklyPoints ?? 0 })}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
