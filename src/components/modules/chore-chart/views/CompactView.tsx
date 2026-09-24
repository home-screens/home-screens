'use client';

import type { FamilyGroup, FamilyMember } from '@/types/family';

import type { ChoreChartConfig, ChoreDefinition } from '@/types/config';
import type { ResolvedAssignment, MemberStats } from '../types';
import { completionKey, choreAppliesToday, isChoreSkipped, parseISO, resolveAssignee } from '../types';
import { choreIconSize, choreTapSize, partitionMembers } from '../layout';
import { CHORE_ROW_ATTR, FitRows } from '../FitRows';
import { TEXT_OPACITY, DIVIDER, ink } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import ChoreIcon from '../ChoreIcon';
import { TapCheckbox } from '../../shared/TapCheckbox';
import { usePressedKey } from '../../shared/usePressedKey';
import { useHoldToUncheck } from '@/hooks/useHoldToUncheck';
import { HoldHint, HoldProgress, TicketValue, showsTicketValue } from '../ChoreRowExtras';

interface CompactViewProps {
  config: ChoreChartConfig;
  data: {
    members: FamilyMember[];
    groups: FamilyGroup[];
    chores: ChoreDefinition[];
    todayAssignments: ResolvedAssignment[];
    completionSet: Set<string>;
    memberStats: Map<string, MemberStats>;
    toggleComplete: (choreId: string, memberId: string) => Promise<unknown>;
    /** The hub's calendar day. */
    today: string;
  };
  /** Measured box width in px (0 until measured). */
  width: number;
  /** Module font size in px. */
  fontSize: number;
}

/** Width of one member checkbox column, in em. */
const COLUMN_EM = 1.8;
const COLUMN_GAP = 8;
/** Column width in px when the boxes are tappable: the box plus breathing room. */
const touchColumnPx = (fontSize: number) => choreTapSize(fontSize) + 8;
/** The chore name keeps at least this share of the row; past it the member
 *  columns collapse into one "done/total" cell per chore. */
const MAX_COLUMNS_SHARE = 0.45;

