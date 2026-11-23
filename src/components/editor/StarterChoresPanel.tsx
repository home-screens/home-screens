'use client';

import { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { ChoreDefinition } from '@/types/config';
import type { FamilyGroup, FamilyMember } from '@/types/family';
import Button from '@/components/ui/Button';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useStarterChoresPicker, type StarterSectionView } from '@/components/modules/chore-chart/useStarterChoresPicker';
import { groupMembers } from '@/lib/family-groups';
import { getLocalizedDayNames } from '@/lib/meal-constants';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { radioGroupKeyDown, radioTabIndex } from '@/components/ui/radio-group-keys';
import FieldHint from '@/components/ui/FieldHint';

/** Sunday to Saturday, the weekly day a starter section can land on. */
const WEEK_DAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

/**
 * The starter chore list in the editor's chore chart window: the same rules
 * as the phone's picker, drawn as compact rows in two columns so the whole
 * list fits the right-hand column without much scrolling.
 */
export default function StarterChoresPanel({
  chores,
  members,
  groups,
  onAdd,
  onCancel,
}: {
  chores: ChoreDefinition[];
  members: FamilyMember[];
  groups: FamilyGroup[];
  onAdd: (chores: Omit<ChoreDefinition, 'id'>[]) => void;
  onCancel: () => void;
}) {
  const tCore = useTranslate('core');
  const tModules = useTranslate('modules');
  // Day letters follow the formatting locale, not the UI language, like the chore form.
  const formattingLocale = useFormattingLocale();
  const dayNamesShort = useMemo(() => getLocalizedDayNames(formattingLocale, 'short'), [formattingLocale]);
  const picker = useStarterChoresPicker(chores, members, groups);
  const { sections, assignment, pickedCount, hasSomeone, canAdd } = picker;
  const chipClass = (on: boolean) =>
    `flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all ${
      on ? 'bg-hs-accent-soft text-hs-accent ring-1 ring-hs-accent/30' : 'bg-hs-card text-hs-text-faint hover:bg-hs-hover'
    }`;
  // The day's sections on the left, the evening and the week on the right.
  const columns: StarterSectionView[][] = [sections.slice(0, 2), sections.slice(2)];

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="starter-panel">
      {/* The scroller reaches into the column's right padding so an overlay
          scrollbar is drawn in that gutter, not over the day buttons. */}
      <div className="flex-1 min-h-0 overflow-y-auto -mr-3 pr-3 space-y-3">
        <p className="text-xs text-hs-text-faint">{tModules('chore-chart.starter.intro')}</p>

        <div className="space-y-1.5">
          <span className="text-xs text-hs-text-muted">{tModules('chore-chart.starter.whoLabel')}</span>
          <div className="flex flex-wrap gap-1.5">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                aria-pressed={assignment.assigneeGroupIds.includes(group.id)}
                title={groupMembers(group, members).map((m) => m.name).join(', ')}
                onClick={() => picker.toggleGroup(group.id)}
                className={chipClass(assignment.assigneeGroupIds.includes(group.id))}
              >
                <span>{group.name}</span>
                <span className="opacity-70">{groupMembers(group, members).length}</span>
              </button>
            ))}
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={assignment.assigneeIds.includes(m.id)}
                onClick={() => picker.toggleMember(m.id)}
                className={chipClass(assignment.assigneeIds.includes(m.id))}
              >
                {m.emoji && <ChoreIcon value={m.emoji} size={14} color="currentColor" />}
                <span>{m.name}</span>
              </button>
            ))}
          </div>
          <FieldHint tone={pickedCount > 0 && !hasSomeone ? 'warning' : undefined}>
            {tModules(pickedCount > 0 && !hasSomeone ? 'chore-chart.starter.whoNobody' : 'chore-chart.starter.whoHint')}
          </FieldHint>
        </div>

        <div className="grid grid-cols-2 gap-x-3">
          {columns.map((column, c) => (
            <div key={c} className="space-y-3 min-w-0">
              {column.map((view) => (
                <div key={view.section} data-testid={`starter-section-${view.section}`}>
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-hs-warning-ink">
                      {tModules(`chore-chart.starter.sections.${view.section}`)}
                    </span>
                    <span className="flex-1 text-[11px] text-hs-text-faint">
                      {view.picked > 0 && tModules('chore-chart.starter.pickedCount', { picked: view.picked, total: view.available })}
                    </span>
                    {view.available > 0 && (
                      <button
                        type="button"
                        onClick={() => picker.toggleSection(view.section)}
                        className="text-[11px] font-medium text-hs-text-faint hover:text-hs-text-body transition-colors"
                      >
                        {tModules(view.allPicked ? 'chore-chart.starter.selectNone' : 'chore-chart.starter.selectAll')}
                      </button>
                    )}
                  </div>
                  {/* A weekly chore is due on the days it lists, so "once a week" is one day for the whole section. */}
                  {view.section === 'weekly' && (
                    <div
                      className="mb-1.5"
                      role="radiogroup"
                      aria-label={tModules('chore-chart.starter.weeklyDay')}
                      onKeyDown={radioGroupKeyDown(WEEK_DAYS, picker.weeklyDay, picker.setWeeklyDay)}
                    >
                      {/* Label above the row: beside seven buttons it wraps in this column, in every locale. */}
                      <div className="text-[11px] text-hs-text-faint mb-1">{tModules('chore-chart.starter.weeklyDay')}</div>
                      <div className="flex items-center gap-1">
                      {WEEK_DAYS.map((d) => {
                        const on = picker.weeklyDay === d;
                        return (
                          <button
                            key={d}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            tabIndex={radioTabIndex(WEEK_DAYS, picker.weeklyDay, d)}
                            aria-label={dayNamesShort[d]}
                            data-testid={`starter-weekly-day-${d}`}
                            onClick={() => picker.setWeeklyDay(d)}
                            className={`w-6 h-6 rounded-full text-[11px] font-semibold transition-colors ${
                              on ? 'bg-hs-warning text-white' : 'bg-hs-card text-hs-text-faint hover:bg-hs-hover'
                            }`}
                          >
                            {dayNamesShort[d][0]}
                          </button>
                        );
                      })}
                      </div>
                    </div>
                  )}
                  <div className="rounded-lg border border-hs-border-strong overflow-hidden">
                    {view.starters.map((starter) => {
                      const added = picker.alreadyAdded.has(starter.id);
                      const on = picker.pickedIds.has(starter.id);
                      return (
                        <button
                          key={starter.id}
                          type="button"
                          role="checkbox"
                          aria-checked={added ? true : on}
                          aria-disabled={added || undefined}
                          data-testid={`starter-${starter.id}`}
                          onClick={() => picker.toggle(starter.id)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 text-left border-t border-hs-border-strong first:border-t-0 transition-colors ${
                            added ? 'bg-hs-panel cursor-default' : 'bg-hs-hover hover:bg-hs-card/70'
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`w-4 h-4 rounded shrink-0 flex items-center justify-center ${
                              on ? 'bg-hs-warning' : added ? 'bg-hs-card' : 'border-2 border-hs-border-strong'
                            }`}
                          >
                            {(on || added) && <Check size={11} strokeWidth={3} className={added ? 'text-hs-text-faint' : 'text-white'} />}
                          </span>
                          <span
                            aria-hidden
                            className={`w-6 h-6 rounded-md shrink-0 flex items-center justify-center bg-hs-warning/15 ${added ? 'opacity-40' : ''}`}
                          >
                            <ChoreIcon value={`lucide:${starter.icon}`} size={14} color="#f59e0b" />
                          </span>
                          <span className={`flex-1 min-w-0 text-xs leading-tight ${added ? 'text-hs-text-faint' : 'text-hs-text-body'}`}>
                            {starter.name}
                          </span>
                          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                            added ? 'border border-dashed border-hs-border-strong text-hs-text-faint' : 'bg-hs-card text-hs-text-faint'
                          }`}>
                            {added
                              ? tModules('chore-chart.starter.alreadyAdded')
                              : tModules('chore-chart.ticketsCount', { count: starter.points })}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-3 mt-3 border-t border-hs-border-strong/50">
        <Button variant="primary" size="sm" className="flex-1" disabled={!canAdd} data-testid="starter-add" onClick={() => { if (canAdd) onAdd(picker.build()); }}>
          {pickedCount === 0
            ? tModules('chore-chart.starter.addButtonNone')
            : tModules('chore-chart.starter.addButton', { count: pickedCount })}
        </Button>
        <Button size="sm" onClick={onCancel}>
          {tCore('actions.cancel')}
        </Button>
      </div>
    </div>
  );
}
