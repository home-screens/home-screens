'use client';

import { ExternalLink } from 'lucide-react';
import ModalFrame, { ModalBody, ModalFooter, ModalHeader, ModalPanel } from '@/components/ui/ModalFrame';
import ReleaseNotes from '@/components/ui/ReleaseNotes';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { formatDateInTZ } from '@/lib/timezone';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
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
  const timezone = useEditorHouseholdTimezone();

  const published = release.published ? new Date(release.published) : null;

  return (
    // Labelled by name rather than `labelledBy`: the only heading in the panel
    // is the bare tag, which does not say what the dialog is on its own.
    <ModalFrame
      label={t('settings.systemPage.changelog.notesHeading', { tag: release.tag })}
      onClose={onClose}
      className="w-full max-w-2xl"
    >
      <ModalPanel>
        <ModalHeader
          titleId="changelog-title"
          title={<span className="font-mono">{release.tag}</span>}
          subtitle={published && !Number.isNaN(published.getTime())
            ? formatDateInTZ(published, timezone, { year: 'numeric', month: 'long', day: 'numeric' }, locale)
            : undefined}
          onClose={onClose}
        />

        <ModalBody>
          <ReleaseNotes
            markdown={release.body}
            emptyLabel={t('settings.systemPage.changelog.noNotes')}
          />
        </ModalBody>

        <ModalFooter
          start={release.url ? (
            <a
              href={release.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-hs-accent transition-colors hover:text-hs-accent-hover"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('settings.systemPage.changelog.viewOnGitHub')}
            </a>
          ) : undefined}
          onCancel={onClose}
          cancelLabel={tCore('actions.close')}
        />
      </ModalPanel>
    </ModalFrame>
  );
}
