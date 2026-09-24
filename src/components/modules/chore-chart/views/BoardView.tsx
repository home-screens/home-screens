'use client';

import type { FamilyMember } from '@/types/family';

import type { ChoreChartConfig} from '@/types/config';
import type { ResolvedAssignment, MemberStats } from '../types';
import { sortChores } from '../types';
import { balanceRows, choreIconSize, choreTapSize, fitPerRow, partitionMembers } from '../layout';
import { TEXT_OPACITY, DIVIDER, ink } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import ChoreIcon from '../ChoreIcon';
import { TapCheckbox } from '../../shared/TapCheckbox';
import { usePressedKey } from '../../shared/usePressedKey';
import { useHoldToUncheck } from '@/hooks/useHoldToUncheck';
import { HoldHint, HoldProgress } from '../ChoreRowExtras';

interface BoardViewProps {
  config: ChoreChartConfig;
  data: {
    members: FamilyMember[];
    todayAssignments: ResolvedAssignment[];
    completionSet: Set<string>;
    memberStats: Map<string, MemberStats>;
    toggleComplete: (choreId: string, memberId: string) => Promise<unknown>;
  };
  /** Measured box width in px (0 until measured). */
  width: number;
  /** Module font size in px; the column floor is expressed in it. */
  fontSize: number;
  /**
   * The module's authored font size (the ceiling `fontSize` was fitted down
   * from). The row-wrap decision below has to use this, not the fitted size:
   * a heavy day can shrink `fontSize` to a fraction of it, and if the "is a
   * column too narrow" threshold shrinks along with it, it stops firing and
   * every member gets squeezed into one row regardless of width.
   */
  authoredFontSize: number;
}

/** A column narrower than this (in em) wraps chore names one word per line. */
const MIN_COLUMN_EM = 6;
const COLUMN_GAP = 8;

interface MemberColumnProps {
  member: FamilyMember;
  stats: MemberStats | undefined;
  showPoints: boolean;
  children: React.ReactNode;
}

