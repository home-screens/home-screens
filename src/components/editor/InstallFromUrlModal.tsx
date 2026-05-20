'use client';

import { useState, useMemo } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import Button from '@/components/ui/Button';
import PluginInstallPreview from '@/components/editor/PluginInstallPreview';
import { editorFetch } from '@/lib/editor-fetch';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useTranslate } from '@/i18n';
import type { PluginManifest } from '@/types/plugins';

interface InstallFromUrlModalProps {
  onClose: () => void;
  /** Called after a successful install so the parent can refresh state. */
  onInstalled: () => void;
}

type Step = 'entry' | 'installing' | 'done' | 'error';

export default function InstallFromUrlModal({ onClose, onInstalled }: InstallFromUrlModalProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const [step, setStep] = useState<Step>('entry');
  const [url, setUrl] = useState('');
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    manifest: PluginManifest | null;
    sha256: string;
  } | null>(null);

  const hasVersionPlaceholder = useMemo(() => url.includes('{version}'), [url]);
  const canContinue = url.trim().length > 0 && (!hasVersionPlaceholder || version.trim().length > 0);

  const trapRef = useFocusTrap<HTMLDivElement>();

  async function handleInstall() {
    setStep('installing');
    setError(null);

    try {
      const res = await editorFetch('/api/plugins/install-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tarballUrl: url.trim(),
          version: hasVersionPlaceholder ? version.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const fallback = data.error ?? t('installFromUrlModal.installFailed');
        throw new Error(data.detail ? `${data.error}: ${data.detail}` : fallback);
      }

      // Fetch the manifest so we can show a post-install summary
      const manifestRes = await editorFetch(`/api/plugins/manifest/${data.pluginId}`);
      const manifest = manifestRes.ok ? await manifestRes.json() : null;

      setResult({ manifest, sha256: data.sha256 });
      setStep('done');
      onInstalled();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('installFromUrlModal.installFailed'));
      setStep('error');
    }
  }

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label={t('installFromUrlModal.dialogAriaLabel')}
    >
      <div ref={trapRef} className="w-full max-w-md rounded-xl border border-hs-border-strong bg-hs-panel shadow-2xl p-5">
        <h2 className="text-base font-semibold text-hs-text-primary mb-3">{t('installFromUrlModal.title')}</h2>

        {step === 'entry' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-hs-text-secondary mb-1.5">{t('installFromUrlModal.tarballUrlLabel')}</label>
              <p className="text-[11px] text-hs-text-muted mb-2">
                {t('installFromUrlModal.tarballUrlHelpPart1')}
                <code>.tar.gz</code>
                {t('installFromUrlModal.tarballUrlHelpPart2')}
                <code>{'{version}'}</code>
                {t('installFromUrlModal.tarballUrlHelpPart3')}
              </p>
              <p className="text-[11px] text-hs-text-muted mb-2">
                {t('installFromUrlModal.exampleLabel')}{' '}
                <code className="break-all">https://example.com/releases/download/v{'{version}'}/plugin.tar.gz</code>
              </p>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/user/repo/releases/download/v{version}/plugin.tar.gz"
                className="w-full px-3 py-2 text-sm bg-hs-card border border-hs-border-strong rounded-lg text-hs-text-body placeholder:text-hs-text-faint font-mono"
                autoFocus
              />
            </div>

            {hasVersionPlaceholder && (
              <div>
                <label className="block text-xs font-medium text-hs-text-secondary mb-1.5">{t('installFromUrlModal.versionLabel')}</label>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="1.0.0"
                  className="w-full px-3 py-2 text-sm bg-hs-card border border-hs-border-strong rounded-lg text-hs-text-body placeholder:text-hs-text-faint"
                />
              </div>
            )}

            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-950/30 border border-amber-800/50">
              <AlertTriangle className="w-4 h-4 text-hs-warning shrink-0 mt-0.5" />
              <p className="text-[11px] text-hs-warning/80">
                {t('installFromUrlModal.externalSourceWarning')}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={onClose}>{tCore('actions.cancel')}</Button>
              <Button size="sm" disabled={!canContinue} onClick={handleInstall}>{t('settings.pluginStorePanel.browse.installButton')}</Button>
            </div>
          </div>
        )}

        {step === 'installing' && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="w-6 h-6 text-hs-text-muted animate-spin" />
            <p className="text-sm text-hs-text-muted">{t('installFromUrlModal.installingMessage')}</p>
          </div>
        )}

        {step === 'done' && result && (
          <div className="space-y-3">
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
            <div className="flex justify-end pt-1">
              <Button size="sm" onClick={onClose}>{t('installFromUrlModal.doneButton')}</Button>
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
              <Button size="sm" onClick={() => setStep('entry')}>{t('installFromUrlModal.tryAgainButton')}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
