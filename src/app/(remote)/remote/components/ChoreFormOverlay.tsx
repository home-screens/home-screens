'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Users, X } from 'lucide-react';
import type { FamilyGroup, FamilyMember } from '@/types/family';
import type {
  ChoreBonusClaim,
  ChoreBonusComesBack,
  ChoreDefinition,
  ChoreResetFrequency,
  ChoreTimeOfDay,
  ChoreRotation,
} from '@/types/config';
import { getTimeOfDayLabelKey } from '@/components/modules/chore-chart/types';
import { getLocalizedDayNames } from '@/lib/meal-constants';
import { groupMembers } from '@/lib/family-groups';
import FamilyManager from '@/components/family/FamilyManager';
import ChoreIcon, { CHORE_ICONS } from '@/components/modules/chore-chart/ChoreIcon';
import IconPicker from '@/components/modules/chore-chart/IconPicker';
import { useChoreForm, useChoreLabelMaps } from '@/components/modules/chore-chart/form-hooks';
import { comesBackHintKey } from '@/components/modules/chore-chart/chore-form-presentation';
import { INPUT_STYLE, SELECT_STYLE, LABEL_STYLE } from './chore-form-styles';
import { CHORE_FREQUENCIES, CHORE_ROTATIONS } from '@/lib/chore-constants';
import { useTranslate, useFormattingLocale } from '@/i18n';
import FormOverlay from './FormOverlay';
import { useFormDirty } from '@/hooks/useFormDirty';
import ConfirmSheet from './ConfirmSheet';
import { ChoiceList, Segmented } from './chore-choice-controls';

const SUB_LABEL_STYLE = { fontSize: 12, fontWeight: 600, color: 'var(--hs-text-faint)', margin: '0 0 6px' } as const;

/** How many faces a group row shows before the rest become "+N". */
const STACK_LIMIT = 4;

/**
 * One row of the weekly schedule, a person or a group. Two lines, because
 * seven thumb-sized day buttons, a name and a remove button do not fit on one
 * at phone width: who it is and the way to take them off, then the days.
 */
