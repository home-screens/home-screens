'use client';

import { useEffect, useRef, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
import Button from '@/components/ui/Button';
import { SETTINGS_INPUT_CLASS, CHECKBOX_CLASS } from '@/components/ui/input-classes';
import { useConfirmStore } from '@/stores/confirm-store';
import {
  GROWN_UP_ACTIONS,
  GROWN_UP_CODE_LENGTH,
  isGrownUpCode,
  UNLOCK_MINUTE_CHOICES,
  type GrownUpAction,
  type GrownUpStatus,
} from '@/lib/grown-up-code';
import FieldHint from '@/components/ui/FieldHint';

type Editing = null | 'set';

/**
 * The grown-up code on the editor's Family page: set, change or remove the
 * code, tick which jobs ask for it, and how long a right code unlocks.
 * Self-saving, like the chore settings above it: the code lives on the hub in
 * `data/grown-up-code.json` (`/api/grown-up-code`), never in the config the
 * page's Save button writes, and it is never shown again once saved.
 */
export default function GrownUpCodeSection() {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const [status, setStatus] = useState<GrownUpStatus | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [code, setCode] = useState('');
  const [again, setAgain] = useState('');
  const [problem, setProblem] = useState<'mismatch' | 'format' | 'failed' | null>(null);
  const [savedAt, setSavedAt] = useState(0);
  // One save at a time. A tick is built from the list the last answer left, so
  // a second tick made before the first answer came back would send a list
  // without the first one and undo it. The controls wait for the answer.
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    editorFetch('/api/grown-up-code')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((next: GrownUpStatus) => { if (!cancelled) setStatus(next); })
      .catch(() => { if (!cancelled) setProblem('failed'); });
    return () => { cancelled = true; };
  }, []);

  const send = async (method: 'PUT' | 'DELETE', body?: object) => {
    // The ref turns a second save away in the same moment, before the
    // controls have been drawn switched off.
    if (savingRef.current) return false;
    savingRef.current = true;
    setProblem(null);
    setSaving(true);
    try {
      const res = await editorFetch('/api/grown-up-code', {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(await res.json());
      setSavedAt(Date.now());
      return true;
    } catch {
      setProblem('failed');
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const saveCode = async () => {
    // A "Saved" from an earlier change must not sit beside a code that did not save.
    if (!isGrownUpCode(code)) { setSavedAt(0); setProblem('format'); return; }
    if (code !== again) { setSavedAt(0); setProblem('mismatch'); return; }
    if (await send('PUT', { code })) {
      setEditing(null);
      setCode('');
      setAgain('');
    }
  };

  const removeCode = async () => {
    const ok = await useConfirmStore.getState().confirm({
      title: t('settings.familyPage.grownUp.removeConfirmTitle'),
      message: t('settings.familyPage.grownUp.removeConfirmMessage'),
      confirmLabel: t('settings.familyPage.grownUp.removeConfirm'),
      variant: 'danger',
    });
    if (ok) void send('DELETE');
  };

  const toggleAction = (action: GrownUpAction, on: boolean) => {
    if (!status) return;
    const actions = on ? [...status.actions, action] : status.actions.filter((a) => a !== action);
    void send('PUT', { actions });
  };

  const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, GROWN_UP_CODE_LENGTH);
  const problemText = problem === 'mismatch' ? t('settings.familyPage.grownUp.mismatch')
    : problem === 'format' ? t('settings.familyPage.grownUp.format')
    : problem === 'failed' ? tCore('refusals.saveFailed')
    : null;

  return (
    <div className="mt-8 space-y-4" data-testid="grown-up-code-section">
      <div>
        <div className="flex items-baseline gap-3">
          <h3 className="text-sm font-semibold text-hs-text-body">{t('settings.familyPage.grownUp.heading')}</h3>
          <span role="status" className="text-xs text-hs-success">{savedAt > 0 ? t('settings.familyPage.chores.saved') : ''}</span>
        </div>
        <p className="text-xs text-hs-text-muted mt-0.5">{t('settings.familyPage.grownUp.description')}</p>
      </div>
      {problemText && <p role="alert" className="text-xs text-hs-danger">{problemText}</p>}

      {status && (
        <section data-field-id="family.grownUpCode" className="rounded-lg border border-hs-border-strong bg-hs-card px-4 py-3 space-y-3">
          {editing === null && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-hs-text-body">
                {status.set ? t('settings.familyPage.grownUp.isSet') : t('settings.familyPage.grownUp.notSet')}
              </span>
              <span className="ml-auto flex gap-2">
                {status.set ? (
                  <>
                    <Button size="sm" disabled={saving} onClick={() => setEditing('set')}>{t('settings.familyPage.grownUp.change')}</Button>
                    <Button size="sm" disabled={saving} onClick={() => void removeCode()}>{t('settings.familyPage.grownUp.remove')}</Button>
                  </>
                ) : (
                  <Button size="sm" variant="primary" disabled={saving} onClick={() => setEditing('set')}>{t('settings.familyPage.grownUp.set')}</Button>
                )}
              </span>
            </div>
          )}
          {editing && (
            <form
              className="space-y-2"
              onSubmit={(e) => { e.preventDefault(); void saveCode(); }}
            >
              <div className="flex flex-wrap gap-2">
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label={t('settings.familyPage.grownUp.codeLabel')}
                  placeholder={t('settings.familyPage.grownUp.codeLabel')}
                  value={code}
                  onChange={(e) => { setCode(digitsOnly(e.target.value)); setProblem(null); }}
                  className={`w-40 ${SETTINGS_INPUT_CLASS}`}
                  data-testid="grown-up-code-input"
                  autoFocus
                />
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label={t('settings.familyPage.grownUp.againLabel')}
                  placeholder={t('settings.familyPage.grownUp.againLabel')}
                  value={again}
                  onChange={(e) => { setAgain(digitsOnly(e.target.value)); setProblem(null); }}
                  className={`w-40 ${SETTINGS_INPUT_CLASS}`}
                  data-testid="grown-up-code-again"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" variant="primary" disabled={saving} data-testid="grown-up-code-save">{t('settings.familyPage.grownUp.save')}</Button>
                <Button type="button" size="sm" onClick={() => { setEditing(null); setCode(''); setAgain(''); setProblem(null); }}>{tCore('actions.cancel')}</Button>
              </div>
            </form>
          )}
        </section>
      )}

      {status?.set && (
        <>
          <section data-field-id="family.grownUpJobs" className="rounded-lg border border-hs-border-strong bg-hs-card px-4 py-3">
            <div className="text-sm text-hs-text-body mb-1">{t('settings.familyPage.grownUp.jobsLabel')}</div>
            {GROWN_UP_ACTIONS.map((action) => (
              <label key={action} className="flex items-start gap-3 py-2 border-t border-hs-border-strong first-of-type:border-t-0 cursor-pointer">
                <input
                  type="checkbox"
                  className={`${CHECKBOX_CLASS} mt-0.5`}
                  checked={status.actions.includes(action)}
                  disabled={saving}
                  onChange={(e) => toggleAction(action, e.target.checked)}
                  data-testid={`grown-up-job-${action}`}
                />
                <span>
                  <span className="block text-sm text-hs-text-body">{t(`settings.familyPage.grownUp.jobs.${action}.label`)}</span>
                  <span className="block text-xs text-hs-text-muted">{t(`settings.familyPage.grownUp.jobs.${action}.hint`)}</span>
                </span>
              </label>
            ))}
          </section>
          <section data-field-id="family.grownUpUnlock" className="rounded-lg border border-hs-border-strong bg-hs-card px-4 py-3 space-y-1">
            <label className="flex items-center gap-3 text-sm text-hs-text-body">
              {t('settings.familyPage.grownUp.unlockLabel')}
              <select
                className={`ml-auto ${SETTINGS_INPUT_CLASS}`}
                value={status.unlockMinutes}
                disabled={saving}
                onChange={(e) => void send('PUT', { unlockMinutes: Number(e.target.value) })}
                data-testid="grown-up-unlock-minutes"
              >
                {UNLOCK_MINUTE_CHOICES.map((m) => (
                  <option key={m} value={m}>{t('settings.familyPage.grownUp.minutes', { count: m })}</option>
                ))}
              </select>
            </label>
            <FieldHint>{t('settings.familyPage.grownUp.unlockHint')}</FieldHint>
          </section>
        </>
      )}
    </div>
  );
}
