'use client';

import { useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import type { ChoreMember, ChoreDefinition } from '@/types/config';
import {
  cascadeDeleteMember,
  addMemberToList,
  updateMemberInList,
  addChoreToList,
  updateChoreInList,
  removeChoreFromList,
} from '@/components/modules/chore-chart/types';
import ChoreIcon, { MEMBER_ICONS } from '@/components/modules/chore-chart/ChoreIcon';
import IconPicker from '@/components/modules/chore-chart/IconPicker';
import { useMemberForm } from '@/components/modules/chore-chart/form-hooks';
import { INPUT_STYLE, LABEL_STYLE } from './chore-form-styles';
import { useTranslate } from '@/i18n';
import { buildChoreSummaryLine } from '@/components/modules/chore-chart/chore-form-presentation';
import MobileColorPicker from './MobileColorPicker';
import FormOverlay from './FormOverlay';
import ConfirmSheet from './ConfirmSheet';
import ChoreFormOverlay from './ChoreFormOverlay';

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
