'use client';

import { AlertTriangle, CheckCircle, Shield } from 'lucide-react';
import type { PluginPermission, PluginSecretDeclaration } from '@/types/plugins';

const PERMISSION_LABELS: Record<PluginPermission, string> = {
  network: 'Network access',
  secrets: 'Secret storage',
  events: 'Host events',
  storage: 'Local storage',
};

export interface PluginInstallPreviewProps {
  name: string;
  description: string;
  author: string;
  version: string;
  license?: string;
  verified?: boolean;
  permissions?: PluginPermission[];
  secrets?: PluginSecretDeclaration[];
  /** When true, render an "External source" amber warning banner. */
  external?: boolean;
  /** SHA-256 hash of the downloaded tarball (shown for external installs only). */
  sha256?: string;
}

export default function PluginInstallPreview({
  name,
  description,
  author,
  version,
  license,
  verified,
  permissions,
  secrets,
  external,
  sha256,
}: PluginInstallPreviewProps) {
  return (
    <div className="space-y-3">
      <div className="p-3 rounded-lg bg-hs-hover border border-hs-border-strong">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-hs-text-primary">{name}</div>
          {verified && (
            <span title="Verified"><CheckCircle className="w-4 h-4 text-hs-accent-hover" /></span>
          )}
        </div>
        <p className="text-xs text-hs-text-muted mt-0.5">{description}</p>
        <div className="flex items-center gap-3 mt-2 text-[11px] text-hs-text-muted">
          <span>{author}</span>
          <span>v{version}</span>
          {license && <span>{license}</span>}
        </div>
      </div>

      {external && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-950/30 border border-amber-800/50">
          <AlertTriangle className="w-4 h-4 text-hs-warning shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-medium text-hs-warning">Installing from outside the marketplace</div>
            <p className="text-[11px] text-hs-warning/80 mt-0.5">
              This plugin has not been reviewed by the Home Screens team. Verify you trust this source.
            </p>
          </div>
        </div>
      )}

      {!external && verified === false && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-950/30 border border-amber-800/50">
          <AlertTriangle className="w-4 h-4 text-hs-warning shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-medium text-hs-warning">Unverified Plugin</div>
            <p className="text-[11px] text-hs-warning/80 mt-0.5">
              This plugin has not been reviewed by the Home Screens team. Install at your own discretion.
            </p>
          </div>
        </div>
      )}

      {permissions && permissions.length > 0 && (
        <div className="p-3 rounded-lg bg-hs-hover border border-hs-border-strong">
          <div className="flex items-center gap-1.5 mb-2">
            <Shield className="w-3.5 h-3.5 text-hs-text-muted" />
            <span className="text-xs font-medium text-hs-text-secondary">Permissions requested</span>
          </div>
          <div className="space-y-1">
            {permissions.map((perm) => (
              <div key={perm} className="flex items-center gap-2 text-xs text-hs-text-muted">
                <span className="w-1 h-1 rounded-full bg-hs-text-faint" />
                {PERMISSION_LABELS[perm] || perm}
              </div>
            ))}
          </div>
        </div>
      )}

      {secrets && secrets.length > 0 && (
        <div className="p-3 rounded-lg bg-hs-hover border border-hs-border-strong">
          <div className="text-xs font-medium text-hs-text-secondary mb-2">API keys required</div>
          <div className="space-y-1">
            {secrets.map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-xs text-hs-text-muted">
                <span className="w-1 h-1 rounded-full bg-hs-text-faint" />
                {s.label}
                {s.required && <span className="text-[10px] text-hs-warning">(required)</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {sha256 && (
        <div className="p-3 rounded-lg bg-hs-hover border border-hs-border-strong">
          <div className="text-xs font-medium text-hs-text-secondary mb-1.5">SHA-256</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[10px] text-hs-text-muted break-all font-mono">{sha256}</code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(sha256)}
              className="text-[11px] text-hs-accent-hover hover:underline shrink-0"
              aria-label="Copy SHA-256"
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
