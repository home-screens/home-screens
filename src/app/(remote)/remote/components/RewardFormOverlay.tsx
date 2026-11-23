'use client';

import type { FamilyMember } from '@/types/family';

import { useState } from 'react';

import type { RewardDefinition } from '@/lib/reward-data';
import { uuid } from '@/lib/uuid';
import { useFormattingLocale, useTranslate, formatList } from '@/i18n';
import { FIELD, FIELD_LABEL, REMOTE_ACCENT, REMOTE_ACCENT_INK } from './remote-styles';
import { REWARD_ICONS } from '@/lib/chore-constants';
import PhoneIconPicker from '@/components/custom-icons/PhoneIconPicker';
import { DEFAULT_REWARD_ICON } from '@/lib/chore-constants';
import FormOverlay from './FormOverlay';
import PhoneSwitch from './PhoneSwitch';
import SaveDeleteFooter from './SaveDeleteFooter';
import { useFormDirty } from '@/hooks/useFormDirty';
import ConfirmSheet from './ConfirmSheet';
import { withAlpha } from '@/lib/hex-color';
import { buildDeleteConfirm, sheetQuestion } from '@/lib/delete-confirmations';

interface RewardFormOverlayProps {
  reward: RewardDefinition | null; // null = add mode
  members: FamilyMember[];
  /** Names of the people saving for this reward: said on the form, and before hiding or deleting it. */
  savers?: string[];
  onSave: (reward: RewardDefinition) => void;
  onDelete?: (id: string) => void;
  onBack: () => void;
}

export default function RewardFormOverlay({
  reward,
  members,
  savers = [],
  onSave,
  onDelete,
  onBack,
}: RewardFormOverlayProps) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const saverNames = formatList(savers, locale);
  const saverLine = savers.length === 0 ? null : t(savers.length === 1 ? 'rewardForm.saverOne' : 'rewardForm.saverMany', { names: saverNames });
  const goalClearsLine = t('rewardForm.deleteConfirm.goalClears', { count: savers.length });
  const hiddenLine = savers.length === 0 ? null : t('rewardForm.hiddenWithSavers', { names: saverNames, count: savers.length });
  const isEdit = reward !== null;
  const [name, setName] = useState(reward?.name ?? '');
  const [emoji, setEmoji] = useState(reward?.emoji ?? DEFAULT_REWARD_ICON);
  const [costStr, setCostStr] = useState(String(reward?.cost ?? 10));
  const [description, setDescription] = useState(reward?.description ?? '');
  const [memberIds, setMemberIds] = useState<string[]>(reward?.memberIds ?? []);
  const [enabled, setEnabled] = useState(reward?.enabled ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = useFormDirty([name, emoji, costStr, description, memberIds, enabled]);

  const isEveryone = memberIds.length === 0;

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: reward?.id ?? uuid(),
      name: name.trim(),
      emoji,
      cost: Math.max(1, Number(costStr) || 1),
      description: description.trim(),
      memberIds,
      enabled,
    });
  };

  const toggleMember = (id: string) => {
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  return (
    <>
      <FormOverlay
        title={isEdit ? t('rewardForm.titleEdit') : t('rewardForm.titleNew')}
        dirty={dirty}
        onBack={onBack}
        footer={
          <SaveDeleteFooter
            saveLabel={isEdit ? undefined : t('rewardForm.addSubmit')}
            canSave={Boolean(name.trim())}
            onSave={handleSave}
            // A greyed-out Save with no word about it reads as broken, as on the chore and routine forms.
            notice={name.trim() ? null : t('rewardForm.whyNoSave')}
            deleteLabel={isEdit && onDelete ? t('rewardForm.deleteButton') : undefined}
            onDelete={() => setConfirmDelete(true)}
          />
        }
      >
        <PhoneIconPicker
          value={emoji}
          onChange={setEmoji}
          choices={{ kind: 'icons', names: REWARD_ICONS }}
          label={t('rewardForm.iconLabel')}
          suggestedName={name}
        />

        <div style={{ marginBottom: 24 }}>
          <div style={FIELD_LABEL}>{t('rewardForm.nameLabel')}</div>
          <input
            style={FIELD}
            type="text"
            placeholder={t('rewardForm.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          {/* Said here, before anyone hides or deletes it, not only in the delete sheet. */}
          {saverLine && (
            <p data-testid="reward-savers" style={{ fontSize: 12.5, color: 'var(--hs-text-muted)', margin: '8px 2px 0' }}>
              {saverLine}
            </p>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          <div>
            <div style={FIELD_LABEL}>{t('rewardForm.ticketCostLabel')}</div>
            <input
              style={FIELD}
              type="number"
              min={1}
              placeholder={t('rewardForm.ticketCostPlaceholder')}
              value={costStr}
              onChange={(e) => setCostStr(e.target.value)}
            />
          </div>
          <div>
            <div style={FIELD_LABEL}>{t('rewardForm.enabledLabel')}</div>
            {/* The words say the state; the switch itself is named for the field. */}
            <PhoneSwitch
              checked={enabled}
              onChange={setEnabled}
              label={enabled ? t('rewardForm.visible') : t('rewardForm.hidden')}
              ariaLabel={t('rewardForm.enabledLabel')}
              style={{ ...FIELD, padding: '8px 12px 8px 16px' }}
            />
            {/* Hiding parks the kids' goals: their cards go empty until it is shown again. */}
            {!enabled && hiddenLine && (
              <p data-testid="reward-hidden-savers" style={{ fontSize: 12, color: 'var(--hs-text-muted)', margin: '8px 2px 0', lineHeight: 1.4 }}>{hiddenLine}</p>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={FIELD_LABEL}>{t('rewardForm.descriptionLabel')}</div>
          <input
            style={FIELD}
            type="text"
            placeholder={t('rewardForm.descriptionPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={FIELD_LABEL}>{t('rewardForm.availableToLabel')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button
              className="press-scale-xs"
              onClick={() => setMemberIds([])}
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                border: isEveryone ? `1px solid ${withAlpha(REMOTE_ACCENT, 0.3)}` : '1px solid transparent',
                background: isEveryone ? withAlpha(REMOTE_ACCENT, 0.15) : 'var(--hs-bg-card)',
                color: isEveryone ? REMOTE_ACCENT_INK : 'var(--hs-text-faint)',
                transition: 'all 0.15s',
              }}
            >
              {t('rewardForm.everyone')}
            </button>
            {members.map((m) => {
              const isSelected = memberIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  className="press-scale-xs"
                  onClick={() => toggleMember(m.id)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    border: isSelected ? `1px solid ${withAlpha(m.color, 0.25)}` : '1px solid transparent',
                    background: isSelected ? `color-mix(in srgb, ${m.color} 15%, transparent)` : 'var(--hs-bg-card)',
                    color: isSelected ? m.color : 'var(--hs-text-faint)',
                    transition: 'all 0.15s',
                  }}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>

      </FormOverlay>

      {confirmDelete && (
        <ConfirmSheet
          {...sheetQuestion(buildDeleteConfirm({
            verb: 'delete',
            name: reward?.name ?? '',
            consequence: `${t('rewardForm.deleteConfirm.description')}${saverLine ? ` ${saverLine} ${goalClearsLine}` : ''}`,
          }, tCore))}
          onConfirm={() => {
            setConfirmDelete(false);
            onDelete?.(reward!.id);
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
