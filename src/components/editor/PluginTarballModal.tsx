'use client';

import { useState, useMemo } from 'react';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import ModalFrame from '@/components/ui/ModalFrame';
import PluginInstallPreview from '@/components/editor/PluginInstallPreview';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
import type { InstalledPlugin, PluginManifest } from '@/types/plugins';

interface PluginTarballModalProps {
  /** The plugin being updated; leave out to install a new one from an address. */
  plugin?: InstalledPlugin;
  onClose: () => void;
  /** Called after a successful install or update so the parent can refresh. */
  onDone: () => void;
}

type Step = 'entry' | 'working' | 'done' | 'error';

interface Result {
  version: string;
  sha256: string;
  /** Read after a new install, for its summary. */
  manifest: PluginManifest | null;
}

/**
 * Install a plugin from a download address, or update one that was installed
 * that way. One window for both: the address box, the version box that shows
 * once the address holds `{version}`, the same request and the same failure
 * panel. An update starts from the saved address and says which version is
 * installed; a new install warns about plugins from outside the store and
 * ends on the plugin's summary.
 */
export default function PluginTarballModal({ plugin, onClose, onDone }: PluginTarballModalProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const updating = plugin !== undefined;
  // Each window keeps its own words; only the wiring is shared.
  const words = updating ? 'externalUpdateModal' : 'installFromUrlModal';
  const failed = t(updating ? 'externalUpdateModal.updateFailed' : 'installFromUrlModal.installFailed');

  const [url, setUrl] = useState(plugin?.externalUrl ?? '');
  const [version, setVersion] = useState(plugin?.version ?? '');
  const [step, setStep] = useState<Step>('entry');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // Re-evaluated against the live URL field: `{version}` can come and go mid-edit.
  const hasVersionPlaceholder = useMemo(() => url.includes('{version}'), [url]);
  const canContinue = url.trim().length > 0 && (!hasVersionPlaceholder || version.trim().length > 0);

  async function handleSubmit() {
    setStep('working');
    setError(null);

    try {
      const res = await editorFetch('/api/plugins/install-external', {
        method: 'POST',
        // An install downloads the plugin under the hub's own time limits.
        timeoutMs: null,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tarballUrl: url.trim(),
          version: hasVersionPlaceholder ? version.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const fallback = data.error ?? failed;
        throw new Error(data.detail ? `${data.error}: ${data.detail}` : fallback);
      }

      let manifest: PluginManifest | null = null;
      if (!updating) {
        // Read the manifest for the summary shown after a new install.
        const manifestRes = await editorFetch(`/api/plugins/manifest/${data.pluginId}`);
        manifest = manifestRes.ok ? await manifestRes.json() : null;
      }

      setResult({ version: data.version, sha256: data.sha256, manifest });
      setStep('done');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : failed);
      setStep('error');
    }
  }

  return (
    <ModalFrame
      label={updating ? t('externalUpdateModal.dialogAriaLabel', { id: plugin.id }) : t('installFromUrlModal.dialogAriaLabel')}
      onClose={onClose}
      // Closing mid-download would leave the install running with nothing showing it.
      closable={step !== 'working'}
      className="w-full max-w-md rounded-xl border border-hs-border-strong bg-hs-panel shadow-2xl p-5"
    >
      <h2 className="text-base font-semibold text-hs-text-primary mb-3">
        {updating ? t('externalUpdateModal.title', { id: plugin.id }) : t('installFromUrlModal.title')}
      </h2>

      {step === 'entry' && (
        <div className="space-y-3">
          {updating && (
            <div className="p-3 rounded-lg bg-hs-hover border border-hs-border-strong text-xs text-hs-text-muted">
              {t('externalUpdateModal.currentVersionLabel')}{' '}
              <span className="text-hs-text-primary">v{plugin.version}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-hs-text-secondary mb-1.5">{t(`${words}.tarballUrlLabel`)}</label>
            {updating ? (
              <p className="text-[11px] text-hs-text-muted mb-2">
                {t('externalUpdateModal.tarballUrlHelpPart1')}
                <code>{'{version}'}</code>
                {t('externalUpdateModal.tarballUrlHelpPart2')}
              </p>
            ) : (
              <p className="text-[11px] text-hs-text-muted mb-2">
                {t('installFromUrlModal.tarballUrlHelpPart1')}
                <code>.tar.gz</code>
                {t('installFromUrlModal.tarballUrlHelpPart2')}
                <code>{'{version}'}</code>
                {t('installFromUrlModal.tarballUrlHelpPart3')}
              </p>
            )}
            <p className="text-[11px] text-hs-text-muted mb-2">
              {t(`${words}.exampleLabel`)}{' '}
              <code className="break-all">https://example.com/releases/download/v{'{version}'}/plugin.tar.gz</code>
            </p>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={updating ? undefined : 'https://github.com/user/repo/releases/download/v{version}/plugin.tar.gz'}
              className="w-full px-3 py-2 text-sm bg-hs-card border border-hs-border-strong rounded-lg text-hs-text-body placeholder:text-hs-text-faint font-mono"
              autoFocus
            />
          </div>

          {hasVersionPlaceholder && (
            <div>
              <label className="block text-xs font-medium text-hs-text-secondary mb-1.5">{t(`${words}.versionLabel`)}</label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder={updating ? '1.1.0' : '1.0.0'}
                className="w-full px-3 py-2 text-sm bg-hs-card border border-hs-border-strong rounded-lg text-hs-text-body placeholder:text-hs-text-faint"
              />
            </div>
          )}

          {!updating && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-950/30 border border-amber-800/50">
              <AlertTriangle className="w-4 h-4 text-hs-warning shrink-0 mt-0.5" />
              <p className="text-[11px] text-hs-warning/80">
                {t('installFromUrlModal.externalSourceWarning')}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={onClose}>{tCore('actions.cancel')}</Button>
            <Button size="sm" disabled={!canContinue} onClick={handleSubmit}>
              {t('settings.pluginStorePanel.browse.installButton')}
            </Button>
          </div>
        </div>
      )}

      {step === 'working' && (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <Loader2 className="w-6 h-6 text-hs-text-muted animate-spin" />
          <p className="text-sm text-hs-text-muted">
            {t(updating ? 'externalUpdateModal.workingMessage' : 'installFromUrlModal.installingMessage')}
          </p>
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-3">
          {updating ? (
            <>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-hs-success/10 border border-hs-success/30">
                <CheckCircle2 className="w-4 h-4 text-hs-success shrink-0 mt-0.5" />
                <div className="text-xs text-hs-success">
                  {t('externalUpdateModal.updatedToVersion', { version: result.version })}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-hs-hover border border-hs-border-strong">
                <div className="text-xs font-medium text-hs-text-secondary mb-1.5">{t('settings.pluginInstallPreview.sha256Heading')}</div>
                <code className="text-[10px] text-hs-text-muted break-all font-mono">{result.sha256}</code>
              </div>
            </>
          ) : (
            <PluginInstallPreview
              name={result.manifest?.name ?? t('installFromUrlModal.pluginFallbackName')}
              description={result.manifest?.description ?? ''}
              author={result.manifest?.author ?? ''}
              version={result.manifest?.version ?? ''}
              license={result.manifest?.license}
              permissions={result.manifest?.permissions}
              secrets={result.manifest?.secrets}
              external
              sha256={result.sha256}
            />
          )}
          <div className="flex justify-end pt-1">
            <Button size="sm" onClick={onClose}>{t(`${words}.doneButton`)}</Button>
          </div>
        </div>
      )}

      {step === 'error' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-hs-danger/10 border border-hs-danger/30">
            <AlertTriangle className="w-4 h-4 text-hs-danger shrink-0 mt-0.5" />
            <p className="text-xs text-hs-danger">{error}</p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={onClose}>{tCore('actions.close')}</Button>
            <Button size="sm" onClick={() => setStep('entry')}>{t(`${words}.tryAgainButton`)}</Button>
          </div>
        </div>
      )}
    </ModalFrame>
  );
}
