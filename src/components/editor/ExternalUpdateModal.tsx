'use client';

import { useState, useMemo } from 'react';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { editorFetch } from '@/lib/editor-fetch';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { InstalledPlugin } from '@/types/plugins';

interface ExternalUpdateModalProps {
  plugin: InstalledPlugin;
  onClose: () => void;
  onUpdated: () => void;
}

type Step = 'entry' | 'working' | 'done' | 'error';

export default function ExternalUpdateModal({ plugin, onClose, onUpdated }: ExternalUpdateModalProps) {
  const [url, setUrl] = useState(plugin.externalUrl ?? '');
  const [newVersion, setNewVersion] = useState(plugin.version);
  const [step, setStep] = useState<Step>('entry');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ version: string; sha256: string } | null>(null);

  // Re-evaluated against the live URL field — user can add/remove `{version}` mid-edit.
  const hasVersionPlaceholder = useMemo(() => url.includes('{version}'), [url]);
  const canContinue = url.trim().length > 0 && (!hasVersionPlaceholder || newVersion.trim().length > 0);

  const trapRef = useFocusTrap<HTMLDivElement>();

  async function handleUpdate() {
    setStep('working');
    setError(null);

    try {
      const res = await editorFetch('/api/plugins/install-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tarballUrl: url.trim(),
          version: hasVersionPlaceholder ? newVersion.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail ? `${data.error}: ${data.detail}` : (data.error ?? 'Update failed'));
      }
      setResult({ version: data.version, sha256: data.sha256 });
      setStep('done');
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
      setStep('error');
    }
  }

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-label={`Update ${plugin.id}`}>
      <div ref={trapRef} className="w-full max-w-md rounded-xl border border-hs-border-strong bg-hs-panel shadow-2xl p-5">
        <h2 className="text-base font-semibold text-hs-text-primary mb-3">Update {plugin.id}</h2>

        {step === 'entry' && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-hs-hover border border-hs-border-strong text-xs text-hs-text-muted">
              Current version: <span className="text-hs-text-primary">v{plugin.version}</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-hs-text-secondary mb-1.5">Tarball URL</label>
              <p className="text-[11px] text-hs-text-muted mb-2">
                Edit the URL to point at a new version, or replace the version with <code>{'{version}'}</code> so future updates only need a version number.
              </p>
              <p className="text-[11px] text-hs-text-muted mb-2">
                Example: <code className="break-all">https://example.com/releases/download/v{'{version}'}/plugin.tar.gz</code>
              </p>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-hs-card border border-hs-border-strong rounded-lg text-hs-text-body placeholder:text-hs-text-faint font-mono"
                autoFocus
              />
            </div>

            {hasVersionPlaceholder && (
              <div>
                <label className="block text-xs font-medium text-hs-text-secondary mb-1.5">Version to install</label>
                <input
                  type="text"
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                  placeholder="1.1.0"
                  className="w-full px-3 py-2 text-sm bg-hs-card border border-hs-border-strong rounded-lg text-hs-text-body placeholder:text-hs-text-faint"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                size="sm"
                disabled={!canContinue}
                onClick={handleUpdate}
              >
                Install
              </Button>
            </div>
          </div>
        )}

        {step === 'working' && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="w-6 h-6 text-hs-text-muted animate-spin" />
            <p className="text-sm text-hs-text-muted">Downloading and updating…</p>
          </div>
        )}

        {step === 'done' && result && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-hs-success/10 border border-hs-success/30">
              <CheckCircle2 className="w-4 h-4 text-hs-success shrink-0 mt-0.5" />
              <div className="text-xs text-hs-success">
                Updated to v{result.version}.
              </div>
            </div>
            <div className="p-3 rounded-lg bg-hs-hover border border-hs-border-strong">
              <div className="text-xs font-medium text-hs-text-secondary mb-1.5">SHA-256</div>
              <code className="text-[10px] text-hs-text-muted break-all font-mono">{result.sha256}</code>
            </div>
            <div className="flex justify-end pt-1">
              <Button size="sm" onClick={onClose}>Done</Button>
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
              <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
              <Button size="sm" onClick={() => setStep('entry')}>Try again</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
