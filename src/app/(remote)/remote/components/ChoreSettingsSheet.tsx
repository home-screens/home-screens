'use client';

import { useState } from 'react';
import type { ChoreGrabHold, ChoreSettings } from '@/types/config';
import { GRAB_HOLD_CHOICES, GRAB_LIMIT_CHOICES } from '@/lib/chore-bonus';
import { useTranslate } from '@/i18n';
import BottomSheet from './BottomSheet';
import { ChoiceList } from './chore-choice-controls';
import { LABEL_STYLE } from './chore-form-styles';

/**
 * The household's chore settings, from the Manage tab. Works on a draft and
 * saves with a button, like the meal settings sheet; the editor's Settings >
 * Chores page edits the same two values.
 */
export default function ChoreSettingsSheet({ settings, onSave, onClose }: {
  settings: ChoreSettings;
  /** Resolves true when saved; the sheet stays open on a failure so it can be tried again. */
  onSave: (next: ChoreSettings) => Promise<boolean>;
  onClose: () => void;
}) {
  const t = useTranslate('remote');
  const tModules = useTranslate('modules');
  const tCore = useTranslate('core');
  // Only what is changed here: the other value follows the household's as it
  // stands (the phone refreshes it), so saving never puts back a value
  // someone changed elsewhere while this sheet was open.
  const [edits, setEdits] = useState<Partial<ChoreSettings>>({});
  const draft: ChoreSettings = { ...settings, ...edits };
  const setDraft = (update: (prev: ChoreSettings) => ChoreSettings) => {
    const next = update(draft);
    setEdits((prev) => ({
      ...prev,
      ...(next.grabLimit !== draft.grabLimit ? { grabLimit: next.grabLimit } : {}),
      ...(next.grabHold !== draft.grabHold ? { grabHold: next.grabHold } : {}),
    }));
  };
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = async () => {
    setSaving(true);
    setFailed(false);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok) onClose();
    else setFailed(true);
  };

  return (
    <BottomSheet title={t('choreSettings.title')} onClose={onClose} testId="chore-settings-sheet">
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#f59e0b', margin: '0 0 12px' }}>
        {t('choreSettings.grabbingHeading')}
      </div>

      <div style={LABEL_STYLE}>{tModules('chore-chart.settings.grabLimitLabel')}</div>
      <ChoiceList<string>
        testId="chore-settings-limit"
        label={tModules('chore-chart.settings.grabLimitLabel')}
        value={String(draft.grabLimit)}
        onChange={(value) => setDraft((prev) => ({ ...prev, grabLimit: Number(value) }))}
        options={GRAB_LIMIT_CHOICES.map((limit) => ({
          value: String(limit),
          label: tModules(`chore-chart.settings.grabLimit.${limit}`),
          hint: limit === 1 || limit === 0 ? tModules(`chore-chart.settings.grabLimitHint.${limit}`) : undefined,
        }))}
      />

      <div style={{ ...LABEL_STYLE, marginTop: 18 }}>{tModules('chore-chart.settings.grabHoldLabel')}</div>
      <ChoiceList<ChoreGrabHold>
        testId="chore-settings-hold"
        label={tModules('chore-chart.settings.grabHoldLabel')}
        value={draft.grabHold}
        onChange={(grabHold) => setDraft((prev) => ({ ...prev, grabHold }))}
        options={GRAB_HOLD_CHOICES.map((hold) => ({
          value: hold,
          label: tModules(`chore-chart.settings.grabHold.${hold}`),
          hint: tModules(`chore-chart.settings.grabHoldHint.${hold}`),
        }))}
      />
      <p style={{ fontSize: 12, color: 'var(--hs-text-faint)', margin: '10px 0 18px' }}>{t('choreSettings.letGoHint')}</p>

      {failed && (
        <p role="alert" style={{ fontSize: 13, color: 'var(--hs-danger)', margin: '0 0 10px', textAlign: 'center' }}>
          {t('choreSettings.saveFailed')}
        </p>
      )}
      <button
        type="button"
        className="press-btn"
        onClick={save}
        disabled={saving}
        style={{
          width: '100%', minHeight: 48, padding: 14, borderRadius: 12, border: 'none',
          fontSize: 15, fontWeight: 700, color: '#fff', background: '#f59e0b',
          cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
        }}
      >
        {t('choreSettings.save')}
      </button>
      <button
        type="button"
        onClick={onClose}
        style={{ width: '100%', minHeight: 44, marginTop: 4, border: 'none', background: 'none', color: 'var(--hs-text-faint)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
      >
        {tCore('actions.cancel')}
      </button>
    </BottomSheet>
  );
}
