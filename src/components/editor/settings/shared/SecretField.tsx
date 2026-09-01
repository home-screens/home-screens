'use client';

import { useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import StatusDot from '@/components/ui/StatusDot';
import { useTranslate } from '@/i18n';
import { logger } from '@/lib/logger';

const log = logger('secret-field');

export type SecretKey =
  // Integration keys
  | 'unsplash_access_key'
  | 'nasa_api_key'
  | 'todoist_token'
  | 'google_maps_key'
  | 'tomtom_key'
  | 'google_client_id'
  | 'google_client_secret'
  | 'google_web_client_id'
  | 'google_web_client_secret'
  | 'github_token'
  | 'immich_url'
  | 'immich_api_key'
  | 'microsoft_client_id'
  // Weather provider keys
  | 'weatherapi_key'
  | 'openweathermap_key'
  | 'pirateweather_key'
  | 'metoffice_key';

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

interface Props {
  label: string;
  secretKey: SecretKey;
  placeholder: string;
  helpText: string;
  status: boolean;
  onSaved: () => void;
  /** Try the value against its service before saving; a failed check keeps the value in the form. */
  validate?: (value: string) => Promise<SecretCheck>;
  /** Shown in place of the Save button while `validate` runs. */
  checkingLabel?: string;
}

export default function SecretField({
  label,
  secretKey,
  placeholder,
  helpText,
  status,
  onSaved,
  validate,
  checkingLabel,
}: Props) {
  const t = useTranslate('editor');
  const [value, setValue] = useState('');
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
      const res = await editorFetch('/api/secrets', {
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
      setValue('');
      onSaved();
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
      setErrorMsg(t('common.networkError'));
    }
  }

  async function handleDelete() {
    try {
      const res = await editorFetch('/api/secrets', {
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
          type="password"
          value={value}
          onChange={(e) => { setValue(e.target.value); setSaveStatus('idle'); setCheck(null); }}
          placeholder={placeholder}
          className="flex-1 min-w-0 rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleSave()}
          disabled={!value.trim() || saveStatus === 'saving' || saveStatus === 'checking'}
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
      <p className="text-xs text-hs-text-faint mt-1">{helpText}</p>
    </div>
  );
}
