'use client';

/**
 * Where this week came from, and whether it is still following it.
 *
 * An import used to be a one-way door: the sheet was recorded on the timetable
 * and then read by nothing, so a household that pasted a link had no way back
 * to it and no way to tell whether the promise of an hourly check was being
 * kept. This panel is that way back, and it is deliberately four plain states
 * rather than one line of status:
 *
 * - following the sheet, with when it was read and when it was last looked at;
 * - the last look failed, which never blanks a week: the saved copy stands and
 *   this says so, the same way the school-holiday cache does;
 * - not following it, because somebody edited the week by hand or turned the
 *   switch off, in which case the week is theirs and nothing will touch it;
 * - looking at the sheet right now, which only ever happens because somebody
 *   pressed the button. The hourly check is silent: it hangs off the read the
 *   walls already make, and the new week simply arrives.
 *
 * All of it behind a pill in the header row rather than a card above the grid.
 * As a card it took a quarter of the window for something a household reads
 * once and then ignores for a term, and the grid is what the window is for. The
 * pill still says the one thing worth knowing at a glance, which is whether the
 * week is still following its sheet; everything else is one click away. The
 * dropdown follows `DisplaySwitcher`, which is the editor's own idiom for this.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, Table } from 'lucide-react';
import Button from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';
import { formatRelativeTime, useFormattingLocale, useTranslate } from '@/i18n';
import { isSessionExpired } from '@/lib/editor-fetch';
import { formatDateInTZ } from '@/lib/timezone';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
import type { TimetableData, TimetableSource } from '@/types/timetables';
import { PROSE_CLASS } from './prose';
import { withSheetSync, type SheetCheckOutcome } from './use-timetable-draft';

interface SourcePanelProps {
  /** Whose week this is. Every action here is about this one person's sheet. */
  memberId: string;
  source: TimetableSource;
  /** Open the import screen, which is how a week is put back on its sheet. */
  onImportAgain: () => void;
  /**
   * Save pending edits, check the sheet and reload on success. The modal owns
   * that sequence; this panel only reports its progress and result.
   */
  onCheck: (memberId: string) => Promise<SheetCheckOutcome>;
  update: (change: (data: TimetableData) => TimetableData) => void;
}

/**
 * The pasted link, short enough to read back on one line. A spreadsheet link is
 * mostly its document id, so the scheme and anything after the path are dropped
 * before the middle of it is.
 */
