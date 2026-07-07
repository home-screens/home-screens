'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Plus, Check } from 'lucide-react';
import type {
  ChoreMember,
  ChoreDefinition,
  ChoreResetFrequency,
  ChoreTimeOfDay,
  ChoreRotation,
} from '@/types/config';
import {
  cascadeDeleteMember,
  addMemberToList,
  updateMemberInList,
  addChoreToList,
  updateChoreInList,
  removeChoreFromList,
  getTimeOfDayLabelKey,
} from '@/components/modules/chore-chart/types';
import { getLocalizedDayNames } from '@/lib/meal-constants';
import ChoreIcon, {
  MEMBER_ICONS,
  CHORE_ICONS,
} from '@/components/modules/chore-chart/ChoreIcon';
import IconPicker from '@/components/modules/chore-chart/IconPicker';
import { useChoreForm, useMemberForm, useChoreLabelMaps } from '@/components/modules/chore-chart/form-hooks';
import { INPUT_STYLE, SELECT_STYLE, LABEL_STYLE } from './chore-form-styles';
import { CHORE_FREQUENCIES, CHORE_ROTATIONS } from '@/lib/chore-constants';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { buildChoreSummaryLine } from '@/components/modules/chore-chart/chore-form-presentation';
import MobileColorPicker from './MobileColorPicker';
import FormOverlay from './FormOverlay';
import ConfirmSheet from './ConfirmSheet';

// ── MemberFormOverlay ─────────────────────────────────────────────

