'use client';

import Button from '@/components/ui/Button';
import { useICloudImport, type ICloudImportJobStatus } from '@/hooks/useICloudImport';
import { useTranslate } from '@/i18n';

/** Where every wrong-link bridge saves iCloud content in the library. */
export const ICLOUD_IMPORT_FOLDER = 'icloud-imports';

interface Props {
  /** The iCloud link the user pasted. */
  url: string;
  /** Editor-namespace translation key for the intro copy above the button. */
  introKey: string;
  /** Editor-namespace translation key shown when the finished job saved nothing useful. */
  noItemsKey: string;
  /** Whether a finished job actually saved something useful for this caller. */
  savedSomething: (job: ICloudImportJobStatus) => boolean;
  /** Fired when the import completes successfully (even with nothing saved —
   *  the caller decides what "useful" means via savedSomething). */
  onSaved: (job: ICloudImportJobStatus) => void;
}

/**
 * Wrong-link bridge shared by every config surface where a pasted iCloud link
 * can't be used directly (the slideshows' album field fed a photo link, the
 * video module's URL field fed any iCloud link). Apple has two near-identical
 * link products and users can't be expected to know the difference, so instead
 * of failing silently we offer a one-click "Save to library" import; the
 * caller wires the saved content into the module when the job finishes.
 */
export function ICloudLinkImportBridge({ url, introKey, noItemsKey, savedSomething, onSaved }: Props) {
  const t = useTranslate('editor');
  const { start, running, finished, job, errorKey } = useICloudImport((finishedJob) => {
    if (finishedJob.state === 'done') onSaved(finishedJob);
  });

  return (
    <div className="space-y-1.5 p-2 rounded bg-hs-card border border-hs-border-strong">
      <p className="text-[11px] text-hs-text-muted leading-relaxed">
        {t(introKey)}
      </p>
      {running && job ? (
        <p className="text-[11px] text-hs-text-muted">
          {t('icloudImport.progress', { done: job.done + job.skipped, total: job.total })}
        </p>
      ) : (
        <Button size="sm" variant="primary" onClick={() => start(url, ICLOUD_IMPORT_FOLDER)} disabled={running}>
          {t('configSections.icloudSource.photoLinkAction')}
        </Button>
      )}
      {finished && job && !savedSomething(job) && (
        <p className="text-[11px] text-hs-warning">
          {t(noItemsKey)}
        </p>
      )}
      {errorKey && (
        <p className="text-[11px] text-hs-warning">{t(`icloudImport.errors.${errorKey}`)}</p>
      )}
    </div>
  );
}