function sheetLabel(url: string): string {
  const bare = url.replace(/^https?:\/\//, '').split(/[?#]/)[0];
  return bare.length > 48 ? `${bare.slice(0, 47)}…` : bare;
}

export default function SourcePanel({ memberId, source, onImportAgain, onCheck, update }: SourcePanelProps) {
  const t = useTranslate('editor');
  const locale = useFormattingLocale();
  const timezone = useEditorHouseholdTimezone();
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  /**
   * What the last check somebody pressed for turned out to be.
   *
   * A failure was always reported and a success was not, so the button looked
   * dead exactly when it had worked: nothing on screen moved, not even the
   * "last checked" line, which still said forty minutes.
   */
  const [found, setFound] = useState<SheetCheckOutcome>(null);
  const [open, setOpen] = useState(false);
  const [menuAt, setMenuAt] = useState<{ top: number; left: number } | null>(null);
  const pillRef = useRef<HTMLButtonElement>(null);

  // Escape is taken in the capture phase and stopped, because the window this
  // sits in closes on Escape too and one key press must not shut both.
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open]);

  // A recorded failure only means anything while the sheet is still being
  // followed. Once it is not, the last look is history and the week is theirs.
  const failing = source.sync && Boolean(source.lastError);

  // A machine whose clock runs a little ahead of ours would otherwise be
  // described as having been read "in a minute", which is nonsense for
  // something that has already happened.
  const now = Date.now();
  const ago = (when: string) => formatRelativeTime(now, Math.min(new Date(when).getTime(), now), { locale });

  // Which of the day and the month comes first is a property of the language,
  // so Intl writes the date rather than a fixed pattern that would have to pick
  // one order and be wrong in half the locales we ship. The day is the
  // household's, not the laptop's, like every other date the editor shows.
  const readOn = formatDateInTZ(new Date(source.importedAt), timezone, { day: 'numeric', month: 'long' }, locale);

  const check = async () => {
    setChecking(true);
    setCheckError(null);
    setFound(null);
    try {
      setFound(await onCheck(memberId));
    } catch (cause) {
      if (isSessionExpired(cause)) return;
      setCheckError(cause instanceof Error && cause.message ? cause.message : t('common.saveError'));
    } finally {
      setChecking(false);
    }
  };

  // A check in flight is drawn as its own resting state rather than as a failure
  // or a success, because until it answers it is neither.
  // Border and fill are kept apart on purpose. The dropdown needs a solid
  // background to sit over the grid, and a translucent state tint in the same
  // class list would win or lose by stylesheet order rather than by intent.
  const edge = checking || !source.sync
    ? 'border-hs-border-strong'
    : failing
      ? 'border-hs-danger/30'
      : 'border-hs-success/30';
  const fill = checking || !source.sync ? 'bg-hs-card/50' : failing ? 'bg-hs-danger/5' : 'bg-hs-success/5';

  const badge = checking
    ? { label: t('timetableModal.source.checking'), tone: 'bg-hs-accent/15 text-hs-accent' }
    : !source.sync
      ? { label: t('timetableModal.source.notFollowing'), tone: 'bg-hs-card text-hs-text-muted' }
      : failing
        ? { label: t('timetableModal.source.couldNotCheck'), tone: 'bg-hs-danger/15 text-hs-danger' }
        : { label: t('timetableModal.source.inSync'), tone: 'bg-hs-success/15 text-hs-success' };

  const syncHelp = !source.sync
    ? t('timetableModal.source.syncOffHelp')
    : failing
      ? t('timetableModal.source.syncFailingHelp')
      : t('timetableModal.source.syncOnHelp');

  return (
    <>
      <button
        ref={pillRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          const rect = pillRef.current?.getBoundingClientRect();
          if (rect) setMenuAt({ top: rect.bottom + 6, left: rect.left });
          if (!open) setFound(null);
          setOpen((was) => !was);
        }}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors hover:bg-hs-hover ${edge} ${fill}`}
      >
        <Table className="h-3.5 w-3.5 text-hs-text-muted" aria-hidden="true" />
        <span className="text-hs-text-body">{t('timetableModal.source.heading')}</span>
        <span className={`rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wide ${badge.tone}`}>
          {badge.label}
        </span>
        <ChevronDown className="h-3 w-3 text-hs-text-faint" aria-hidden="true" />
      </button>

      {open && menuAt && (
        <>
          {/* A press anywhere else closes it, and this swallows the press: the
              grid underneath paints on pointer down, and dismissing a panel
              should never lay a subject over somebody's lesson. */}
          <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />
          <section
            role="dialog"
            aria-label={t('timetableModal.source.heading')}
            className={`fixed z-50 w-[420px] max-w-[calc(100vw-32px)] rounded-lg border bg-hs-panel px-3.5 py-3 shadow-2xl ${edge}`}
            style={{ top: menuAt.top, left: Math.min(menuAt.left, Math.max(8, window.innerWidth - 436)) }}
          >
      <p className={`${PROSE_CLASS} text-hs-text-muted`}>
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-hs-accent hover:underline"
        >
          {sheetLabel(source.url)}
        </a>
        {' · '}
        {t('timetableModal.source.readOn', { date: readOn })}
      </p>

      {!source.sync && <p className={`mt-1.5 ${PROSE_CLASS} text-hs-text-muted`}>{t('timetableModal.source.yoursNow')}</p>}

      {failing && (
        <>
          <p className={`mt-1.5 ${PROSE_CLASS} text-hs-danger`}>
            {t(`timetableModal.import.errors.${source.lastError}`)}
          </p>
          {/* The sentence about the wall is hung off the time of the failed
              look, so a record with no time reads as a reason rather than as a
              half-written sentence. */}
          {source.lastCheckedAt && (
            <p className={`mt-0.5 ${PROSE_CLASS} text-hs-danger`}>
              {t('timetableModal.source.failed', { when: ago(source.lastCheckedAt) })}
            </p>
          )}
        </>
      )}

      {source.sync && !failing && (
        <p className={`mt-1.5 ${PROSE_CLASS} text-hs-text-muted`}>
          {source.lastCheckedAt
            ? t('timetableModal.source.lastChecked', { when: ago(source.lastCheckedAt) })
            : t('timetableModal.source.neverChecked')}
        </p>
      )}

      {found && !checking && (
        <p role="status" className={`mt-1.5 ${PROSE_CLASS} text-hs-text-body`}>
          {t(found === 'changed' ? 'timetableModal.source.checkedChanged' : 'timetableModal.source.checkedSame')}
        </p>
      )}

      {checkError && (
        <p role="alert" className={`mt-1.5 ${PROSE_CLASS} text-hs-danger`}>
          {checkError}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {source.sync && (
          <Button
            size="sm"
            variant={failing ? 'primary' : 'secondary'}
            disabled={checking}
            onClick={() => void check()}
          >
            {failing ? t('timetableModal.source.tryNow') : t('timetableModal.source.checkNow')}
          </Button>
        )}
        {/* A sheet that could not be read is not the moment to offer importing
            from it again: the one useful thing to do is look at it, or try. */}
        {!failing && (
          <Button size="sm" disabled={checking} onClick={onImportAgain}>
            {t('timetableModal.source.importAgain')}
          </Button>
        )}
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-1 text-xs text-hs-accent hover:underline"
        >
          {t('timetableModal.source.openSheet')}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>

      <div className="mt-2.5 space-y-0.5 border-t border-hs-border pt-2.5">
        <Toggle
          label={t('timetableModal.source.sync')}
          checked={source.sync}
          onChange={(on) => update((current) => withSheetSync(current, memberId, on))}
        />
        <p className={`${PROSE_CLASS} text-hs-text-faint`}>{syncHelp}</p>
      </div>
          </section>
        </>
      )}
    </>
  );
}
