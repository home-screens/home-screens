'use client';

import { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { FamilyGroup, FamilyMember } from '@/types/family';
import type { ChoreDefinition } from '@/types/config';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useStarterChoresPicker } from '@/components/modules/chore-chart/useStarterChoresPicker';
import { groupMembers } from '@/lib/family-groups';
import { getLocalizedDayNames } from '@/lib/meal-constants';
import { useTranslate, useFormattingLocale } from '@/i18n';
import FormOverlay from './FormOverlay';
import { REMOTE_ACCENT, LABEL_STYLE } from './chore-form-styles';
import { withAlpha } from '@/lib/hex-color';
import { memberInitials, memberInk } from '@/lib/family-avatar';

/** How many faces a group chip shows before the rest become "+N". */
const STACK_LIMIT = 4;

function chipStyle(on: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    padding: '0 12px 0 8px',
    borderRadius: 18,
    border: `2px solid ${on ? REMOTE_ACCENT : 'transparent'}`,
    background: on ? `color-mix(in srgb, ${REMOTE_ACCENT} 12%, var(--hs-bg-panel))` : 'var(--hs-bg-card)',
    color: on ? '#fbbf24' : 'var(--hs-text-faint)',
    fontSize: 13.5,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  };
}

function Initial({ name, color, size = 20 }: { name: string; color: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: color, color: memberInk(color), fontSize: 10, fontWeight: 700,
      }}
    >
      {memberInitials(name)}
    </span>
  );
}

/**
 * The starter chore list on the phone: tick the chores the house does, say
 * who they go to, add them all at once. A full-screen sheet like the chore
 * form, because 27 rows and a footer button do not fit a bottom sheet.
 */
