'use client';

import { useState, useEffect, useRef, useId, useCallback, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useTranslate } from '@/i18n';
import ConfirmSheet from './ConfirmSheet';

/**
 * Sheets that have asked for their history entry back but have not had it yet,
 * keyed by the entry they own.
 *
 * Handing an entry back means a history traversal, and a traversal is
 * asynchronous: it arrives as a `popstate` some time later, and browsers do
 * not agree on where it lands when something pushed onto the stack while it
 * was in flight. React mounts, tears down and remounts every effect a second
 * time in development, so a release fired by that teardown was still
 * travelling when the sheet mounted again, and came back looking exactly like
 * a person pressing Back. The sheet closed itself a quarter second after
 * opening.
 *
 * So a teardown only asks, one turn later, and a mount that follows it takes
 * the request back and keeps the entry it already has. A development remount
 * therefore performs no traversal at all, which is what makes this safe
 * without having to predict where one would have landed.
 *
 * Module scope on purpose: it has to outlive the component state that React
 * throws away between those two mounts.
 */
const pendingReleases = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Whether this document is on its way to another page.
 *
 * A traversal started while the browser is already fetching the next document
 * cancels that navigation, and the tab sits on the old page with nothing to
 * say why. The window is real: a sheet dismissed by its own save asks for its
 * entry back a macrotask later, which is long enough for something else to
 * have started a navigation in between.
 *
 * So once the page is leaving, no sheet reaches for its entry again: the whole
 * stack belongs to the next document. `pageshow` clears it for a page restored
 * from the back/forward cache, which is alive again and owns its stack.
 */
let leavingPage = false;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => { leavingPage = true; });
  window.addEventListener('pagehide', () => { leavingPage = true; });
  window.addEventListener('pageshow', () => { leavingPage = false; });
}

function requestRelease(entryId: string, release: () => void): void {
  cancelRelease(entryId);
  pendingReleases.set(entryId, setTimeout(() => {
    pendingReleases.delete(entryId);
    release();
  }, 0));
}

function cancelRelease(entryId: string): void {
  const pending = pendingReleases.get(entryId);
  if (pending === undefined) return;
  clearTimeout(pending);
  pendingReleases.delete(entryId);
}

