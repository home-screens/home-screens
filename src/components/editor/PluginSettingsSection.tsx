'use client';

import { useState, useEffect, useRef } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import { savePluginSettings } from '@/lib/plugin-settings-client';
import { PluginSchemaFields } from './PluginConfigRenderer';
import type { PluginConfigSchema } from '@/types/plugins';
import { useTranslate } from '@/i18n';

/**
 * Plugin-level settings form (manifest `settingsSchema`), shown on the
 * plugin's card in the plugin manager. Values are stored on the plugin's
 * installed.json record via /api/plugins/settings — NOT in any module's
 * config — so a plugin's stateProvider and every module instance share one
 * source of truth (connection URL, poll cadence). Saving pushes the values
 * straight into the plugin store's settings map (no bundle reload); displays
 * pick them up through the useLiveConfig settings diff on the next poll.
 */
export default function PluginSettingsSection({
  pluginId,
  schema,
}: {
  pluginId: string;
  schema: PluginConfigSchema;
}) {
  const t = useTranslate('editor');
  const [values, setValues] = useState<Record<string, unknown> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await editorFetch(`/api/plugins/settings/${encodeURIComponent(pluginId)}`);
        if (!res.ok) throw new Error(`settings load failed: ${res.status}`);
        const data = await res.json();
        if (!cancelled) setValues(data?.settings ?? {});
      } catch {
        // A failed load must not render as an empty form — saving that form
        // would silently overwrite the stored settings with blanks.
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [pluginId]);

  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);

  async function handleSave() {
    if (!values) return;
    setSaveStatus('saving');
    setErrorMsg('');
    // savePluginSettings PUTs and pushes the stored values into the plugin
    // store — providers get the new settings as a prop; no bundle reload, so
    // this section (and every plugin module on every display) stays mounted.
    const result = await savePluginSettings(pluginId, values);
    if (!result.ok) {
      setSaveStatus('error');
      setErrorMsg(result.error === 'network' ? t('common.networkError') : result.error || t('common.saveError'));
      return;
    }
    // Reflect what the server actually stored — the sanitizer drops keys
    // the on-disk schema doesn't declare (dev-override mismatches), and a
    // silent drop must be visible in the form, not on the next reopen.
    setValues(result.settings);
    setSaveStatus('saved');
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
  }

  if (loadFailed) {
    return (
      <p className="text-xs text-hs-danger" data-testid={`plugin-settings-load-error-${pluginId}`}>
        {t('settings.pluginSettings.loadFailed')}
      </p>
    );
  }
  if (values === null) {
    return <p className="text-xs text-hs-text-faint">{t('settings.pluginSettings.loading')}</p>;
  }

  return (
    <div className="space-y-3" data-testid={`plugin-settings-${pluginId}`}>
      <PluginSchemaFields
        schema={schema}
        values={values}
        onFieldChange={(key, value) => {
          setValues((prev) => ({ ...(prev ?? {}), [key]: value }));
          setSaveStatus('idle');
        }}
      />
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
        >
          {saveStatus === 'saving'
            ? t('settings.pluginSettings.savingButton')
            : t('settings.pluginSettings.saveButton')}
        </Button>
        {saveStatus === 'saved' && (
          <span className="text-xs text-hs-success">{t('settings.pluginSettings.savedSuccess')}</span>
        )}
        {saveStatus === 'error' && (
          <span className="text-xs text-hs-danger">{errorMsg}</span>
        )}
      </div>
    </div>
  );
}