export default function StarterChoresOverlay({
  chores,
  members,
  groups,
  onAdd,
  onBack,
}: {
  chores: ChoreDefinition[];
  members: FamilyMember[];
  groups: FamilyGroup[];
  onAdd: (chores: Omit<ChoreDefinition, 'id'>[]) => void;
  onBack: () => void;
}) {
  const tModules = useTranslate('modules');
  // Day letters follow the formatting locale, not the UI language, like the chore form.
  const formattingLocale = useFormattingLocale();
  const dayNamesShort = useMemo(() => getLocalizedDayNames(formattingLocale, 'short'), [formattingLocale]);
  const picker = useStarterChoresPicker(chores, members, groups);
  const { sections, assignment, pickedIds, alreadyAdded, pickedCount, hasSomeone, canAdd } = picker;

  return (
    <FormOverlay
      title={tModules('chore-chart.starter.title')}
      dirty={pickedCount > 0}
      onBack={onBack}
      footer={
        <div style={{ padding: '12px 16px' }}>
          {pickedCount > 0 && !hasSomeone && (
            <p style={{ fontSize: 13, color: 'var(--hs-warning)', textAlign: 'center', margin: '0 0 8px' }}>
              {tModules('chore-chart.starter.whoNobody')}
            </p>
          )}
          <button
            className="press-btn"
            data-testid="starter-add"
            onClick={() => { if (canAdd) onAdd(picker.build()); }}
            disabled={!canAdd}
            style={{
              width: '100%',
              minHeight: 48,
              padding: 14,
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              color: '#fff',
              border: 'none',
              cursor: canAdd ? 'pointer' : 'default',
              background: canAdd ? REMOTE_ACCENT : 'var(--hs-text-faint)',
              opacity: canAdd ? 1 : 0.5,
              transition: 'all 0.15s',
            }}
          >
            {pickedCount === 0
              ? tModules('chore-chart.starter.addButtonNone')
              : tModules('chore-chart.starter.addButton', { count: pickedCount })}
          </button>
        </div>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--hs-text-faint)', margin: '0 0 14px', lineHeight: 1.4 }}>
        {tModules('chore-chart.starter.intro')}
      </p>

      <div style={LABEL_STYLE}>{tModules('chore-chart.starter.whoLabel')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 6 }}>
        {groups.map((group) => {
          const on = assignment.assigneeGroupIds.includes(group.id);
          const inGroup = groupMembers(group, members);
          const shown = inGroup.slice(0, STACK_LIMIT);
          return (
            <button
              key={group.id}
              type="button"
              aria-pressed={on}
              title={inGroup.map((m) => m.name).join(', ')}
              onClick={() => picker.toggleGroup(group.id)}
              style={chipStyle(on)}
            >
              <span style={{ display: 'flex', alignItems: 'center' }} aria-hidden>
                {shown.map((m, i) => (
                  <span
                    key={m.id}
                    style={{
                      width: 20, height: 20, borderRadius: '50%', marginLeft: i === 0 ? 0 : -7,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: m.color, color: memberInk(m.color), fontSize: 10, fontWeight: 700,
                      border: '2px solid var(--hs-bg-card)',
                    }}
                  >
                    {memberInitials(m.name)}
                  </span>
                ))}
                {inGroup.length > shown.length && (
                  <span style={{ marginLeft: 4, fontSize: 11 }}>+{inGroup.length - shown.length}</span>
                )}
              </span>
              {group.name}
            </button>
          );
        })}
        {members.map((m) => {
          const on = assignment.assigneeIds.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => picker.toggleMember(m.id)}
              style={chipStyle(on)}
            >
              <Initial name={m.name} color={m.color} />
              {m.name}
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--hs-text-faint)', margin: '4px 2px 18px' }}>
        {tModules('chore-chart.starter.whoHint')}
      </p>

      {sections.map((view) => (
        <div key={view.section} data-testid={`starter-section-${view.section}`}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '14px 2px 8px' }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: REMOTE_ACCENT }}>
              {tModules(`chore-chart.starter.sections.${view.section}`)}
            </span>
            <span style={{ flex: 1, fontSize: 12, color: 'var(--hs-text-faint)' }}>
              {view.picked > 0 && tModules('chore-chart.starter.pickedCount', { picked: view.picked, total: view.available })}
            </span>
            {view.available > 0 && (
              <button
                type="button"
                className="press-scale-xs"
                onClick={() => picker.toggleSection(view.section)}
                style={{ background: 'none', border: 'none', padding: '6px 2px', color: 'var(--hs-text-faint)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {tModules(view.allPicked ? 'chore-chart.starter.selectNone' : 'chore-chart.starter.selectAll')}
              </button>
            )}
          </div>
          {/* A weekly chore is due on the days it lists, so "once a week" is one day for the whole section. */}
          {view.section === 'weekly' && (
            <div style={{ margin: '0 2px 10px' }} role="radiogroup" aria-label={tModules('chore-chart.starter.weeklyDay')}>
              {/* The label sits above the row: "An welchem Tag" beside seven buttons wraps to three lines at phone width. */}
              <div style={{ fontSize: 12.5, color: 'var(--hs-text-faint)', marginBottom: 6 }}>{tModules('chore-chart.starter.weeklyDay')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                const on = picker.weeklyDay === d;
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={dayNamesShort[d]}
                    data-testid={`starter-weekly-day-${d}`}
                    className="press-scale-xs"
                    onClick={() => picker.setWeeklyDay(d)}
                    style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                      border: on ? 'none' : '1px solid var(--hs-border)',
                      background: on ? REMOTE_ACCENT : 'var(--hs-bg-panel)',
                      color: on ? '#fff' : 'var(--hs-text-faint)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {dayNamesShort[d][0]}
                  </button>
                );
              })}
              </div>
            </div>
          )}
          <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--hs-border)' }}>
            {view.starters.map((starter, i) => {
              const added = alreadyAdded.has(starter.id);
              const on = pickedIds.has(starter.id);
              return (
                <button
                  key={starter.id}
                  type="button"
                  role="checkbox"
                  aria-checked={added ? true : on}
                  aria-disabled={added || undefined}
                  data-testid={`starter-${starter.id}`}
                  onClick={() => picker.toggle(starter.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '11px 14px',
                    minHeight: 50,
                    background: added ? 'var(--hs-bg-body)' : 'var(--hs-bg-panel)',
                    border: 'none',
                    borderTop: i === 0 ? 'none' : '1px solid var(--hs-border)',
                    cursor: added ? 'default' : 'pointer',
                    color: 'inherit',
                    textAlign: 'left' as const,
                    transition: 'all 0.15s',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: on || added ? 'none' : '2px solid var(--hs-border-strong)',
                      background: on ? REMOTE_ACCENT : added ? 'var(--hs-bg-card)' : 'transparent',
                    }}
                  >
                    {(on || added) && <Check size={14} color={added ? 'var(--hs-text-faint)' : 'white'} strokeWidth={3} />}
                  </span>
                  <span
                    aria-hidden
                    style={{
                      width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: withAlpha(REMOTE_ACCENT, 0.13),
                      opacity: added ? 0.45 : 1,
                    }}
                  >
                    <ChoreIcon value={`lucide:${starter.icon}`} size={18} color={REMOTE_ACCENT} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, lineHeight: 1.25, color: added ? 'var(--hs-text-faint)' : 'var(--hs-text-body)' }}>
                    {starter.name}
                  </span>
                  {added ? (
                    <span style={{ fontSize: 12, color: 'var(--hs-text-faint)', border: '1px dashed var(--hs-border-strong)', borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>
                      {tModules('chore-chart.starter.alreadyAdded')}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--hs-text-faint)', background: 'var(--hs-bg-hover)', borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>
                      {tModules('chore-chart.ticketsCount', { count: starter.points })}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </FormOverlay>
  );
}
