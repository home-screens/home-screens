'use client';

import { useState, type ReactNode } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import StatusDot from '@/components/ui/StatusDot';
import { useTranslate } from '@/i18n';
import { logger } from '@/lib/logger';
import { useConfirmStore } from '@/stores/confirm-store';
import { SETTINGS_INPUT_CLASS } from '@/components/ui/input-classes';
// Type only, so nothing of the server's store reaches the editor bundle.
import type { SecretKey } from '@/lib/secrets';

const log = logger('secret-field');

export type SecretStatus = Partial<Record<SecretKey, boolean>>;

/** Verdict of a pre-save check on the typed value. */
export type SecretCheck =
  | { ok: true }
  | {
      ok: false;
      /** Plain-language reason shown in the form. */
      message: string;
      /** Raw upstream text, behind a "Details" disclosure. */
      detail?: string;
      /** Offer "Save anyway" (a provider that could not be reached, a key that may not be active yet). */
      allowAnyway: boolean;
    };

/**
 * Where the value is kept. The hub's own keys are a closed list; a plugin
 * names its own, kept under that plugin's address.
 */
type Target =
  | { endpoint?: undefined; secretKey: SecretKey }
  | { endpoint: string; secretKey: string };

type Props = Target & {
  label: string;
  placeholder: string;
  /** Sits before the status dot, for a word such as "Required". */
  badge?: ReactNode;
  /** The grey line under the box; leave out when the surrounding card already says it. */
  helpText?: string;
  /** Space above the grey line; a narrow panel that stacks several boxes gives it a little more. */
  helpTextClassName?: string;
  status: boolean;
  onSaved: () => void;
  /** Try the value against its service before saving; a failed check keeps the value in the form. */
  validate?: (value: string) => Promise<SecretCheck>;
  /** Shown in place of the Save button while `validate` runs. */
  checkingLabel?: string;
  /** Show what is typed (a server address is not a secret, and a typo in dots cannot be spotted). */
  plainText?: boolean;
  /**
   * What is saved, shown in the box so a typo can be spotted after the save
   * too. Only for a `plainText` field: an address is not a secret. The box
   * follows it until somebody types, and Save stays off while it matches.
   */
  savedValue?: string;
  /**
   * The question to ask before Remove, worked out when Remove is pressed (it
   * may depend on how the key is being used right now); null to remove at once.
   */
  removeQuestion?: () => Promise<{ title: string; message: string; confirmLabel: string } | null>;
};

export default function SecretField({
  label,
  secretKey,
  endpoint = '/api/secrets',
  placeholder,
  badge,
  helpText,
  helpTextClassName = 'mt-1',
  status,
  onSaved,
  validate,
  checkingLabel,
  plainText,
  savedValue,
  removeQuestion,
}: Props) {
  const t = useTranslate('editor');
  const [value, setValue] = useState(savedValue ?? '');
  // Typed in since the box last showed what is saved: a new saved value
  // (the page learning it, or a save) never overwrites an edit in progress.
  const [edited, setEdited] = useState(false);
  const [shownSaved, setShownSaved] = useState(savedValue);
  if (savedValue !== shownSaved) {
    setShownSaved(savedValue);
    if (!edited) setValue(savedValue ?? '');
  }
  const [saveStatus, setSaveStatus] = useState<'idle' | 'checking' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [check, setCheck] = useState<Extract<SecretCheck, { ok: false }> | null>(null);

  async function handleSave(skipCheck = false) {
    if (!value.trim()) return;
    setErrorMsg('');
    setCheck(null);
    if (validate && !skipCheck) {
      setSaveStatus('checking');
      let verdict: SecretCheck;
      try {
        verdict = await validate(value.trim());
      } catch {
        verdict = { ok: false, message: t('common.networkError'), allowAnyway: true };
      }
      if (!verdict.ok) {
        setSaveStatus('idle');
        setCheck(verdict);
        return;
      }
    }
    setSaveStatus('saving');
    try {
      const res = await editorFetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: secretKey, value: value.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveStatus('error');
        setErrorMsg(data.error ?? t('common.saveError'));
        return;
      }
      setSaveStatus('saved');
      // A plain-text box keeps showing what was saved; a secret's empties.
      if (plainText) setEdited(false);
      else setValue('');
      onSaved();
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
      setErrorMsg(t('common.networkError'));
    }
  }

  async function handleDelete() {
    const question = removeQuestion ? await removeQuestion().catch(() => null) : null;
    if (question && !(await useConfirmStore.getState().confirm({ ...question, variant: 'danger' }))) return;
    try {
      const res = await editorFetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: secretKey }),
      });
      if (res.ok) onSaved();
    } catch (err) {
      log.debug('Failed to delete secret:', err);
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-hs-text-muted">{label}</span>
        <div className="flex items-center gap-2 shrink-0">
          {badge}
          <StatusDot configured={status} />
          {status && (
            <button
              onClick={handleDelete}
              className="text-xs text-hs-text-faint hover:text-hs-danger transition-colors"
            >
              {t('settings.shared.secretField.removeButton')}
            </button>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <input
          type={plainText ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={plainText ? false : undefined}
          value={value}
          onChange={(e) => { setValue(e.target.value); setEdited(true); setSaveStatus('idle'); setCheck(null); }}
          placeholder={placeholder}
          className={`flex-1 min-w-0 ${SETTINGS_INPUT_CLASS}`}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleSave()}
          disabled={!value.trim() || value.trim() === savedValue || saveStatus === 'saving' || saveStatus === 'checking'}
        >
          {saveStatus === 'saving'
            ? t('settings.shared.secretField.savingButton')
            : saveStatus === 'checking'
              ? (checkingLabel ?? t('settings.shared.secretField.checkingButton'))
              : t('settings.shared.secretField.saveButton')}
        </Button>
      </div>
      {check && (
        <div data-testid={`secret-check-${secretKey}`} className="mt-1.5 rounded-md bg-hs-warning/10 border border-hs-warning/30 px-2.5 py-2 text-xs text-hs-warning space-y-1">
          <p className="font-medium">{check.message}</p>
          {check.detail && (
            <details className="text-hs-warning/80">
              <summary className="cursor-pointer">{t('settings.shared.secretField.detailsToggle')}</summary>
              <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px]">{check.detail}</pre>
            </details>
          )}
          {check.allowAnyway && (
            <button
              type="button"
              onClick={() => handleSave(true)}
              className="text-xs font-medium underline decoration-dashed underline-offset-2 hover:text-hs-text-primary"
            >
              {t('settings.shared.secretField.saveAnyway')}
            </button>
          )}
        </div>
      )}
      {saveStatus === 'saved' && (
        <span className="text-xs text-hs-success">
          {t('settings.shared.secretField.savedSuccess')}
        </span>
      )}
      {saveStatus === 'error' && (
        <span className="text-xs text-hs-danger">{errorMsg}</span>
      )}
      {helpText && <p className={`text-xs text-hs-text-faint ${helpTextClassName}`}>{helpText}</p>}
    </div>
  );
}
