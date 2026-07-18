'use client';

import { AlertTriangle, CheckCircle, Shield } from 'lucide-react';
import type { PluginPermission, PluginSecretDeclaration } from '@/types/plugins';
import { useTranslate, type TranslateFn } from '@/i18n';

const PERMISSION_KEYS: Record<PluginPermission, string> = {
  network: 'settings.pluginInstallPreview.permissions.network',
  secrets: 'settings.pluginInstallPreview.permissions.secrets',
  events: 'settings.pluginInstallPreview.permissions.events',
  storage: 'settings.pluginInstallPreview.permissions.storage',
  localNetwork: 'settings.pluginInstallPreview.permissions.localNetwork',
  oauth: 'settings.pluginInstallPreview.permissions.oauth',
};

function permissionLabel(perm: PluginPermission, t: TranslateFn): string {
  const key = PERMISSION_KEYS[perm];
  // Fall through to the raw permission identifier when the manifest declares
  // a permission we have not translated (e.g. a future addition rendered by
  // an older build).
  return key ? t(key) : perm;
}

export interface PluginInstallPreviewProps {
  name: string;
  description: string;
  author: string;
  version: string;
  license?: string;
  verified?: boolean;
  permissions?: PluginPermission[];
  secrets?: PluginSecretDeclaration[];
  /** When true, the plugin declares a server-side auth adapter — show that the
   *  user will need to connect an account after installing. */
  requiresConnection?: boolean;
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
  requiresConnection,
  external,
  sha256,
}: PluginInstallPreviewProps) {
  const t = useTranslate('editor');
  return (
    <div className="space-y-3">
      <div className="p-3 rounded-lg bg-hs-hover border border-hs-border-strong">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-hs-text-primary">{name}</div>
          {verified && (
            <span title={t('settings.pluginInstallPreview.verifiedTitle')}>
              <CheckCircle className="w-4 h-4 text-hs-accent-hover" />
            </span>
          )}
        </div>
        <p className="text-xs text-hs-text-muted mt-0.5">{description}</p>
        <div className="flex items-center gap-3 mt-2 text-[11px] text-hs-text-muted">
          <span>{author}</span>
          <span>
            {t('settings.pluginInstallPreview.versionPrefix')}
            {version}
          </span>
          {license && <span>{license}</span>}
        </div>
      </div>

      {external && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-950/30 border border-amber-800/50">
          <AlertTriangle className="w-4 h-4 text-hs-warning shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-medium text-hs-warning">
              {t('settings.pluginInstallPreview.external.heading')}
            </div>
            <p className="text-[11px] text-hs-warning/80 mt-0.5">
              {t('settings.pluginInstallPreview.external.message')}
            </p>
          </div>
        </div>
      )}

      {!external && verified === false && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-950/30 border border-amber-800/50">
          <AlertTriangle className="w-4 h-4 text-hs-warning shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-medium text-hs-warning">
              {t('settings.pluginInstallPreview.unverified.heading')}
            </div>
            <p className="text-[11px] text-hs-warning/80 mt-0.5">
              {t('settings.pluginInstallPreview.unverified.message')}
            </p>
          </div>
        </div>
      )}

      {permissions && permissions.length > 0 && (
        <div className="p-3 rounded-lg bg-hs-hover border border-hs-border-strong">
          <div className="flex items-center gap-1.5 mb-2">
            <Shield className="w-3.5 h-3.5 text-hs-text-muted" />
            <span className="text-xs font-medium text-hs-text-secondary">
              {t('settings.pluginInstallPreview.permissionsHeading')}
            </span>
          </div>
          <div className="space-y-1">
            {permissions.map((perm) => (
              <div key={perm} className="flex items-center gap-2 text-xs text-hs-text-muted">
                <span className="w-1 h-1 rounded-full bg-hs-text-faint" />
                {permissionLabel(perm, t)}
              </div>
            ))}
          </div>
        </div>
      )}

      {secrets && secrets.length > 0 && (
        <div className="p-3 rounded-lg bg-hs-hover border border-hs-border-strong">
          <div className="text-xs font-medium text-hs-text-secondary mb-2">
            {t('settings.pluginInstallPreview.secretsHeading')}
          </div>
          <div className="space-y-1">
            {secrets.map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-xs text-hs-text-muted">
                <span className="w-1 h-1 rounded-full bg-hs-text-faint" />
                {s.label}
                {s.required && (
                  <span className="text-[10px] text-hs-warning">
                    {t('settings.pluginInstallPreview.secretRequired')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {requiresConnection && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-hs-hover border border-hs-border-strong">
          <Shield className="w-3.5 h-3.5 text-hs-text-muted shrink-0" />
          <span className="text-xs text-hs-text-secondary">
            {t('settings.pluginInstallPreview.connectionRequired')}
          </span>
        </div>
      )}

      {sha256 && (
        <div className="p-3 rounded-lg bg-hs-hover border border-hs-border-strong">
          <div className="text-xs font-medium text-hs-text-secondary mb-1.5">
            {t('settings.pluginInstallPreview.sha256Heading')}
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[10px] text-hs-text-muted break-all font-mono">{sha256}</code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(sha256)}
              className="text-[11px] text-hs-accent-hover hover:underline shrink-0"
              aria-label={t('settings.pluginInstallPreview.sha256CopyAriaLabel')}
            >
              {t('settings.pluginInstallPreview.sha256CopyButton')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
