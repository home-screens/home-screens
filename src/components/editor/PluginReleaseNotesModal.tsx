'use client';

import { sortVersionsDesc, resolveChannel, isVersionCompatible } from '@/lib/plugin-versions';
import { formatDateSync } from '@/i18n/formatters';
import ModalFrame, { ModalBody, ModalHeader, ModalPanel } from '@/components/ui/ModalFrame';
import { useFormattingLocale, useTranslate } from '@/i18n';
import StatusPill from '@/components/ui/StatusPill';
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

  return (
    <ModalFrame
      labelledBy="plugin-release-notes-title"
      onClose={onClose}
      backdropClassName="bg-black/50"
      className="w-full max-w-md"
    >
      <ModalPanel>
        <ModalHeader
          titleId="plugin-release-notes-title"
          title={t('settings.pluginStorePanel.releaseNotes.heading')}
          subtitle={plugin.name}
          onClose={onClose}
        />

        <ModalBody className="py-3 space-y-3">
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
                  {isBeta && <StatusPill tone="info" size="sm">{t('settings.pluginStorePanel.beta.badge')}</StatusPill>}
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
                  <p className="text-[10px] text-hs-warning-ink mt-1">
                    {t('settings.pluginStorePanel.releaseNotes.needsNewerApp')}
                  </p>
                )}
              </div>
            );
          })}
        </ModalBody>
      </ModalPanel>
    </ModalFrame>
  );
}