export function CompactView({ config, data, width, fontSize }: CompactViewProps) {
  const { members, chores, completionSet, memberStats, toggleComplete, today } = data;
  const dayOfWeek = parseISO(today).getDay();
  const allowTouch = config.allowDisplayComplete;
  const t = useTranslate('modules');
  const [pressedKey, press] = usePressedKey();
  // Ticking is one tap; un-ticking takes a press and hold, the same gesture
  // the kid tablet asks for.
  const hold = useHoldToUncheck();
  // Tappable boxes are fixed-size touch targets; read-only glyphs scale with the text.
  const columnWidth: string | number = allowTouch ? touchColumnPx(fontSize) : `${COLUMN_EM}em`;

  const todayChores = chores.filter(
    (c) => choreAppliesToday(c, dayOfWeek, today),
  );
  // Only people with a chore today get a column; an all-dots column for a
  // parent or a kid on their day off is noise.
  const { active } = partitionMembers(members, memberStats);
  const activeIds = new Set(active.map((m) => m.id));
  const tapSize = choreTapSize(fontSize);
  const columnsWidth = active.length * ((allowTouch ? touchColumnPx(fontSize) : COLUMN_EM * fontSize) + COLUMN_GAP);
  const aggregate = width > 0 && columnsWidth > width * MAX_COLUMNS_SHARE;

  const totals = active.reduce(
    (acc, m) => {
      const s = memberStats.get(m.id);
      return { done: acc.done + (s?.completed ?? 0), total: acc.total + (s?.total ?? 0) };
    },
    { done: 0, total: 0 },
  );

  const checkbox = (chore: ChoreDefinition, member: FamilyMember) => {
    // Marked "not today" on the phone: a dash, nothing to tick.
    if (isChoreSkipped(completionSet, chore.id, member.id, today)) {
      return (
        <span key={member.id} data-testid="chore-compact-skipped" aria-label={`${chore.name}: ${member.name}`} style={{ width: columnWidth, textAlign: 'center', opacity: 0.45, fontWeight: 700 }}>
          –
        </span>
      );
    }
    const done = completionSet.has(completionKey(chore.id, member.id, today));
    const key = `${chore.id}:${member.id}`;
    // A ticked box is the one a passing tap must not clear.
    const holdMode = allowTouch && done;
    const handlers = allowTouch
      ? hold.rowHandlers(key, holdMode, () => { void press(key, () => toggleComplete(chore.id, member.id)); })
      : undefined;
    return (
      <button
        key={member.id}
        type="button"
        {...handlers}
        disabled={!allowTouch}
        aria-label={`${chore.name}: ${member.name}`}
        aria-pressed={allowTouch ? done : undefined}
        className={allowTouch ? 'flex items-center justify-center shrink-0' : undefined}
        style={{ position: 'relative', width: columnWidth, textAlign: 'center', cursor: allowTouch ? 'pointer' : 'default', background: 'none', border: 'none', color: 'inherit', padding: 0, fontSize: allowTouch ? undefined : '1.2em', minHeight: allowTouch ? touchColumnPx(fontSize) : undefined, userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'pan-y' }}
      >
        {hold.holdingKey === key && <HoldProgress progress={hold.progress} color={member.color} />}
        {allowTouch ? <TapCheckbox checked={done} pressed={pressedKey === key} color={member.color} size={tapSize} /> : (done ? '✅' : '☐')}
      </button>
    );
  };

  /** The row this key belongs to, so a hinted cell can say so where there is room for words. */
  const choreOfKey = (key: string | null) => (key ? key.split(':')[0] : null);

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
            {m.emoji ? <ChoreIcon value={m.emoji} size={16} color={m.color} fallback={<span style={{ color: m.color }}>{m.name[0]}</span>} /> : <span style={{ color: m.color }}>{m.name[0]}</span>}
          </span>
        ))}
      </div>

      {/* Divider */}
      <div style={{ borderBottom: `1px solid ${DIVIDER.visible}`, marginBottom: '0.3em' }} />

      {/* Everyone's chores marked "not today": say so, rather than an empty grid. */}
      {active.length === 0 && todayChores.some((c) => !c.bonus) && (
        <div data-testid="chore-compact-day-off" className="flex-1 flex items-center justify-center" style={{ opacity: TEXT_OPACITY.secondary }}>
          {t('chore-chart.dayOff')}
        </div>
      )}

      {/* Grid */}
      <FitRows>
        {todayChores.map((chore) => {
          const assignees = active.filter((m) => resolveAssignee(chore, today, data.groups).includes(m.id));
          if (assignees.length === 0) return null;
          // A checkbox column is too narrow for words, so the hint from a tap
          // on any of this chore's boxes lands where the name is.
          const hinting = choreOfKey(hold.hintKey) === chore.id;
          return (
            <div
              key={chore.id}
              {...{ [CHORE_ROW_ATTR]: '' }}
              className="flex items-center gap-2"
              style={{ padding: '0.25em 0', fontSize: '1em' }}
            >
              {chore.emoji && <span className="shrink-0"><ChoreIcon value={chore.emoji} size={choreIconSize(fontSize)} color="currentColor" /></span>}
              <span className="flex-1 truncate" style={{ opacity: TEXT_OPACITY.heading }}>
                {hinting ? <HoldHint color={config.accentColor ?? '#f59e0b'} /> : chore.name}
              </span>
              {showsTicketValue(config.showPoints, chore.points) && <TicketValue points={chore.points} />}
              {aggregate ? (
                // One cell per chore. A chore with one person keeps its
                // checkbox (still tappable); a shared chore reads "2/6".
                assignees.length === 1 ? checkbox(chore, assignees[0]) : (() => {
                  const owedBy = assignees.filter((m) => !isChoreSkipped(completionSet, chore.id, m.id, today));
                  const done = owedBy.filter((m) => completionSet.has(completionKey(chore.id, m.id, today))).length;
                  return done === owedBy.length ? (
                    <span data-testid="chore-compact-aggregate" style={{ width: columnWidth, textAlign: 'center', fontSize: '1.2em' }}>{'✅'}</span>
                  ) : (
                    <span
                      data-testid="chore-compact-aggregate"
                      style={{ minWidth: '2.6em', textAlign: 'center', fontSize: '0.75em', fontWeight: 600, padding: '0.15em 0.5em', borderRadius: 999, backgroundColor: ink(0.08), fontVariantNumeric: 'tabular-nums' }}
                    >
                      {done}/{owedBy.length}
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
      </FitRows>

      {/* Summary row */}
      {active.length > 0 && <div style={{ borderTop: `1px solid ${DIVIDER.visible}`, marginTop: '0.3em', paddingTop: '0.3em' }}>
        <div className="flex items-center gap-2" style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.dim }}>
          <span>{t('chore-chart.doneLabel')}</span>
          <div className="flex-1" />
          {aggregate ? (
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{totals.done}/{totals.total}</span>
          ) : active.map((m) => {
            const stats = memberStats.get(m.id);
            return (
              <span key={m.id} style={{ width: allowTouch ? touchColumnPx(fontSize) : `${COLUMN_EM / 0.7}em`, textAlign: 'center', fontSize: '0.95em', fontVariantNumeric: 'tabular-nums' }}>
                {stats ? `${stats.completed}/${stats.total}` : '—'}
              </span>
            );
          })}
        </div>
      </div>}
    </div>
  );
}
