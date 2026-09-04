'use client';

import { ExternalLink, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import ModalFrame from '@/components/ui/ModalFrame';
import ReleaseNotes from '@/components/ui/ReleaseNotes';
import { useFormattingLocale, useTranslate } from '@/i18n';
import type { ChangelogRelease } from '@/lib/version';

interface Props {
  release: ChangelogRelease;
  onClose: () => void;
}

/**
 * Full release notes for one version. Release bodies run to several screens,
 * so the list in System settings only shows a row per release and hands the
 * whole thing to this dialog, with a link out to the release on GitHub.
 */
export default function ChangelogModal({ release, onClose }: Props) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();

  const published = release.published ? new Date(release.published) : null;

  return (
    // Labelled by name rather than `labelledBy`: the only heading in the panel
    // is the bare tag, which does not say what the dialog is on its own.
    <ModalFrame
      label={t('settings.systemPage.changelog.notesHeading', { tag: release.tag })}
      onClose={onClose}
      className="w-full max-w-2xl"
    >
      <div className="flex max-h-[85vh] w-full flex-col rounded-xl border border-hs-border-strong bg-hs-panel shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-hs-border-strong px-6 py-4">
          <div>
            <h2 className="font-mono text-base font-semibold text-hs-text-primary">{release.tag}</h2>
            {published && !Number.isNaN(published.getTime()) && (
              <p className="mt-0.5 text-xs text-hs-text-faint">
                {published.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tCore('actions.close')}
            className="rounded p-1 text-hs-text-muted transition-colors hover:bg-hs-card hover:text-hs-text-body"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <ReleaseNotes
            markdown={release.body}
            emptyLabel={t('settings.systemPage.changelog.noNotes')}
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-hs-border-strong px-6 py-3">
          {release.url ? (
            <a
              href={release.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-hs-accent transition-colors hover:text-hs-accent-hover"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('settings.systemPage.changelog.viewOnGitHub')}
            </a>
          ) : (
            <span />
          )}
          <Button size="sm" variant="secondary" onClick={onClose}>
            {tCore('actions.close')}
          </Button>
        </div>
      </div>
    </ModalFrame>
  );
}
