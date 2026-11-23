'use client';

import { useState, useMemo } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import ModalFrame, { ModalBody, ModalFooter, ModalHeader, ModalPanel } from '@/components/ui/ModalFrame';
import Notice from '@/components/ui/Notice';
import Spinner from '@/components/ui/Spinner';
import PluginInstallPreview from '@/components/editor/PluginInstallPreview';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
import type { InstalledPlugin, PluginManifest } from '@/types/plugins';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import FieldHint from '@/components/ui/FieldHint';
import { refusalSentence } from '@/lib/hub-request';

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
        throw new Error(refusalSentence(data, tCore) ?? failed);
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
      className="w-full max-w-md"
    >
      <ModalPanel>
        <ModalHeader
          titleId="plugin-tarball-title"
          title={updating ? t('externalUpdateModal.title', { id: plugin.id }) : t('installFromUrlModal.title')}
          onClose={onClose}
          closable={step !== 'working'}
        />

        <ModalBody>
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
                  <FieldHint className="mb-2">
                    {t('externalUpdateModal.tarballUrlHelpPart1')}
                    <code>{'{version}'}</code>
                    {t('externalUpdateModal.tarballUrlHelpPart2')}
                  </FieldHint>
                ) : (
                  <FieldHint className="mb-2">
                    {t('installFromUrlModal.tarballUrlHelpPart1')}
                    <code>.tar.gz</code>
                    {t('installFromUrlModal.tarballUrlHelpPart2')}
                    <code>{'{version}'}</code>
                    {t('installFromUrlModal.tarballUrlHelpPart3')}
                  </FieldHint>
                )}
                <FieldHint className="mb-2">
                  {t(`${words}.exampleLabel`)}{' '}
                  <code className="break-all">https://example.com/releases/download/v{'{version}'}/plugin.tar.gz</code>
                </FieldHint>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={updating ? undefined : 'https://github.com/user/repo/releases/download/v{version}/plugin.tar.gz'}
                  className={`font-mono ${MODAL_INPUT_CLASS}`}
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
                    className={MODAL_INPUT_CLASS}
                  />
                </div>
              )}

              {!updating && (
                <Notice tone="warning" icon={AlertTriangle}>
                  {t('installFromUrlModal.externalSourceWarning')}
                </Notice>
              )}
            </div>
          )}

          {step === 'working' && (
            <div role="status" className="flex flex-col items-center justify-center py-10 gap-3 text-hs-text-muted">
              <Spinner size="lg" />
              <p className="text-sm text-hs-text-muted">
                {t(updating ? 'externalUpdateModal.workingMessage' : 'installFromUrlModal.installingMessage')}
              </p>
            </div>
          )}

          {step === 'done' && result && (
            <div className="space-y-3">
              {updating ? (
                <>
                  <Notice tone="success" icon={CheckCircle2} role="status">
                    {t('externalUpdateModal.updatedToVersion', { version: result.version })}
                  </Notice>
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
            </div>
          )}

          {step === 'error' && (
            <Notice tone="danger" icon={AlertTriangle} role="alert">{error}</Notice>
          )}
        </ModalBody>

        {step === 'entry' && (
          <ModalFooter
            onCancel={onClose}
            primary={{ label: t('settings.pluginStorePanel.browse.installButton'), disabled: !canContinue, onClick: handleSubmit }}
          />
        )}
        {step === 'done' && result && (
          <ModalFooter primary={{ label: t(`${words}.doneButton`), onClick: onClose }} />
        )}
        {step === 'error' && (
          <ModalFooter
            onCancel={onClose}
            cancelLabel={tCore('actions.close')}
            primary={{ label: t(`${words}.tryAgainButton`), onClick: () => setStep('entry') }}
          />
        )}
      </ModalPanel>
    </ModalFrame>
  );
}
