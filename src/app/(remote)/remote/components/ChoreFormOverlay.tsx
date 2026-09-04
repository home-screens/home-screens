'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type {
  ChoreMember,
  ChoreDefinition,
  ChoreResetFrequency,
  ChoreTimeOfDay,
  ChoreRotation,
} from '@/types/config';
import { getTimeOfDayLabelKey } from '@/components/modules/chore-chart/types';
import { getLocalizedDayNames } from '@/lib/meal-constants';
import ChoreIcon, { CHORE_ICONS } from '@/components/modules/chore-chart/ChoreIcon';
import IconPicker from '@/components/modules/chore-chart/IconPicker';
import { useChoreForm, useChoreLabelMaps } from '@/components/modules/chore-chart/form-hooks';
import { INPUT_STYLE, SELECT_STYLE, LABEL_STYLE } from './chore-form-styles';
import { CHORE_FREQUENCIES, CHORE_ROTATIONS } from '@/lib/chore-constants';
import { useTranslate, useFormattingLocale } from '@/i18n';
import FormOverlay from './FormOverlay';
import { useFormDirty } from '@/hooks/useFormDirty';
import ConfirmSheet from './ConfirmSheet';

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
  onSubmit,
  onDelete,
  onBack,
}: {
  initial?: ChoreDefinition;
  members: ChoreMember[];
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

  const f = useChoreForm(initial, members);
  const {
    name, emoji, points, frequency, daysOfWeek, specificDate, timeOfDay,
    assigneeIds, rotation, schedule,
    setName, setEmoji, setPoints, setFrequency, setSpecificDate, setTimeOfDay,
    switchToSchedule, switchFromSchedule, setRotation,
    toggleDay, toggleAssignee, toggleScheduleDay, addMemberToSchedule,
    scheduleMembers, scheduleDays, unscheduledMembers,
    canSave, validationHintKind,
  } = f;
  const dirty = useFormDirty([
    name, emoji, points, frequency, daysOfWeek, specificDate, timeOfDay, assigneeIds, rotation, schedule,
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

        <IconPicker
          value={emoji}
          onChange={setEmoji}
          icons={CHORE_ICONS}
          label={t('choresManage.choreForm.iconLabel')}
          variant="mobile"
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
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
        </div>

        {rotation !== 'schedule' && (
          <div style={{ marginBottom: 24 }}>
            <div style={LABEL_STYLE}>{t('choresManage.choreForm.assignToLabel')}</div>
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
                        <ChoreIcon value={m.emoji} size={18} color={m.color} />
                      ) : (
                        <span style={{ fontSize: 14, fontWeight: 600, color: m.color }}>{m.name[0]}</span>
                      )}
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--hs-text-body)', flex: 1 }}>
                      {m.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {rotation === 'schedule' && (
          <div style={{ marginBottom: 24 }}>
            <div style={LABEL_STYLE}>{t('choresManage.choreForm.weeklyScheduleLabel')}</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 4, paddingLeft: 70 }}>
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <div key={d} style={{ width: 36, textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--hs-text-faint)', letterSpacing: '0.04em' }}>
                  {dayNamesShort[d][0]}
                </div>
              ))}
            </div>
            <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--hs-border)' }}>
              {scheduleMembers.map((memberId, i) => {
                const member = members.find((m) => m.id === memberId);
                if (!member) return null;
                const memberDays = schedule[memberId] ?? [];
                return (
                  <div
                    key={memberId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 14px',
                      background: 'var(--hs-bg-panel)',
                      borderBottom: i < scheduleMembers.length - 1 ? '1px solid var(--hs-border)' : 'none',
                      minHeight: 48,
                    }}
                  >
                    <div
                      style={{
                        width: 28, height: 28, borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, background: `color-mix(in srgb, ${member.color} 15%, transparent)`,
                      }}
                    >
                      {member.emoji ? (
                        <ChoreIcon value={member.emoji} size={16} color={member.color} />
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 600, color: member.color }}>{member.name[0]}</span>
                      )}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--hs-text-body)', minWidth: 20, flexShrink: 0 }}>
                      {member.name}
                    </span>
                    {/* Seven day toggles have to share one row next to a name, so
                        they can't each be 44px wide; 36px keeps them thumb-sized
                        without pushing the row into a horizontal scroller. */}
                    <div style={{ display: 'flex', gap: 4, flex: 1, justifyContent: 'flex-end' }}>
                      {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                        const isOn = memberDays.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            className="press-scale-xs"
                            onClick={() => toggleScheduleDay(memberId, d)}
                            style={{
                              width: 36, height: 36, borderRadius: '50%',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 700, flexShrink: 0,
                              border: isOn ? 'none' : '1px solid var(--hs-border)',
                              background: isOn ? member.color : 'var(--hs-bg-panel)',
                              color: isOn ? '#fff' : 'var(--hs-text-faint)',
                              cursor: 'pointer', transition: 'all 0.15s',
                            }}
                          >
                            {dayNamesShort[d][0]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {unscheduledMembers.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
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

        {frequency !== 'once' && (assigneeIds.length >= 2 || rotation === 'schedule') && (
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
        {rotation !== 'schedule' && (
          <div style={{ marginBottom: 24 }}>
            <div style={LABEL_STYLE}>
              {frequency === 'once'
                ? t('choresManage.choreForm.dateLabel')
                : t('choresManage.choreForm.daysLabel')}
            </div>
            {frequency === 'once' ? (
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
