'use client';

import { useEffect } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { readChoreSettings } from '@/lib/chore-bonus';
import { useTranslate } from '@/i18n';
import { GrabHoldChoice, GrabLimitChoice, useGrabRulesSave } from './GrabRuleChoices';

/**
 * The household's chore settings on the editor's Family page: how bonus
 * chores are grabbed. The same two values as the phone's Chore settings sheet,
 * saved to the same place (`PUT /api/chores/settings`). Self-saving, like the
 * meals section: chore settings live in `data/chores.json`, not the config the
 * page's Save button writes.
 */
export default function ChoreSettingsSection() {
  const t = useTranslate('editor');
  const { settings, setSettings, save, failed, setFailed, savedAt } = useGrabRulesSave(null);

  useEffect(() => {
    let cancelled = false;
    editorFetch('/api/chores/data')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => { if (!cancelled) setSettings(readChoreSettings(data?.settings)); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [setSettings, setFailed]);

  return (
    <div className="mt-8 space-y-5" data-testid="chore-settings-section">
      <div>
        {/* "Saved" sits beside the heading so nothing below moves under the pointer. */}
        <div className="flex items-baseline gap-3">
          <h3 className="text-sm font-semibold text-hs-text-body">{t('settings.familyPage.chores.heading')}</h3>
          <span role="status" className="text-xs text-hs-success">{savedAt > 0 ? t('settings.familyPage.chores.saved') : ''}</span>
        </div>
        <p className="text-xs text-hs-text-muted mt-0.5">{t('settings.familyPage.chores.description')}</p>
      </div>
      {failed && <p role="alert" className="text-xs text-hs-danger">{t('settings.familyPage.chores.saveFailed')}</p>}
      {settings && (
        <>
          <section data-field-id="family.grabLimit"><GrabLimitChoice settings={settings} onPick={(next) => void save(next)} /></section>
          <section data-field-id="family.grabHold"><GrabHoldChoice settings={settings} onPick={(next) => void save(next)} /></section>
        </>
      )}
    </div>
  );
}
