'use client';

import { useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import StatusDot from '@/components/ui/StatusDot';
import { useTranslate } from '@/i18n';

export type SecretKey =
  // Integration keys
  | 'unsplash_access_key'
  | 'nasa_api_key'
  | 'todoist_token'
  | 'google_maps_key'
  | 'tomtom_key'
  | 'google_client_id'
  | 'google_client_secret'
  | 'github_token'
  | 'immich_url'
  | 'immich_api_key'
  // Weather provider keys
  | 'weatherapi_key'
  | 'openweathermap_key'
  | 'pirateweather_key'
  | 'metoffice_key';

export type SecretStatus = Partial<Record<SecretKey, boolean>>;

interface Props {
  label: string;
  secretKey: SecretKey;
  placeholder: string;
  helpText: string;
  status: boolean;
  onSaved: () => void;
}

export default function SecretField({
  label,
  secretKey,
  placeholder,
  helpText,
  status,
  onSaved,
}: Props) {
  const t = useTranslate('editor');
  const [value, setValue] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSave() {
    if (!value.trim()) return;
    setSaveStatus('saving');
    setErrorMsg('');
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
      console.debug('Failed to delete secret:', err);
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
          onChange={(e) => { setValue(e.target.value); setSaveStatus('idle'); }}
          placeholder={placeholder}
          className="flex-1 min-w-0 rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSave}
          disabled={!value.trim() || saveStatus === 'saving'}
        >
          {saveStatus === 'saving'
            ? t('settings.shared.secretField.savingButton')
            : t('settings.shared.secretField.saveButton')}
        </Button>
      </div>
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