export default function FormOverlay({
  title,
  backLabel,
  dirty = false,
  backDisabled = false,
  onBack,
  children,
  footer,
  zIndex = 55,
}: {
  title: string;
  backLabel?: string;
  /**
   * True once the form holds edits that have not been saved. While dirty the
   * back control reads "Cancel" and asks before throwing the edits away;
   * people tap Back reflexively, and a chore with a schedule takes a minute
   * to rebuild.
   */
  dirty?: boolean;
  backDisabled?: boolean;
  onBack: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Raise above the Settings sheet (z 101) when opened from it. */
  zIndex?: number;
}) {
  const tCore = useTranslate('core');
  const t = useTranslate('remote');
  // Default the chevron-back label through `core.actions.back` so every
  // caller picks up the active locale without forwarding props.
  const resolvedBackLabel = backLabel ?? (dirty ? tCore('actions.cancel') : tCore('actions.back'));
  const [visible, setVisible] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    return () => clearTimeout(exitTimer.current);
  }, []);

  // Read from the popstate listener, which is registered once.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const confirmRef = useRef(confirmDiscard);
  confirmRef.current = confirmDiscard;
  const backDisabledRef = useRef(backDisabled);
  backDisabledRef.current = backDisabled;
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  /**
   * The sheet holds one history entry for as long as it is open.
   *
   * Without it, the Back gesture, which is the first thing a thumb reaches
   * for to leave a sheet, unloaded the whole remote and threw away a typed
   * draft that the Cancel button would have asked about. The entry carries
   * this sheet's own id, and whether the sheet owns one is read back off the
   * stack rather than tracked beside it: a flag and a history stack drift
   * apart the moment a traversal is in flight.
   */
  const entryId = useId();
  const closing = useRef(false);
  const selfPop = useRef(false);

  const ownsEntry = useCallback(
    () => (window.history.state as { hsSheet?: string } | null)?.hsSheet === entryId,
    [entryId],
  );

  const takeEntry = useCallback(() => {
    if (ownsEntry()) return;
    // Same URL, so nothing about the address changes and a reload still lands
    // on the tab the sheet was opened from.
    window.history.pushState(
      { ...(window.history.state ?? {}), hsSheet: entryId },
      '',
      window.location.href,
    );
  }, [entryId, ownsEntry]);

  const releaseEntry = useCallback(() => {
    // Never start a second traversal over one already in flight, and never
    // start one at all while the page is leaving: see `leavingPage`.
    if (leavingPage || selfPop.current || !ownsEntry()) return;
    selfPop.current = true;
    window.history.back();
  }, [ownsEntry]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    releaseEntry();
    setVisible(false);
    exitTimer.current = setTimeout(() => onBackRef.current(), 250);
  }, [releaseEntry]);

  const handleBack = useCallback(() => {
    if (dirtyRef.current) {
      setConfirmDiscard(true);
      return;
    }
    close();
  }, [close]);

  useEffect(() => {
    // A mount that follows a teardown of the same sheet (React does exactly
    // that in development) keeps the entry the teardown had asked to give
    // back, so no traversal is ever in flight across a remount.
    cancelRelease(entryId);
    takeEntry();
    function onPopState() {
      if (selfPop.current) {
        selfPop.current = false;
        // A traversal this sheet started can arrive after the stack has moved
        // on, and where it lands differs between browsers, so read nothing
        // into where we are: if the sheet is still open it still needs an
        // entry under it.
        if (!closing.current) takeEntry();
        return;
      }
      // Still standing on one of this sheet's own entries: nobody left, a
      // sheet stacked on top of this one closed.
      if (ownsEntry()) return;
      // Anything that keeps the sheet open has to keep its entry too.
      if (backDisabledRef.current || confirmRef.current || dirtyRef.current) takeEntry();
      // A save in flight: the sheet's own Back control is disabled here too.
      if (backDisabledRef.current) return;
      // Back out of the discard prompt means "keep editing", the same as its
      // own button, rather than a second prompt over the first.
      if (confirmRef.current) {
        setConfirmDiscard(false);
        return;
      }
      // Everything else is exactly the Back control: a clean form closes, a
      // dirty one asks first.
      handleBack();
    }
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      // Dismissed some other way (a save that closed the sheet): ask for the
      // entry back, or Back would land on a step that does nothing. Only ask:
      // see pendingReleases for why this cannot navigate on the spot.
      requestRelease(entryId, releaseEntry);
    };
  }, [entryId, takeEntry, ownsEntry, releaseEntry, handleBack]);

  return (
    // A real dialog role: the overlay's submit button and the trigger that
    // opened it share their wording ("Add Member", "Add Chore"), so anything
    // addressing the submit by label alone resolves to the trigger during the
    // render that opens the overlay.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="form-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        backgroundColor: 'var(--hs-bg-body)',
        display: 'flex',
        flexDirection: 'column',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        // Same cap as the rest of the remote: a full-bleed form on a laptop
        // puts the label and its field a screen-width apart.
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          paddingTop: 'max(12px, env(safe-area-inset-top))',
          borderBottom: '1px solid var(--hs-border)',
          gap: 12,
        }}
      >
        <button
          onClick={handleBack}
          disabled={backDisabled}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            minWidth: 48,
            minHeight: 48,
            color: 'var(--hs-text-muted)',
            fontSize: 14,
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
            background: 'none',
          }}
        >
          <ChevronLeft size={20} />
          {resolvedBackLabel}
        </button>
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: 'var(--hs-text-primary)',
            flex: 1,
            textAlign: 'center',
            paddingRight: 44,
          }}
        >
          {title}
        </div>
      </div>
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          padding: '20px 16px',
          paddingBottom: footer
            ? '20px'
            : 'calc(80px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {children}
      </div>
      {footer && (
        <div style={{ width: '100%', maxWidth: 640, flexShrink: 0, paddingBottom: 'env(safe-area-inset-bottom, 0px)', position: 'relative', zIndex: 1, borderTop: '1px solid var(--hs-border)' }}>
          {footer}
        </div>
      )}

      {confirmDiscard && (
        <ConfirmSheet
          title={t('formOverlay.discard.title')}
          description={t('formOverlay.discard.description')}
          confirmLabel={t('formOverlay.discard.confirmLabel')}
          cancelLabel={t('formOverlay.discard.keepEditing')}
          onConfirm={() => {
            setConfirmDiscard(false);
            close();
          }}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
    </div>
  );
}