function ScheduleRow({ testId, name, color, days, dayNames, removeLabel, onToggle, onRemove, leading, trailing }: {
  testId: string;
  name: string;
  color: string;
  days: number[];
  dayNames: string[];
  removeLabel: string;
  onToggle: (day: number) => void;
  onRemove: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div data-testid={testId} style={{ padding: '6px 6px 12px 14px', background: 'var(--hs-bg-panel)', borderTop: '1px solid var(--hs-border)', marginTop: -1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {leading}
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--hs-text-body)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </span>
        {trailing}
        <button
          type="button"
          className="press-scale-xs"
          aria-label={removeLabel}
          onClick={onRemove}
          style={{
            width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', color: 'var(--hs-text-faint)', cursor: 'pointer',
          }}
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4, paddingRight: 8 }}>
        {[0, 1, 2, 3, 4, 5, 6].map((d) => {
          const isOn = days.includes(d);
          return (
            <button
              key={d}
              type="button"
              className="press-scale-xs"
              aria-pressed={isOn}
              aria-label={`${name}, ${dayNames[d]}`}
              onClick={() => onToggle(d)}
              style={{
                width: 40, height: 40, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, flexShrink: 0,
                border: isOn ? 'none' : '1px solid var(--hs-border)',
                background: isOn ? color : 'var(--hs-bg-panel)',
                color: isOn ? '#fff' : 'var(--hs-text-faint)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {dayNames[d][0]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const COMES_BACK: ChoreBonusComesBack[] = ['daily', 'weekly', 'manual'];

/** The people in a group as overlapping initials; a group has no color of its own. */
function GroupAvatarStack({ members }: { members: FamilyMember[] }) {
  const shown = members.slice(0, STACK_LIMIT);
  const extra = members.length - shown.length;
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }} title={members.map((m) => m.name).join(', ')}>
      {shown.map((m, i) => (
        <span
          key={m.id}
          style={{
            width: 24, height: 24, borderRadius: '50%', marginLeft: i === 0 ? 0 : -8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: m.color, color: '#fff', fontSize: 11, fontWeight: 700,
            border: '2px solid var(--hs-bg-panel)',
          }}
        >
          {m.name[0]}
        </span>
      ))}
      {extra > 0 && (
        <span style={{ marginLeft: 4, fontSize: 12, fontWeight: 600, color: 'var(--hs-text-faint)' }}>+{extra}</span>
      )}
    </div>
  );
}

/**
 * Create/edit one chore from the phone.
 *
 * Field order is deliberate: name, then the two numbers people always set
 * (tickets and how often), then who does it. Everything after that — which
 * days, what time of day, how it rotates — is refinement. The icon sits in a
 * collapsed row so a 60-icon grid can't push "who does it" off the screen,
 * and Save/Delete live in the overlay footer so they're reachable without
 * scrolling to the bottom.
 */
export default function ChoreFormOverlay({
  initial,
  members,
  groups,
  familyReady,
  onSubmit,
  onDelete,
  onBack,
}: {
  initial?: ChoreDefinition;
  members: FamilyMember[];
  groups: FamilyGroup[];
  /** False until the family list has loaded; the form holds saves until then. */
  familyReady: boolean;
  onSubmit: (data: Omit<ChoreDefinition, 'id'>) => void;
  onDelete?: () => void;
  onBack: () => void;
}) {
  const t = useTranslate('remote');
  const tModules = useTranslate('modules');
  const formattingLocale = useFormattingLocale();
  // Day-of-week labels follow the formatting locale, not the UI language.
  // Memoize so re-renders during day toggles don't redo seven
  // `formatDateSync` calls each tick.
  const dayNamesShort = useMemo(
    () => getLocalizedDayNames(formattingLocale, 'short'),
    [formattingLocale],
  );

  const f = useChoreForm(initial, members, groups, familyReady);
  const {
    kind, bonusClaim, comesBack, setKind, setBonusClaim, setComesBack,
    name, emoji, points, frequency, daysOfWeek, specificDate, timeOfDay,
    assigneeIds, assigneeGroupIds, rotation, schedule, groupSchedule, canRotate, coveredByGroup, goesToNobody,
    setName, setEmoji, setPoints, setFrequency, setSpecificDate, setTimeOfDay,
    switchToSchedule, switchFromSchedule, setRotation,
    toggleDay, toggleAssignee, toggleGroup, toggleScheduleDay, addMemberToSchedule, toggleGroupScheduleDay, addGroupToSchedule,
    removeMemberFromSchedule, removeGroupFromSchedule,
    scheduleMembers, scheduleGroups, scheduleDays, unscheduledMembers, unscheduledGroups,
    canSave, validationHintKind,
  } = f;
  const isBonus = kind === 'bonus';
  const onSchedule = !isBonus && rotation === 'schedule';
  const dirty = useFormDirty([
    kind, bonusClaim, comesBack, name, emoji, points, frequency, daysOfWeek, specificDate, timeOfDay, assigneeIds, assigneeGroupIds, rotation, schedule, groupSchedule,
  ]);
  // "Enter a chore name" on a form nobody has touched yet reads as an error
  // before anything went wrong. Latch on the first edit and leave it on, so
  // clearing the name back to empty still shows the hint.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (dirty) setTouched(true);
  }, [dirty]);
  const [showConfirm, setShowConfirm] = useState(false);
  const isEdit = !!initial;
  const handleSubmit = () => f.submit(onSubmit);

  // The frequency/rotation labels resolve through the modules namespace on
  // both surfaces, so this overlay passes its `tModules` binding.
  const { frequencyLabelMap, rotationLabelMap } = useChoreLabelMaps(tModules);

  return (
    <>
      <FormOverlay
        title={isEdit ? t('choresManage.choreForm.titleEdit') : t('choresManage.choreForm.titleNew')}
        dirty={dirty}
        onBack={onBack}
        footer={
          <div style={{ padding: '12px 16px' }}>
            {touched && validationHintKind && (
              <p style={{ fontSize: 13, color: 'var(--hs-warning)', textAlign: 'center', margin: '0 0 8px' }}>
                {tModules(`chore-chart.choreForm.validation.${validationHintKind}`)}
              </p>
            )}
            <button
              className="press-btn"
              onClick={handleSubmit}
              disabled={!canSave}
              style={{
                width: '100%',
                minHeight: 48,
                padding: 14,
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 700,
                color: '#fff',
                border: 'none',
                cursor: canSave ? 'pointer' : 'default',
                background: canSave ? '#f59e0b' : 'var(--hs-text-faint)',
                opacity: canSave ? 1 : 0.5,
                transition: 'all 0.15s',
              }}
            >
              {isEdit
                ? t('choresManage.choreForm.saveSubmit')
                : t('choresManage.choreForm.addSubmit')}
            </button>

            {isEdit && onDelete && (
              <button
                className="press-scale"
                onClick={() => setShowConfirm(true)}
                style={{
                  width: '100%',
                  minHeight: 44,
                  padding: 12,
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 600,
                  background: 'transparent',
                  color: 'var(--hs-danger)',
                  border: 'none',
                  cursor: 'pointer',
                  marginTop: 8,
                  transition: 'all 0.15s',
                }}
              >
                {t('choresManage.choreForm.deleteButton')}
              </button>
            )}
          </div>
        }
      >
        <div style={{ marginBottom: 24 }}>
          <div style={LABEL_STYLE}>{t('choresManage.choreForm.nameLabel')}</div>
          <input
            type="text"
            placeholder={t('choresManage.choreForm.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            style={INPUT_STYLE}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={LABEL_STYLE}>{tModules('chore-chart.choreForm.kindLabel')}</div>
          <Segmented
            testId="chore-kind"
            label={tModules('chore-chart.choreForm.kindLabel')}
            value={kind}
            onChange={setKind}
            options={[
              { value: 'regular', label: tModules('chore-chart.choreForm.kindRegular') },
              { value: 'bonus', label: tModules('chore-chart.choreForm.kindBonus') },
            ]}
          />
          {isBonus && (
            <p style={{ fontSize: 12, color: 'var(--hs-text-faint)', margin: '6px 0 0' }}>
              {tModules('chore-chart.choreForm.bonusHint')}
            </p>
          )}
        </div>

        <IconPicker
          value={emoji}
          onChange={setEmoji}
          icons={CHORE_ICONS}
          label={t('choresManage.choreForm.iconLabel')}
          variant="mobile"
          suggestedName={name}
        />

        {/* The hint sits under the whole row rather than in the narrow left
            column, where it would wrap to four lines at phone width. It names
            the field it explains so it cannot be read as being about the
            frequency next to it. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 6 }}>
          <div>
            <div style={LABEL_STYLE}>{t('choresManage.choreForm.ticketsLabel')}</div>
            <input
              type="number"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              inputMode="numeric"
              min={0}
              style={{ ...INPUT_STYLE, textAlign: 'center' }}
            />
          </div>
          {isBonus ? null : (
            <div>
              <div style={LABEL_STYLE}>{t('choresManage.choreForm.frequencyLabel')}</div>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as ChoreResetFrequency)}
                style={SELECT_STYLE}
              >
                {CHORE_FREQUENCIES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{frequencyLabelMap[opt.value]}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--hs-text-faint)', margin: '0 0 24px' }}>
          {t('choresManage.choreForm.ticketsHint')}
        </p>

        {/* Full width: "When I put it back" does not fit half a phone in any language. */}
        {isBonus && (
          <div style={{ marginBottom: 24 }}>
            <div style={LABEL_STYLE}>{tModules('chore-chart.choreForm.comesBackLabel')}</div>
            <select
              value={comesBack}
              onChange={(e) => setComesBack(e.target.value as ChoreBonusComesBack)}
              style={SELECT_STYLE}
              data-testid="chore-comes-back"
            >
              {COMES_BACK.map((value) => (
                <option key={value} value={value}>{tModules(`chore-chart.bonus.comesBack.${value}`)}</option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: 'var(--hs-text-faint)', margin: '6px 0 0' }}>
              {tModules(comesBackHintKey(bonusClaim, comesBack))}
            </p>
            {frequency === 'once' && (
              <p data-testid="chore-once-bonus-note" style={{ fontSize: 12, color: 'var(--hs-text-faint)', margin: '6px 0 0' }}>
                {tModules('chore-chart.choreForm.onceBonusNote')}
              </p>
            )}
          </div>
        )}

        {members.length === 0 && <div style={{ marginBottom: 24 }}><FamilyManager variant="mobile" /></div>}

        {isBonus && (
          <div style={{ marginBottom: 24 }}>
            <div style={LABEL_STYLE}>{tModules('chore-chart.choreForm.claimLabel')}</div>
            <ChoiceList<ChoreBonusClaim>
              testId="chore-bonus-claim"
              label={tModules('chore-chart.choreForm.claimLabel')}
              value={bonusClaim}
              onChange={setBonusClaim}
              options={[
                { value: 'first', label: tModules('chore-chart.bonus.upForGrabs'), hint: tModules('chore-chart.choreForm.claimFirstHint') },
                { value: 'each', label: tModules('chore-chart.bonus.everyoneCan'), hint: tModules('chore-chart.choreForm.claimEachHint') },
              ]}
            />
            {/* The grab limit and when a grab ends are household-wide, set elsewhere. */}
            {bonusClaim === 'first' && (
              <p style={{ fontSize: 12, color: 'var(--hs-text-faint)', margin: '6px 0 0' }}>
                {t('choresManage.choreForm.grabRulesNote')}
              </p>
            )}
          </div>
        )}

        {!onSchedule && (
          <div style={{ marginBottom: 24 }}>
            <div style={LABEL_STYLE}>{isBonus ? tModules('chore-chart.choreForm.whoCanLabel') : t('choresManage.choreForm.assignToLabel')}</div>
            {/* A household that never made a group sees the form it always had. */}
            {groups.length > 0 && (
              <>
                <div style={SUB_LABEL_STYLE}>{tModules('chore-chart.choreForm.groupsLabel')}</div>
                <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--hs-border)', marginBottom: 6 }}>
                  {groups.map((group, i) => {
                    const isPicked = assigneeGroupIds.includes(group.id);
                    const inGroup = groupMembers(group, members);
                    return (
                      <button
                        key={group.id}
                        type="button"
                        aria-pressed={isPicked}
                        onClick={() => toggleGroup(group.id)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 16px',
                          minHeight: 48,
                          background: 'var(--hs-bg-panel)',
                          border: 'none',
                          borderBottom: i < groups.length - 1 ? '1px solid var(--hs-border)' : 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          color: 'inherit',
                          textAlign: 'left' as const,
                        }}
                      >
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            border: isPicked ? 'none' : '2px solid var(--hs-border-strong)',
                            background: isPicked ? '#f59e0b' : 'transparent',
                          }}
                        >
                          {isPicked && <Check size={14} color="white" strokeWidth={3} />}
                        </div>
                        <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--hs-text-body)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {group.name}
                        </span>
                        <GroupAvatarStack members={inGroup} />
                      </button>
                    );
                  })}
                </div>
                <p style={{ fontSize: 12, color: goesToNobody ? 'var(--hs-warning)' : 'var(--hs-text-faint)', margin: '0 0 14px' }}>
                  {tModules(goesToNobody ? 'chore-chart.choreForm.emptyGroupNote' : isBonus ? 'chore-chart.choreForm.groupsHintBonus' : 'chore-chart.choreForm.groupsHint')}
                </p>
                <div style={SUB_LABEL_STYLE}>{tModules('chore-chart.choreForm.peopleLabel')}</div>
              </>
            )}
            <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--hs-border)' }}>
              {members.map((m, i) => {
                const isAssigned = assigneeIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleAssignee(m.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      minHeight: 48,
                      background: 'var(--hs-bg-panel)',
                      border: 'none',
                      borderBottom: i < members.length - 1 ? '1px solid var(--hs-border)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      color: 'inherit',
                      textAlign: 'left' as const,
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        border: isAssigned ? 'none' : '2px solid var(--hs-border-strong)',
                        background: isAssigned ? m.color : 'transparent',
                      }}
                    >
                      {isAssigned && <Check size={14} color="white" strokeWidth={3} />}
                    </div>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        background: `color-mix(in srgb, ${m.color} 15%, transparent)`,
                      }}
                    >
                      {m.emoji ? (
                        <ChoreIcon value={m.emoji} size={18} color={m.color} fallback={<span style={{ fontSize: 14, fontWeight: 600, color: m.color }}>{m.name[0]}</span>} />
                      ) : (
                        <span style={{ fontSize: 14, fontWeight: 600, color: m.color }}>{m.name[0]}</span>
                      )}
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--hs-text-body)', flex: 1 }}>
                      {m.name}
                    </span>
                    {/* Ticking a group does not tick its people, so say who it already covers. */}
                    {coveredByGroup.has(m.id) && (
                      <span style={{ fontSize: 12, color: 'var(--hs-text-faint)', flexShrink: 0 }}>
                        {tModules('chore-chart.choreForm.groupMemberNote', { group: coveredByGroup.get(m.id)!.join(', ') })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {onSchedule && (
          <div style={{ marginBottom: 24 }}>
            <div style={LABEL_STYLE}>{t('choresManage.choreForm.weeklyScheduleLabel')}</div>
            <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--hs-border)' }}>
              {/* A group's row is everyone in it, whoever that is on the day. */}
              {scheduleGroups.map((group) => (
                <ScheduleRow
                  key={group.id}
                  testId={`schedule-group-${group.id}`}
                  name={group.name}
                  color="#f59e0b"
                  days={groupSchedule[group.id] ?? []}
                  dayNames={dayNamesShort}
                  removeLabel={tModules('chore-chart.choreForm.removeFromSchedule', { name: group.name })}
                  onToggle={(d) => toggleGroupScheduleDay(group.id, d)}
                  onRemove={() => removeGroupFromSchedule(group.id)}
                  trailing={<GroupAvatarStack members={groupMembers(group, members)} />}
                />
              ))}
              {scheduleMembers.map((memberId) => {
                const member = members.find((m) => m.id === memberId);
                if (!member) return null;
                return (
                  <ScheduleRow
                    key={memberId}
                    testId={`schedule-member-${memberId}`}
                    name={member.name}
                    color={member.color}
                    days={schedule[memberId] ?? []}
                    dayNames={dayNamesShort}
                    removeLabel={tModules('chore-chart.choreForm.removeFromSchedule', { name: member.name })}
                    onToggle={(d) => toggleScheduleDay(memberId, d)}
                    onRemove={() => removeMemberFromSchedule(memberId)}
                    leading={
                      <div
                        style={{
                          width: 28, height: 28, borderRadius: 8,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, background: `color-mix(in srgb, ${member.color} 15%, transparent)`,
                        }}
                      >
                        {member.emoji ? (
                          <ChoreIcon value={member.emoji} size={16} color={member.color} fallback={<span style={{ fontSize: 13, fontWeight: 600, color: member.color }}>{member.name[0]}</span>} />
                        ) : (
                          <span style={{ fontSize: 13, fontWeight: 600, color: member.color }}>{member.name[0]}</span>
                        )}
                      </div>
                    }
                  />
                );
              })}
            </div>
            {goesToNobody && (
              <p style={{ fontSize: 12, color: 'var(--hs-warning)', margin: '8px 0 0' }}>
                {tModules('chore-chart.choreForm.emptyGroupNote')}
              </p>
            )}
            {unscheduledMembers.length + unscheduledGroups.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {unscheduledGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className="press-scale-xs"
                    onClick={() => addGroupToSchedule(group.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 12px', minHeight: 44, borderRadius: 10, maxWidth: '100%',
                      background: 'var(--hs-bg-panel)',
                      border: '1px dashed var(--hs-border)',
                      color: 'var(--hs-text-faint)', fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 14 }}>+</span>
                    <Users size={14} aria-hidden />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</span>
                  </button>
                ))}
                {unscheduledMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="press-scale-xs"
                    onClick={() => addMemberToSchedule(m.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 12px', minHeight: 44, borderRadius: 10,
                      background: 'var(--hs-bg-panel)',
                      border: '1px dashed var(--hs-border)',
                      color: 'var(--hs-text-faint)', fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 14 }}>+</span> {m.name}
                  </button>
                ))}
              </div>
            )}
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--hs-text-faint)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{t('choresManage.choreForm.coverageLabel', { covered: scheduleDays.length })}</span>
              {scheduleDays.length < 7 && (
                <>
                  {' · '}
                  <span style={{ color: 'var(--hs-warning)', fontSize: 12 }}>
                    {tModules('chore-chart.choreForm.coverageUncovered', {
                      days: [0,1,2,3,4,5,6].filter((d) => !scheduleDays.includes(d)).map((d) => dayNamesShort[d]).join(', '),
                    })}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {frequency !== 'once' && canRotate && (
          <div style={{ marginBottom: 24 }}>
            <div style={LABEL_STYLE}>{t('choresManage.choreForm.rotationLabel')}</div>
            <select
              value={rotation}
              onChange={(e) => {
                const val = e.target.value as ChoreRotation;
                if (val === 'schedule') switchToSchedule();
                else if (rotation === 'schedule') switchFromSchedule(val);
                else setRotation(val);
              }}
              style={SELECT_STYLE}
            >
              {CHORE_ROTATIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{rotationLabelMap[opt.value]}</option>
              ))}
            </select>
          </div>
        )}

        {/* Days — date picker for one-time, day-of-week toggles for recurring */}
        {!onSchedule && (
          <div style={{ marginBottom: 24 }}>
            <div style={LABEL_STYLE}>
              {frequency === 'once' && !isBonus
                ? t('choresManage.choreForm.dateLabel')
                : t('choresManage.choreForm.daysLabel')}
            </div>
            {frequency === 'once' && !isBonus ? (
              <input
                type="date"
                value={specificDate}
                onChange={(e) => setSpecificDate(e.target.value)}
                style={INPUT_STYLE}
              />
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                  const isOn = daysOfWeek.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      className="press-scale-xs"
                      // The circle shows one letter, and two pairs of days
                      // share theirs. Name the day and say whether it is on,
                      // the way the schedule rows do.
                      aria-pressed={isOn}
                      aria-label={dayNamesShort[d]}
                      onClick={() => toggleDay(d)}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        fontWeight: 600,
                        flexShrink: 0,
                        border: `1px solid ${isOn ? 'var(--hs-border-strong)' : 'var(--hs-border)'}`,
                        background: isOn ? 'var(--hs-bg-active)' : 'var(--hs-bg-panel)',
                        color: isOn ? 'var(--hs-text-body)' : 'var(--hs-text-faint)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {dayNamesShort[d][0]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* A bonus chore sits in its own section on every screen, never in a time of day. */}
        {!isBonus && (
          <div style={{ marginBottom: 24 }}>
            <div style={LABEL_STYLE}>{t('choresManage.choreForm.timeOfDayLabel')}</div>
            <select
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value as ChoreTimeOfDay)}
              style={SELECT_STYLE}
            >
              {(['morning', 'afternoon', 'evening', 'anytime'] as const).map((tod) => (
                <option key={tod} value={tod}>
                  {tModules(getTimeOfDayLabelKey(tod))}
                </option>
              ))}
            </select>
          </div>
        )}
      </FormOverlay>

      {showConfirm && onDelete && (
        <ConfirmSheet
          title={t('choresManage.choreDelete.title', { name })}
          description={t('choresManage.choreDelete.description')}
          confirmLabel={t('choresManage.choreDelete.confirmLabel')}
          onConfirm={() => { onDelete(); }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