function MemberColumn({ member, stats, showPoints, children }: MemberColumnProps) {
  return (
    <div className="min-w-0 min-h-0 flex flex-col">
      {/* Header */}
      <div
        className="text-center rounded-t-md py-1.5 mb-1 min-w-0"
        style={{ backgroundColor: `${member.color}18` }}
      >
        <div style={{ fontSize: '1.3em' }} className="flex justify-center">
          {member.emoji ? <ChoreIcon value={member.emoji} size={28} color={member.color} fallback={<span style={{ color: member.color }}>{member.name[0]}</span>} /> : <span style={{ color: member.color }}>{member.name[0]}</span>}
        </div>
        <div
          className="truncate px-1"
          title={member.name}
          style={{ fontSize: '0.7em', fontWeight: 600, color: member.color }}
        >
          {member.name}
        </div>
        {showPoints && (stats?.rewardBalance ?? 0) > 0 && (
          <div style={{ fontSize: '0.55em', fontWeight: 700, color: '#a78bfa', marginTop: 2, opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            🎟️ {stats!.rewardBalance}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export function BoardView({ config, data, width, fontSize, authoredFontSize }: BoardViewProps) {
  const { todayAssignments, members, memberStats, toggleComplete } = data;
  const allowTouch = config.allowDisplayComplete;
  const [pressedKey, press] = usePressedKey();
  // Ticking is one tap; un-ticking takes a press and hold, the same gesture
  // the kid tablet asks for.
  const hold = useHoldToUncheck();
  const t = useTranslate('modules');

  // Members with no chores at all this week are not on the board. A member
  // with chores on other days keeps a column that says so.
  const { idle } = partitionMembers(members, memberStats);
  const idleIds = new Set(idle.map((m) => m.id));
  const shown = members.filter((m) => !idleIds.has(m.id));
  // The column-width floor is expressed against the authored size, not the
  // fitted one: ChoreChartModule already budgeted the box height assuming
  // this same row count (see BOARD_COLUMN_EM there), so using a different
  // font size here would wrap fewer rows than the height was fit for.
  const perRow = fitPerRow(width, MIN_COLUMN_EM * authoredFontSize, COLUMN_GAP, shown.length);
  const rows = balanceRows(shown, perRow);

  return (
    <div className="flex flex-col h-full" style={{ fontSize: 'inherit' }}>
      {/* Title */}
      {config.showTitle !== false && (
        <div className="text-center mb-2" style={{ fontSize: '0.85em', fontWeight: 600, opacity: TEXT_OPACITY.secondary }}>
          {t('chore-chart.familyChores')}
        </div>
      )}

      {/* Columns, in as many rows as the width calls for */}
      <div
        className="flex-1 min-h-0 grid"
        style={{ gridTemplateRows: `repeat(${Math.max(1, rows.length)}, minmax(0, 1fr))`, gap: COLUMN_GAP }}
      >
        {rows.map((row, ri) => (
          <div
            key={ri}
            className="min-h-0 grid"
            style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`, gap: COLUMN_GAP }}
          >
            {row.map((member) => {
              // A chore marked "not today" is owed by nobody; the board lists what is owed.
              const myAssignments = todayAssignments.filter((a) => a.memberId === member.id && !a.isSkipped);
              const sorted = sortChores(myAssignments, config.showTimeOfDay);
              const stats = memberStats.get(member.id);
              const pct = stats?.percentage ?? 0;

              if (myAssignments.length === 0) {
                return (
                  <MemberColumn key={member.id} member={member} stats={stats} showPoints={config.showPoints}>
                    <div className="flex-1 flex items-center justify-center" style={{ fontSize: '0.65em', opacity: TEXT_OPACITY.tertiary }}>
                      {t('chore-chart.dayOff')} &#127796;
                    </div>
                  </MemberColumn>
                );
              }

              return (
                <MemberColumn key={member.id} member={member} stats={stats} showPoints={config.showPoints}>
                  {/* Chore cards */}
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-1" style={{ scrollbarWidth: 'none' }}>
                    {sorted.map((assignment) => {
                      const { chore, isCompleted } = assignment;
                      const key = `${chore.id}:${member.id}`;
                      // A finished card is the one a passing tap must not undo.
                      const holdMode = allowTouch && isCompleted;
                      const handlers = allowTouch
                        ? hold.rowHandlers(key, holdMode, () => { void press(key, () => toggleComplete(chore.id, member.id)); })
                        : undefined;
                      const hinting = hold.hintKey === key;
                      return (
                        <button
                          key={chore.id}
                          type="button"
                          {...handlers}
                          disabled={!allowTouch}
                          aria-pressed={allowTouch ? isCompleted : undefined}
                          className={`w-full text-left rounded-md transition-all flex gap-1.5 ${allowTouch ? 'items-center' : 'items-start'}`}
                          style={{
                            position: 'relative',
                            padding: '0.3em 0.4em',
                            fontSize: '0.8em',
                            lineHeight: 1.25,
                            opacity: isCompleted ? 0.45 : 1,
                            textDecoration: isCompleted && !hinting ? 'line-through' : 'none',
                            backgroundColor: isCompleted ? ink(0.03) : ink(0.06),
                            cursor: allowTouch ? 'pointer' : 'default',
                            border: 'none',
                            color: 'inherit',
                            // A long press must not select the card's text or
                            // open the browser's copy sheet.
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            WebkitTouchCallout: 'none',
                            touchAction: 'pan-y',
                          }}
                        >
                          {hold.holdingKey === key && <HoldProgress progress={hold.progress} color={member.color} />}
                          {allowTouch ? (
                            <TapCheckbox checked={isCompleted} pressed={pressedKey === key} color={member.color} size={choreTapSize(fontSize)} />
                          ) : (
                            <span className="shrink-0" style={{ fontSize: '1.15em', lineHeight: 1.1 }}>{isCompleted ? '✅' : '☐'}</span>
                          )}
                          {chore.emoji && <span className="shrink-0 flex items-center" style={{ height: '1.25em' }}><ChoreIcon value={chore.emoji} size={choreIconSize(fontSize)} color="currentColor" /></span>}
                          {/* Two lines at most: a long chore name ellipsises instead of
                              stacking one word per line in a narrow column. */}
                          <span
                            className="min-w-0"
                            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                          >
                            {hinting ? <HoldHint color={member.color} /> : chore.name}
                          </span>
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
                </MemberColumn>
              );
            })}
          </div>
        ))}
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
