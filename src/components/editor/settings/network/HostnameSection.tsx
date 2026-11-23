'use client';

import { useState, useEffect } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import SudoPasswordPrompt from '@/components/editor/SudoPasswordPrompt';
import { useTranslate } from '@/i18n';
import { SettingsSectionHeading } from '@/components/editor/settings/shared/SettingsPanel';
import { SETTINGS_INPUT_CLASS } from '@/components/ui/input-classes';
import { refusalSentence } from '@/lib/hub-request';

/* ─── Props ────────────────────────────────── */

interface HostnameSectionProps {
  currentHostname: string;
  onSaved: () => void;
}

/* ─── Component ────────────────────────────── */

export default function HostnameSection({
  currentHostname,
  onSaved,
}: HostnameSectionProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const [value, setValue] = useState(currentHostname);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsSudo, setNeedsSudo] = useState(false);

  // Sync local value when the current hostname changes (e.g. after a refresh)
  useEffect(() => {
    setValue(currentHostname);
  }, [currentHostname]);

  const isDirty = value.trim() !== currentHostname;

  const handleSave = async () => {
    if (!isDirty || saving) return;

    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await editorFetch('/api/system/network/hostname', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname: value.trim() }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccessMsg(t('settings.networkPage.hostname.successMessage'));
        onSaved();

        // Clear success message after 3s
        setTimeout(() => setSuccessMsg(null), 3000);
      } else if (data.needsSudoPassword) {
        setNeedsSudo(true);
      } else {
        setErrorMsg(refusalSentence(data, tCore) ?? t('settings.networkPage.hostname.defaultErrorMessage'));
      }
    } catch {
      setErrorMsg(tCore('refusals.hubUnreachable'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section data-field-id="network.hostname">
      <SettingsSectionHeading>
        {t('settings.networkPage.hostname.heading')}
      </SettingsSectionHeading>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSuccessMsg(null);
            setErrorMsg(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isDirty) handleSave();
          }}
          placeholder={t('settings.networkPage.hostname.placeholder')}
          className={`w-full font-mono ${SETTINGS_INPUT_CLASS}`}
          disabled={saving}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="shrink-0"
        >
          {saving
            ? tCore('status.saving')
            : t('settings.networkPage.hostname.saveButton')}
        </Button>
      </div>

      {successMsg && (
        <p className="mt-1.5 text-xs text-hs-success">{successMsg}</p>
      )}
      {errorMsg && (
        <p className="mt-1.5 text-xs text-hs-danger">{errorMsg}</p>
      )}
      {needsSudo && (
        <SudoPasswordPrompt
          compact
          onGranted={() => {
            setNeedsSudo(false);
            handleSave();
          }}
          onCancel={() => setNeedsSudo(false)}
        />
      )}
    </section>
  );
}
