'use client';

import type { ChoreChartConfig, ChoreMember } from '@/types/config';
import type { ResolvedAssignment, MemberStats } from '../types';
import { sortChores } from '../types';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import ChoreIcon from '../ChoreIcon';

interface BoardViewProps {
  config: ChoreChartConfig;
  data: {
    members: ChoreMember[];
    todayAssignments: ResolvedAssignment[];
    completionSet: Set<string>;
    memberStats: Map<string, MemberStats>;
    toggleComplete: (choreId: string, memberId: string) => Promise<void>;
  };
}

export function BoardView({ config, data }: BoardViewProps) {
  const { todayAssignments, members, memberStats, toggleComplete } = data;
  const allowTouch = config.allowDisplayComplete;
  const t = useTranslate('modules');

  return (
    <div className="flex flex-col h-full" style={{ fontSize: 'inherit' }}>
      {/* Title */}
      {config.showTitle !== false && (
        <div className="text-center mb-2" style={{ fontSize: '0.85em', fontWeight: 600, opacity: TEXT_OPACITY.secondary }}>
          {t('chore-chart.familyChores')}
        </div>
      )}

      {/* Columns */}
      {/* data-swipe-ignore: these columns scroll sideways with 5+ members —
          a horizontal drag here must never trigger screen navigation. */}
      <div className="flex-1 flex gap-2 min-h-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }} data-swipe-ignore>
        {members.map((member) => {
          const myAssignments = todayAssignments.filter((a) => a.memberId === member.id);
          const sorted = sortChores(myAssignments, config.showTimeOfDay);
          const stats = memberStats.get(member.id);
          const pct = stats?.percentage ?? 0;

          if (myAssignments.length === 0) {
            return (
              <div key={member.id} className="flex-1 min-w-0 flex flex-col">
                {/* Header */}
                <div
                  className="text-center rounded-t-md py-1.5 mb-1"
                  style={{ backgroundColor: `${member.color}18` }}
                >
                  <div style={{ fontSize: '1.3em' }} className="flex justify-center">
                    {member.emoji ? <ChoreIcon value={member.emoji} size={28} color={member.color} /> : <span style={{ color: member.color }}>{member.name[0]}</span>}
                  </div>
                  <div style={{ fontSize: '0.7em', fontWeight: 600, color: member.color }}>
                    {member.name}
                  </div>
                  {config.showPoints && (stats?.rewardBalance ?? 0) > 0 && (
                    <div style={{ fontSize: '0.55em', fontWeight: 700, color: '#a78bfa', marginTop: 2, opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                      🎟️ {stats!.rewardBalance}
                    </div>
                  )}
                </div>
                <div className="flex-1 flex items-center justify-center" style={{ fontSize: '0.65em', opacity: TEXT_OPACITY.tertiary }}>
                  {t('chore-chart.dayOff')} &#127796;
                </div>
              </div>
            );
          }

          return (
            <div key={member.id} className="flex-1 min-w-0 flex flex-col">
              {/* Header */}
              <div
                className="text-center rounded-t-md py-1.5 mb-1"
                style={{ backgroundColor: `${member.color}18` }}
              >
                <div style={{ fontSize: '1.3em' }} className="flex justify-center">
                  {member.emoji ? <ChoreIcon value={member.emoji} size={28} color={member.color} /> : <span style={{ color: member.color }}>{member.name[0]}</span>}
                </div>
                <div style={{ fontSize: '0.7em', fontWeight: 600, color: member.color }}>
                  {member.name}
                </div>
                {config.showPoints && (stats?.rewardBalance ?? 0) > 0 && (
                  <div style={{ fontSize: '0.55em', fontWeight: 700, color: '#a78bfa', marginTop: 2, opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                    🎟️ {stats!.rewardBalance}
                  </div>
                )}
              </div>

              {/* Chore cards */}
              <div className="flex-1 overflow-y-auto space-y-1" style={{ scrollbarWidth: 'none' }}>
                {sorted.map((assignment) => {
                  const { chore, isCompleted } = assignment;
                  return (
                    <button
                      key={chore.id}
                      type="button"
                      onClick={allowTouch ? () => toggleComplete(chore.id, member.id) : undefined}
                      disabled={!allowTouch}
                      className="w-full text-left rounded-md transition-all"
                      style={{
                        padding: '0.4em 0.5em',
                        fontSize: '1em',
                        opacity: isCompleted ? 0.45 : 1,
                        textDecoration: isCompleted ? 'line-through' : 'none',
                        backgroundColor: isCompleted ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                        cursor: allowTouch ? 'pointer' : 'default',
                        border: 'none',
                        color: 'inherit',
                      }}
                    >
                      <span style={{ fontSize: '1.2em' }}>{isCompleted ? '\u2705' : '\u2610'}</span>{' '}
                      {chore.emoji && <ChoreIcon value={chore.emoji} size={18} color="currentColor" />}{' '}
                      <span>{chore.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Progress bar */}
              <div className="mt-1.5">
                <div
                  className="rounded-full overflow-hidden"
                  style={{ height: '0.35em', backgroundColor: DIVIDER.default }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: member.color,
                    }}
                  />
                </div>
                <div className="text-center mt-0.5" style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.dim }}>
                  {stats?.completed ?? 0}/{stats?.total ?? 0}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* All complete celebration */}
      {members.length > 0 && todayAssignments.length > 0 && todayAssignments.every((a) => a.isCompleted) && (
        <div className="text-center mt-2" style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.secondary }}>
          {t('chore-chart.allDone')} &#127881;
        </div>
      )}
    </div>
  );
}
