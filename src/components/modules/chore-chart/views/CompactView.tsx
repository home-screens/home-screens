'use client';

import type { ChoreChartConfig, ChoreMember, ChoreDefinition } from '@/types/config';
import type { ResolvedAssignment, MemberStats } from '../types';
import { todayStr, completionKey, choreAppliesToday, resolveAssignee } from '../types';
import { partitionMembers } from '../layout';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import ChoreIcon from '../ChoreIcon';
import { TapCheckbox, TAP_CHECKBOX_SIZE } from '../../shared/TapCheckbox';
import { usePressedKey } from '../../shared/usePressedKey';

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
  /** Measured box width in px (0 until measured). */
  width: number;
  /** Module font size in px. */
  fontSize: number;
}

/** Width of one member checkbox column, in em. */
const COLUMN_EM = 1.8;
const COLUMN_GAP = 8;
/** Column width in px when the boxes are tappable: the 38px box plus breathing room. */
const TOUCH_COLUMN_PX = TAP_CHECKBOX_SIZE + 8;
/** The chore name keeps at least this share of the row; past it the member
 *  columns collapse into one "done/total" cell per chore. */
const MAX_COLUMNS_SHARE = 0.45;

export function CompactView({ config, data, width, fontSize }: CompactViewProps) {
  const { members, chores, completionSet, memberStats, toggleComplete } = data;
  const today = todayStr();
  const dayOfWeek = new Date().getDay();
  const allowTouch = config.allowDisplayComplete;
  const t = useTranslate('modules');
  const [pressedKey, press] = usePressedKey();
  // Tappable boxes are fixed-size touch targets; read-only glyphs scale with the text.
  const columnWidth: string | number = allowTouch ? TOUCH_COLUMN_PX : `${COLUMN_EM}em`;

  const todayChores = chores.filter(
    (c) => choreAppliesToday(c, dayOfWeek, today),
  );
  // Only people with a chore today get a column; an all-dots column for a
  // parent or a kid on their day off is noise.
  const { active } = partitionMembers(members, memberStats);
  const activeIds = new Set(active.map((m) => m.id));
  const columnsWidth = active.length * ((allowTouch ? TOUCH_COLUMN_PX : COLUMN_EM * fontSize) + COLUMN_GAP);
  const aggregate = width > 0 && columnsWidth > width * MAX_COLUMNS_SHARE;

  const totals = active.reduce(
    (acc, m) => {
      const s = memberStats.get(m.id);
      return { done: acc.done + (s?.completed ?? 0), total: acc.total + (s?.total ?? 0) };
    },
    { done: 0, total: 0 },
  );

  const checkbox = (chore: ChoreDefinition, member: ChoreMember) => {
    const done = completionSet.has(completionKey(chore.id, member.id, today));
    const key = `${chore.id}:${member.id}`;
    return (
      <button
        key={member.id}
        type="button"
        onClick={allowTouch ? () => { void press(key, () => toggleComplete(chore.id, member.id)); } : undefined}
        disabled={!allowTouch}
        aria-label={`${chore.name}: ${member.name}`}
        aria-pressed={allowTouch ? done : undefined}
        className={allowTouch ? 'flex items-center justify-center shrink-0' : undefined}
        style={{ width: columnWidth, textAlign: 'center', cursor: allowTouch ? 'pointer' : 'default', background: 'none', border: 'none', color: 'inherit', padding: 0, fontSize: allowTouch ? undefined : '1.2em', minHeight: allowTouch ? TOUCH_COLUMN_PX : undefined }}
      >
        {allowTouch ? <TapCheckbox checked={done} pressed={pressedKey === key} color={member.color} /> : (done ? '✅' : '☐')}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full" style={{ fontSize: 'inherit' }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2" style={{ opacity: TEXT_OPACITY.secondary }}>
        {config.showTitle !== false && (
          <span style={{ fontSize: '0.8em', fontWeight: 600 }}>{t('chore-chart.chores')}</span>
        )}
        <div className="flex-1" />
        {!aggregate && active.map((m) => (
          <span key={m.id} title={m.name} className="flex items-center justify-center" style={{ width: columnWidth }}>
            {m.emoji ? <ChoreIcon value={m.emoji} size={16} color={m.color} /> : <span style={{ color: m.color }}>{m.name[0]}</span>}
          </span>
        ))}
      </div>

      {/* Divider */}
      <div style={{ borderBottom: `1px solid ${DIVIDER.visible}`, marginBottom: '0.3em' }} />

      {/* Grid */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {todayChores.map((chore) => {
          const assignees = active.filter((m) => resolveAssignee(chore, today).includes(m.id));
          if (assignees.length === 0) return null;
          return (
            <div
              key={chore.id}
              className="flex items-center gap-2"
              style={{ padding: '0.25em 0', fontSize: '1em' }}
            >
              {chore.emoji && <span className="shrink-0"><ChoreIcon value={chore.emoji} size={16} color="currentColor" /></span>}
              <span className="flex-1 truncate" style={{ opacity: TEXT_OPACITY.heading }}>
                {chore.name}
              </span>
              {aggregate ? (
                // One cell per chore. A chore with one person keeps its
                // checkbox (still tappable); a shared chore reads "2/6".
                assignees.length === 1 ? checkbox(chore, assignees[0]) : (() => {
                  const done = assignees.filter((m) => completionSet.has(completionKey(chore.id, m.id, today))).length;
                  return done === assignees.length ? (
                    <span data-testid="chore-compact-aggregate" style={{ width: columnWidth, textAlign: 'center', fontSize: '1.2em' }}>{'✅'}</span>
                  ) : (
                    <span
                      data-testid="chore-compact-aggregate"
                      style={{ minWidth: '2.6em', textAlign: 'center', fontSize: '0.75em', fontWeight: 600, padding: '0.15em 0.5em', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', fontVariantNumeric: 'tabular-nums' }}
                    >
                      {done}/{assignees.length}
                    </span>
                  );
                })()
              ) : (
                active.map((member) => {
                  if (!activeIds.has(member.id) || !assignees.some((m) => m.id === member.id)) {
                    return (
                      <span key={member.id} style={{ width: columnWidth, textAlign: 'center', opacity: 0.2 }}>
                        &middot;
                      </span>
                    );
                  }
                  return checkbox(chore, member);
                })
              )}
            </div>
          );
        })}
      </div>

      {/* Summary row */}
      <div style={{ borderTop: `1px solid ${DIVIDER.visible}`, marginTop: '0.3em', paddingTop: '0.3em' }}>
        <div className="flex items-center gap-2" style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.dim }}>
          <span>{t('chore-chart.doneLabel')}</span>
          <div className="flex-1" />
          {aggregate ? (
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{totals.done}/{totals.total}</span>
          ) : active.map((m) => {
            const stats = memberStats.get(m.id);
            return (
              <span key={m.id} style={{ width: allowTouch ? TOUCH_COLUMN_PX : `${COLUMN_EM / 0.7}em`, textAlign: 'center', fontSize: '0.95em', fontVariantNumeric: 'tabular-nums' }}>
                {stats ? `${stats.completed}/${stats.total}` : '—'}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
