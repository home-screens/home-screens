'use client';

import { X } from 'lucide-react';
import { sortVersionsDesc, resolveChannel, isVersionCompatible } from '@/lib/plugin-versions';
import { formatDateSync } from '@/i18n/formatters';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useFormattingLocale, useTranslate } from '@/i18n';
import PluginBetaBadge from '@/components/editor/PluginBetaBadge';
import type { RegistryPlugin } from '@/types/plugins';

// Inlined from package.json at build time (next.config.mjs) — same pattern as
// PluginStorePanel, used to flag versions that need a newer Home Screens.
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION;

interface PluginReleaseNotesModalProps {
  plugin: RegistryPlugin;
  /** Version currently on disk, when the plugin is installed. */
  installedVersion?: string;
  onClose: () => void;
}

export default function PluginReleaseNotesModal({
  plugin,
  installedVersion,
  onClose,
}: PluginReleaseNotesModalProps) {
  const t = useTranslate('editor');
  const formattingLocale = useFormattingLocale();
  const versions = sortVersionsDesc(plugin.versions);
  const trapRef = useFocusTrap<HTMLDivElement>();

  return (
    <div
      className="fixed inset-0 z-nested flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={t('settings.pluginStorePanel.releaseNotes.heading')}
    >
      <div ref={trapRef} className="w-full max-w-md max-h-[70vh] rounded-xl border border-hs-border-strong bg-hs-panel shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-hs-border-strong px-5 py-3.5">
          <div>
            <h3 className="text-base font-semibold text-hs-text-primary">
              {t('settings.pluginStorePanel.releaseNotes.heading')}
            </h3>
            <p className="text-xs text-hs-text-muted">{plugin.name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('modal.closeAriaLabel')} className="p-1 rounded hover:bg-hs-card">
            <X className="w-5 h-5 text-hs-text-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {versions.map((entry) => {
            const isBeta = resolveChannel(plugin, entry) === 'beta';
            const incompatible = !isVersionCompatible(entry, APP_VERSION);
            // releaseDate is a plain YYYY-MM-DD; anchor it to local midnight so
            // negative-UTC-offset timezones don't render the previous day.
            const parsed = entry.releaseDate ? new Date(`${entry.releaseDate}T00:00:00`) : null;
            const releaseDate = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
            return (
              <div
                key={entry.version}
                data-testid="release-notes-version"
                className="p-3 rounded-lg border border-hs-border-strong bg-hs-hover"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-hs-text-primary">v{entry.version}</span>
                  {isBeta && <PluginBetaBadge label={t('settings.pluginStorePanel.beta.badge')} />}
                  {entry.version === installedVersion && (
                    <span className="text-[10px] text-hs-success">
                      {t('settings.pluginStorePanel.releaseNotes.installedBadge')}
                    </span>
                  )}
                  {releaseDate && (
                    <span className="ml-auto text-[10px] text-hs-text-faint">
                      {formatDateSync(releaseDate, 'PP', { locale: formattingLocale })}
                    </span>
                  )}
                </div>
                <p className="text-xs text-hs-text-muted mt-1">
                  {entry.changelog || t('settings.pluginStorePanel.releaseNotes.noNotes')}
                </p>
                {incompatible && (
                  <p className="text-[10px] text-hs-warning mt-1">
                    {t('settings.pluginStorePanel.releaseNotes.needsNewerApp')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
