'use client';

import type { ChoreChartConfig, ChoreMember, ChoreDefinition } from '@/types/config';
import type { ResolvedAssignment, MemberStats } from '../types';
import { todayStr, completionKey, choreAppliesToday, resolveAssignee } from '../types';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import ChoreIcon from '../ChoreIcon';

interface CompactViewProps {
  config: ChoreChartConfig;
  data: {
    members: ChoreMember[];
    chores: ChoreDefinition[];
    todayAssignments: ResolvedAssignment[];
    completionSet: Set<string>;
    memberStats: Map<string, MemberStats>;
    toggleComplete: (choreId: string, memberId: string) => Promise<void>;
  };
}

export function CompactView({ config, data }: CompactViewProps) {
  const { members, chores, completionSet, memberStats, toggleComplete } = data;
  const today = todayStr();
  const dayOfWeek = new Date().getDay();
  const allowTouch = config.allowDisplayComplete;
  const t = useTranslate('modules');

  const todayChores = chores.filter(
    (c) => choreAppliesToday(c, dayOfWeek, today),
  );

  return (
    <div className="flex flex-col h-full" style={{ fontSize: 'inherit' }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2" style={{ opacity: TEXT_OPACITY.secondary }}>
        {config.showTitle !== false && (
          <span style={{ fontSize: '0.8em', fontWeight: 600 }}>{t('chore-chart.chores')}</span>
        )}
        <div className="flex-1" />
        {members.map((m) => (
          <span key={m.id} title={m.name} className="flex items-center">
            {m.emoji ? <ChoreIcon value={m.emoji} size={16} color={m.color} /> : <span style={{ color: m.color }}>{m.name[0]}</span>}
          </span>
        ))}
      </div>

      {/* Divider */}
      <div style={{ borderBottom: `1px solid ${DIVIDER.visible}`, marginBottom: '0.3em' }} />

      {/* Grid */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {todayChores.map((chore) => (
          <div
            key={chore.id}
            className="flex items-center gap-2"
            style={{ padding: '0.25em 0', fontSize: '1em' }}
          >
            {chore.emoji && <span className="shrink-0"><ChoreIcon value={chore.emoji} size={16} color="currentColor" /></span>}
            <span className="flex-1 truncate" style={{ opacity: TEXT_OPACITY.heading }}>
              {chore.name}
            </span>
            {members.map((member) => {
              const isAssigned = resolveAssignee(chore, today).includes(member.id);
              if (!isAssigned) {
                return (
                  <span key={member.id} style={{ width: '1.8em', textAlign: 'center', opacity: 0.2 }}>
                    &middot;
                  </span>
                );
              }
              const done = completionSet.has(completionKey(chore.id, member.id, today));
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={allowTouch ? () => toggleComplete(chore.id, member.id) : undefined}
                  disabled={!allowTouch}
                  style={{ width: '1.8em', textAlign: 'center', cursor: allowTouch ? 'pointer' : 'default', background: 'none', border: 'none', color: 'inherit', padding: 0, fontSize: '1.2em' }}
                >
                  {done ? '\u2705' : '\u2610'}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Summary row */}
      <div style={{ borderTop: `1px solid ${DIVIDER.visible}`, marginTop: '0.3em', paddingTop: '0.3em' }}>
        <div className="flex items-center gap-2" style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.dim }}>
          <span>{t('chore-chart.doneLabel')}</span>
          <div className="flex-1" />
          {members.map((m) => {
            const stats = memberStats.get(m.id);
            return (
              <span key={m.id} style={{ width: '1.4em', textAlign: 'center', fontSize: '0.95em' }}>
                {stats ? `${stats.completed}/${stats.total}` : '—'}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