function MemberFormOverlay({
  initial,
  choreCount,
  onSubmit,
  onDelete,
  onBack,
}: {
  initial?: ChoreMember;
  choreCount?: number;
  onSubmit: (data: Omit<ChoreMember, 'id'>) => void;
  onDelete?: () => void;
  onBack: () => void;
}) {
  const t = useTranslate('remote');
  const f = useMemberForm(initial);
  const { name, emoji, color, setName, setEmoji, setColor, canSave } = f;
  const [showConfirm, setShowConfirm] = useState(false);
  const isEdit = !!initial;
  const handleSubmit = () => f.submit(onSubmit);

  const memberDeleteDescription = (() => {
    const displayName = name || t('choresManage.memberDelete.fallbackName');
    if (!choreCount) {
      return t('choresManage.memberDelete.descriptionNoChores', { name: displayName });
    }
    if (choreCount === 1) {
      return t('choresManage.memberDelete.descriptionWithChoresSingular', {
        name: displayName,
        count: choreCount,
      });
    }
    return t('choresManage.memberDelete.descriptionWithChoresPlural', {
      name: displayName,
      count: choreCount,
    });
  })();

  return (
    <>
      <FormOverlay
        title={isEdit ? t('choresManage.memberForm.titleEdit') : t('choresManage.memberForm.titleNew')}
        onBack={onBack}
      >
        <div style={{ marginBottom: 24 }}>
          <div style={LABEL_STYLE}>{t('choresManage.memberForm.nameLabel')}</div>
          <input
            type="text"
            placeholder={t('choresManage.memberForm.namePlaceholder')}
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
          icons={MEMBER_ICONS}
          label={t('choresManage.memberForm.avatarLabel')}
          variant="mobile"
        />

        <MobileColorPicker value={color} onChange={setColor} />

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
            background: canSave ? color : 'var(--hs-text-faint)',
            opacity: canSave ? 1 : 0.5,
            transition: 'all 0.15s',
          }}
        >
          {isEdit
            ? t('choresManage.memberForm.saveSubmit')
            : t('choresManage.memberForm.addSubmit')}
        </button>

        {isEdit && onDelete && (
          <button
            className="press-scale"
            onClick={() => setShowConfirm(true)}
            style={{
              width: '100%',
              minHeight: 48,
              padding: 14,
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              background: 'color-mix(in srgb, var(--hs-danger) 12%, transparent)',
              color: 'var(--hs-danger)',
              border: 'none',
              cursor: 'pointer',
              marginTop: 12,
              transition: 'all 0.15s',
            }}
          >
            {t('choresManage.memberForm.deleteButton')}
          </button>
        )}
      </FormOverlay>

      {showConfirm && onDelete && (
        <ConfirmSheet
          title={t('choresManage.memberDelete.title', { name })}
          description={memberDeleteDescription}
          confirmLabel={t('choresManage.memberDelete.confirmLabel')}
          onConfirm={() => { onDelete(); }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}

// ── ChoreFormOverlay ──────────────────────────────────────────────

function ChoreFormOverlay({
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
  const tEditor = useTranslate('editor');
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
  const [showConfirm, setShowConfirm] = useState(false);
  const isEdit = !!initial;
  const handleSubmit = () => f.submit(onSubmit);

  // The frequency/rotation labels resolve through the editor namespace on both
  // surfaces, so this overlay passes its `tEditor` binding.
  const { frequencyLabelMap, rotationLabelMap } = useChoreLabelMaps(tEditor);

  return (
    <>
      <FormOverlay
        title={isEdit ? t('choresManage.choreForm.titleEdit') : t('choresManage.choreForm.titleNew')}
        onBack={onBack}
      >
        {/* Name */}
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

        {/* Icon */}
        <IconPicker
          value={emoji}
          onChange={setEmoji}
          icons={CHORE_ICONS}
          label={t('choresManage.choreForm.iconLabel')}
          variant="mobile"
        />

        {/* Points & Frequency */}
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

        {/* Time of Day */}
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

        {rotation !== 'schedule' && (
          <>
            {/* Days — date picker for one-time, day-of-week toggles for recurring */}
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

            {/* Assignees */}
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
          </>
        )}

        {rotation === 'schedule' && (
          <div style={{ marginBottom: 24 }}>
            <div style={LABEL_STYLE}>{t('choresManage.choreForm.weeklyScheduleLabel')}</div>
            {/* Day headers */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 4, paddingLeft: 70 }}>
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <div key={d} style={{ width: 32, textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--hs-text-faint)', letterSpacing: '0.04em' }}>
                  {dayNamesShort[d][0]}
                </div>
              ))}
            </div>
            {/* Member rows */}
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
                              width: 32, height: 32, borderRadius: '50%',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 700, flexShrink: 0,
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
            {/* Add member buttons */}
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
                      padding: '8px 12px', borderRadius: 10,
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
            {/* Coverage summary */}
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--hs-text-faint)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{t('choresManage.choreForm.coverageLabel', { covered: scheduleDays.length })}</span>
              {scheduleDays.length < 7 && (
                <>
                  {' · '}
                  <span style={{ color: 'var(--hs-warning)', fontSize: 10 }}>
                    {tEditor('choreChartModal.choreForm.coverageUncovered', {
                      days: [0,1,2,3,4,5,6].filter((d) => !scheduleDays.includes(d)).map((d) => dayNamesShort[d]).join(', '),
                    })}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Rotation */}
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

        {/* Validation hint */}
        {validationHintKind && (
          <p style={{ fontSize: 13, color: 'var(--hs-warning)', textAlign: 'center', margin: '0 0 8px' }}>
            {tEditor(`choreChartModal.choreForm.validation.${validationHintKind}`)}
          </p>
        )}

        {/* Save */}
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

        {/* Delete */}
        {isEdit && onDelete && (
          <button
            className="press-scale"
            onClick={() => setShowConfirm(true)}
            style={{
              width: '100%',
              minHeight: 48,
              padding: 14,
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              background: 'color-mix(in srgb, var(--hs-danger) 12%, transparent)',
              color: 'var(--hs-danger)',
              border: 'none',
              cursor: 'pointer',
              marginTop: 12,
              transition: 'all 0.15s',
            }}
          >
            {t('choresManage.choreForm.deleteButton')}
          </button>
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

// ── Main Exported Component ───────────────────────────────────────

interface ChoresManageViewProps {
  members: ChoreMember[];
  chores: ChoreDefinition[];
  onMembersChange: (members: ChoreMember[]) => void;
  onChoresChange: (chores: ChoreDefinition[]) => void;
}

export default function ChoresManageView({
  members,
  chores,
  onMembersChange,
  onChoresChange,
}: ChoresManageViewProps) {
  const t = useTranslate('remote');
  const tEditor = useTranslate('editor');
  const tModules = useTranslate('modules');
  const [section, setSection] = useState<'members' | 'chores'>('chores');
  const [overlay, setOverlay] = useState<
    | { type: 'member-form'; member?: ChoreMember }
    | { type: 'chore-form'; chore?: ChoreDefinition }
    | null
  >(null);

  // ── CRUD helpers ──

  const addMember = (data: Omit<ChoreMember, 'id'>) => {
    onMembersChange(addMemberToList(members, data));
    setOverlay(null);
  };

  const updateMember = (id: string, data: Omit<ChoreMember, 'id'>) => {
    onMembersChange(updateMemberInList(members, id, data));
    setOverlay(null);
  };

  const deleteMember = (id: string) => {
    const result = cascadeDeleteMember(members, chores, id);
    onMembersChange(result.members);
    onChoresChange(result.chores);
    setOverlay(null);
  };

  const addChore = (data: Omit<ChoreDefinition, 'id'>) => {
    onChoresChange(addChoreToList(chores, data));
    setOverlay(null);
  };

  const updateChore = (id: string, data: Omit<ChoreDefinition, 'id'>) => {
    onChoresChange(updateChoreInList(chores, id, data));
    setOverlay(null);
  };

  const deleteChore = (id: string) => {
    onChoresChange(removeChoreFromList(chores, id));
    setOverlay(null);
  };

  // Count chores per member
  const memberChoreCount = (memberId: string) =>
    chores.filter((c) => c.assigneeIds.includes(memberId)).length;

  return (
    <div>
      {/* Inner tabs: Members / Chores */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: 3,
          background: 'var(--hs-bg-card)',
          borderRadius: 10,
          marginBottom: 16,
        }}
      >
        {(['chores', 'members'] as const).map((tab) => {
          const isActive = section === tab;
          const count = tab === 'members' ? members.length : chores.length;
          return (
            <button
              key={tab}
              onClick={() => setSection(tab)}
              style={{
                flex: 1,
                padding: '8px 12px',
                minHeight: 40,
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s',
                background: isActive ? 'var(--hs-bg-hover)' : 'transparent',
                color: isActive ? 'var(--hs-text-body)' : 'var(--hs-text-faint)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {t(`choresManage.tabs.${tab}`)}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 20,
                  height: 20,
                  padding: '0 6px',
                  borderRadius: 999,
                  background: 'var(--hs-bg-hover)',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Member List */}
      {section === 'members' && (
        <div>
          {members.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 16px' }}>
              <p style={{ fontSize: 14, color: 'var(--hs-text-faint)', marginBottom: 4 }}>
                {t('choresManage.members.empty')}
              </p>
              <p style={{ fontSize: 12, color: 'var(--hs-text-faint)' }}>
                {t('choresManage.members.emptyHint')}
              </p>
            </div>
          )}

          {members.map((member) => {
            const choreCount = memberChoreCount(member.id);
            return (
              <button
                key={member.id}
                className="press-scale"
                aria-label={t('choresManage.members.editAriaLabel', { name: member.name })}
                onClick={() => setOverlay({ type: 'member-form', member })}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  background: 'var(--hs-bg-card)',
                  borderRadius: 14,
                  marginBottom: 8,
                  border: '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  textAlign: 'left' as const,
                  color: 'inherit',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: `color-mix(in srgb, ${member.color} 15%, transparent)`,
                  }}
                >
                  {member.emoji ? (
                    <ChoreIcon value={member.emoji} size={20} color={member.color} />
                  ) : (
                    <span style={{ fontSize: 16, fontWeight: 600, color: member.color }}>{member.name[0]}</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--hs-text-body)' }}>{member.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: member.color,
                        flexShrink: 0,
                      }}
                    />
                    {choreCount === 1
                      ? t('choresManage.members.choreCountSingular', { n: choreCount })
                      : t('choresManage.members.choreCountPlural', { n: choreCount })}
                  </div>
                </div>
                <ChevronRight size={20} color="var(--hs-text-faint)" style={{ flexShrink: 0 }} />
              </button>
            );
          })}

          <button
            className="press-scale"
            onClick={() => setOverlay({ type: 'member-form' })}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 14,
              minHeight: 48,
              borderRadius: 14,
              border: '2px dashed var(--hs-border)',
              color: 'var(--hs-text-faint)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
              marginTop: 4,
              background: 'none',
            }}
          >
            <Plus size={18} />
            {t('choresManage.members.addButton')}
          </button>
        </div>
      )}

      {/* Chore List */}
      {section === 'chores' && (
        <div>
          {chores.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 16px' }}>
              <p style={{ fontSize: 14, color: 'var(--hs-text-faint)', marginBottom: 4 }}>
                {t('choresManage.chores.empty')}
              </p>
              {members.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--hs-text-faint)' }}>
                  {t('choresManage.chores.emptyHintNoMembers')}
                </p>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--hs-text-faint)' }}>
                  {t('choresManage.chores.emptyHintAddChores')}
                </p>
              )}
            </div>
          )}

          {chores.map((chore) => {
            let rotationLabel: string | null = null;
            if ((chore.rotation !== 'fixed' && chore.assigneeIds.length > 1) || chore.rotation === 'schedule') {
              if (chore.rotation === 'rotate-daily') rotationLabel = tEditor('choreChartModal.choreSummary.rotationDaily');
              else if (chore.rotation === 'rotate-weekly') rotationLabel = tEditor('choreChartModal.choreSummary.rotationWeekly');
              else rotationLabel = tEditor('choreChartModal.choreSummary.rotationSchedule');
            }
            return (
              <button
                key={chore.id}
                className="press-scale"
                aria-label={t('choresManage.chores.editAriaLabel', { name: chore.name })}
                onClick={() => setOverlay({ type: 'chore-form', chore })}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  background: 'var(--hs-bg-card)',
                  borderRadius: 14,
                  marginBottom: 8,
                  border: '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  textAlign: 'left' as const,
                  color: 'inherit',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: 'var(--hs-bg-hover)',
                  }}
                >
                  {chore.emoji ? (
                    <ChoreIcon value={chore.emoji} size={20} color="var(--hs-text-muted)" />
                  ) : (
                    <span style={{ fontSize: 14, color: 'var(--hs-text-faint)' }}>?</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--hs-text-body)' }}>{chore.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 2 }}>
                    {buildChoreSummaryLine({ chore, t: tEditor, tModules })}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--hs-text-faint)', marginTop: 2 }}>
                    &rarr;{' '}
                    {chore.assigneeIds
                      .map((id) => members.find((m) => m.id === id)?.name ?? tEditor('choreChartModal.chores.unknownAssignee'))
                      .join(', ')}
                    {rotationLabel && (
                      <span> ({rotationLabel})</span>
                    )}
                  </div>
                </div>
                <ChevronRight size={20} color="var(--hs-text-faint)" style={{ flexShrink: 0 }} />
              </button>
            );
          })}

          <button
            className="press-scale"
            onClick={() => {
              if (members.length === 0) return;
              setOverlay({ type: 'chore-form' });
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 14,
              minHeight: 48,
              borderRadius: 14,
              border: '2px dashed var(--hs-border)',
              color: members.length === 0 ? 'var(--hs-border-strong)' : 'var(--hs-text-faint)',
              fontSize: 14,
              fontWeight: 600,
              cursor: members.length === 0 ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              marginTop: 4,
              background: 'none',
            }}
          >
            <Plus size={18} />
            {t('choresManage.chores.addButton')}
          </button>
        </div>
      )}

      {/* ── Overlays ── */}

      {overlay?.type === 'member-form' && (
        <MemberFormOverlay
          key={overlay.member?.id ?? 'new'}
          initial={overlay.member}
          choreCount={overlay.member ? memberChoreCount(overlay.member.id) : undefined}
          onSubmit={(data) =>
            overlay.member
              ? updateMember(overlay.member.id, data)
              : addMember(data)
          }
          onDelete={
            overlay.member
              ? () => deleteMember(overlay.member!.id)
              : undefined
          }
          onBack={() => setOverlay(null)}
        />
      )}

      {overlay?.type === 'chore-form' && (
        <ChoreFormOverlay
          key={overlay.chore?.id ?? 'new'}
          initial={overlay.chore}
          members={members}
          onSubmit={(data) =>
            overlay.chore
              ? updateChore(overlay.chore.id, data)
              : addChore(data)
          }
          onDelete={
            overlay.chore
              ? () => deleteChore(overlay.chore!.id)
              : undefined
          }
          onBack={() => setOverlay(null)}
        />
      )}
    </div>
  );
}
