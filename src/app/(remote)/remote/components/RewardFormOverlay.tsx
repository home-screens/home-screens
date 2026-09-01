'use client';

import { useState } from 'react';
import type { ChoreMember } from '@/types/config';
import type { RewardDefinition } from '@/lib/reward-data';
import { uuid } from '@/lib/uuid';
import { useTranslate } from '@/i18n';
import { INPUT_STYLE, LABEL_STYLE } from './chore-form-styles';
import { REWARD_ICONS } from '@/lib/chore-constants';
import IconPicker from '@/components/modules/chore-chart/IconPicker';
import FormOverlay from './FormOverlay';
import ConfirmSheet from './ConfirmSheet';

interface RewardFormOverlayProps {
  reward: RewardDefinition | null; // null = add mode
  members: ChoreMember[];
  onSave: (reward: RewardDefinition) => void;
  onDelete?: (id: string) => void;
  onBack: () => void;
}

export default function RewardFormOverlay({
  reward,
  members,
  onSave,
  onDelete,
  onBack,
}: RewardFormOverlayProps) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const isEdit = reward !== null;
  const [name, setName] = useState(reward?.name ?? '');
  const [emoji, setEmoji] = useState(reward?.emoji ?? 'lucide:gift');
  const [costStr, setCostStr] = useState(String(reward?.cost ?? 10));
  const [description, setDescription] = useState(reward?.description ?? '');
  const [memberIds, setMemberIds] = useState<string[]>(reward?.memberIds ?? []);
  const [enabled, setEnabled] = useState(reward?.enabled ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
        title={isEdit ? t('rewardForm.titleEdit') : t('rewardForm.titleAdd')}
        onBack={onBack}
        footer={
          <div style={{ padding: '12px 16px' }}>
            <button
              type="button"
              className="press-btn"
              onPointerDown={(e) => { e.preventDefault(); handleSave(); }}
              style={{
                width: '100%',
                minHeight: 48,
                borderRadius: 12,
                border: 'none',
                fontSize: 16,
                fontWeight: 600,
                cursor: name.trim() ? 'pointer' : 'default',
                background: name.trim() ? '#f59e0b' : 'var(--hs-border-strong)',
                color: name.trim() ? '#000' : 'var(--hs-text-faint)',
                transition: 'all 0.15s',
              }}
            >
              {t('rewardForm.saveButton')}
            </button>
            {isEdit && onDelete && (
              <button
                type="button"
                className="press-scale"
                onClick={() => setConfirmDelete(true)}
                style={{
                  width: '100%',
                  minHeight: 44,
                  borderRadius: 12,
                  border: 'none',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: 'transparent',
                  color: 'var(--hs-danger)',
                  marginTop: 8,
                }}
              >
                {t('rewardForm.deleteButton')}
              </button>
            )}
          </div>
        }
      >
        <IconPicker
          value={emoji}
          onChange={setEmoji}
          icons={[...REWARD_ICONS]}
          label={t('rewardForm.iconLabel')}
          variant="mobile"
        />

        <div style={{ marginBottom: 24 }}>
          <div style={LABEL_STYLE}>{t('rewardForm.nameLabel')}</div>
          <input
            style={INPUT_STYLE}
            type="text"
            placeholder={t('rewardForm.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          <div>
            <div style={LABEL_STYLE}>{t('rewardForm.ticketCostLabel')}</div>
            <input
              style={INPUT_STYLE}
              type="number"
              min={1}
              placeholder={t('rewardForm.ticketCostPlaceholder')}
              value={costStr}
              onChange={(e) => setCostStr(e.target.value)}
            />
          </div>
          <div>
            <div style={LABEL_STYLE}>{t('rewardForm.enabledLabel')}</div>
            <button
              onClick={() => setEnabled((v) => !v)}
              style={{
                ...INPUT_STYLE,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 26,
                  borderRadius: 13,
                  background: enabled ? '#f59e0b' : 'var(--hs-border-strong)',
                  position: 'relative',
                  transition: 'background 0.15s',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: 'white',
                    position: 'absolute',
                    top: 2,
                    left: enabled ? 20 : 2,
                    transition: 'left 0.15s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }}
                />
              </div>
              <span style={{ fontSize: 14, color: 'var(--hs-text-muted)' }}>
                {enabled ? t('rewardForm.visible') : t('rewardForm.hidden')}
              </span>
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={LABEL_STYLE}>{t('rewardForm.descriptionLabel')}</div>
          <input
            style={INPUT_STYLE}
            type="text"
            placeholder={t('rewardForm.descriptionPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={LABEL_STYLE}>{t('rewardForm.availableToLabel')}</div>
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
                border: isEveryone ? '1px solid rgba(245,158,11,0.3)' : '1px solid transparent',
                background: isEveryone ? 'rgba(245,158,11,0.15)' : 'var(--hs-bg-card)',
                color: isEveryone ? '#f59e0b' : 'var(--hs-text-faint)',
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
                    border: isSelected ? `1px solid ${m.color}40` : '1px solid transparent',
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
          title={t('rewardForm.deleteConfirm.title')}
          description={t('rewardForm.deleteConfirm.description', { name: reward?.name ?? '' })}
          confirmLabel={tCore('actions.delete')}
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
