'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, TriangleAlert, Undo2 } from 'lucide-react';
import HomeScreensLogo from '@/components/brand/HomeScreensLogo';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';
import Spinner from '@/components/ui/Spinner';
import { settingsPlaceText } from '@/lib/settings-route';

type Outcome =
  | { kind: 'working' }
  /**
   * `calendar`: a Calendar sign-in to add events; `canAddEvents` is false when
   * Google's box was left empty. `justFinished`: this visit redeemed the code,
   * rather than being opened again afterwards.
   */
  | { kind: 'connected'; purpose?: 'photos' | 'calendar'; canAddEvents?: boolean; justFinished?: boolean }
  | { kind: 'expired' }
  | { kind: 'cancelled' }
  | { kind: 'failed' };

/** How long a refused window.close() gets before the page says so. */
const CLOSE_CHECK_MS = 300;
/** How long the tick shows before a finished sign-in closes its own tab. */
const AUTO_CLOSE_MS = 1500;

/**
 * The end of a Google web sign-in on the hub itself: Google Photos import, or
 * Calendar when it adds events. homescreens.dev forwards Google's answer here
 * (`?code=…&state=…`, or `?error=…` when the family said no); this page hands
 * the code to the hub, which checks the one-time value in `state`, redeems it
 * with its PKCE verifier into the right grant, and says which one it was.
 * The editor tab that started the sign-in notices through its own status
 * check.
 */
async function finishSignIn(search: string): Promise<Outcome> {
  const params = new URLSearchParams(search);
  if (params.get('error')) return { kind: 'cancelled' };
  const code = params.get('code');
  const state = params.get('state');

  try {
    if (!code || !state) {
      // Opened again after the code was used, say by a reload: report how
      // things stand rather than a sign-in that is long gone.
      const res = await fetch('/api/google-picker/status');
      const status = res.ok ? await res.json() as { connected?: boolean } : null;
      return status?.connected ? { kind: 'connected' } : { kind: 'expired' };
    }

    const res = await fetch('/api/auth/google/return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state }),
    });
    if (res.status === 401) {
      // The editor session ran out: sign in to the hub, then land back here
      // with the code still in hand (it is good for a few minutes).
      window.location.href = `/login?from=${encodeURIComponent(`${window.location.pathname}${search}`)}`;
      return { kind: 'working' };
    }
    if (res.ok) {
      const done = await res.json().catch(() => ({})) as { purpose?: 'photos' | 'calendar'; canAddEvents?: boolean };
      return { kind: 'connected', purpose: done.purpose, canAddEvents: done.canAddEvents, justFinished: true };
    }
    const data = await res.json().catch(() => ({})) as { expired?: boolean };
    // The hub's reason is English for its log; the page says it in our words.
    return data.expired ? { kind: 'expired' } : { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  }
}

export default function GoogleSignInReturn() {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'working' });
  const [closeBlocked, setCloseBlocked] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // Once only: the code works once, and a second try would report it expired.
    if (started.current) return;
    started.current = true;
    const search = window.location.search;
    // Keep the single-use code out of history and anything that reads the
    // URL later. Next's router keeps its own copy of the address and writes
    // it back on its next update, and its hook for this call only goes in
    // after this first effect, so the router is told too (below). Its saved
    // state rides along so it can still restore this entry.
    if (search) window.history.replaceState(window.history.state, '', window.location.pathname);
    void finishSignIn(search).then((result) => {
      setOutcome(result);
      // Not while the page is leaving for the login screen: a same-page
      // navigation could cancel that one.
      if (search && result.kind !== 'working') router.replace(window.location.pathname, { scroll: false });
    });
  }, [router]);

  // A sign-in that just finished goes back to the editor tab that started
  // it, which catches up when it comes to the front. Browsers only let a page
  // close a tab a script opened; any other tab keeps the button. A Calendar
  // sign-in with Google's box left empty stays open to say so.
  const finished = outcome.kind === 'connected' && outcome.justFinished === true && outcome.canAddEvents !== false;
  useEffect(() => {
    if (!finished) return;
    const timer = setTimeout(() => window.close(), AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [finished]);

  // Browsers only let a page close a tab that a script opened, so check.
  const closeTab = () => {
    window.close();
    setTimeout(() => { if (!window.closed) setCloseBlocked(true); }, CLOSE_CHECK_MS);
  };
  const backToEditor = () => {
    window.close();
    setTimeout(() => { if (!window.closed) window.location.assign('/editor'); }, CLOSE_CHECK_MS);
  };

  const importButton = t('configSections.googlePhotosImport.importButton');
  const choosePhotos = t('configSections.googlePhotosImport.choosePhotos');

  return (
    <div className="h-screen overflow-y-auto flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm text-center" data-testid="google-sign-in-return" data-outcome={outcome.kind}>
        <HomeScreensLogo className="mb-8 justify-center" />

        {outcome.kind === 'working' && (
          <p role="status" className="flex items-center justify-center gap-2 text-sm text-hs-text-muted">
            <Spinner size="md" />
            {t('connectGoogle.finishing')}
          </p>
        )}

        {outcome.kind === 'connected' && (
          <>
            {outcome.purpose === 'calendar' ? (
              <>
                {outcome.canAddEvents === false
                  ? <Badge tone="warning"><TriangleAlert className="h-5 w-5" /></Badge>
                  : <Badge tone="success"><Check className="h-5 w-5" strokeWidth={2.5} /></Badge>}
                <h1 className="text-lg font-semibold text-hs-text-primary">
                  {outcome.canAddEvents === false ? t('settings.calendarPage.adding.scopeMissingTitle') : t('connectGoogle.calendarConnectedTitle')}
                </h1>
                <p className="mt-1.5 mb-4 text-sm text-hs-text-muted">
                  {t(outcome.canAddEvents === false ? 'connectGoogle.calendarReadOnlyBody' : 'connectGoogle.calendarConnectedBody', { place: settingsPlaceText(tCore, 'calendar') })}
                </p>
              </>
            ) : (
              <>
                <Badge tone="success"><Check className="h-5 w-5" strokeWidth={2.5} /></Badge>
                <h1 className="text-lg font-semibold text-hs-text-primary">{t('connectGoogle.connectedTitle')}</h1>
                <p className="mt-1.5 mb-4 text-sm text-hs-text-muted">
                  {withBold(t('connectGoogle.connectedBody'), '{choosePhotos}', choosePhotos)}
                </p>
              </>
            )}
            <Button variant="primary" onClick={closeTab}>{t('connectGoogle.closeTab')}</Button>
            {closeBlocked && (
              <p className="mt-3 text-xs text-hs-text-faint">{t('connectGoogle.closeBlocked')}</p>
            )}
          </>
        )}

        {outcome.kind === 'expired' && (
          <>
            <Badge tone="warning"><TriangleAlert className="h-5 w-5" /></Badge>
            <h1 className="text-lg font-semibold text-hs-text-primary">{t('connectGoogle.expiredTitle')}</h1>
            <p className="mt-1.5 mb-4 text-sm text-hs-text-muted">
              {withBold(t('connectGoogle.expiredBody'), '{importButton}', importButton)}
            </p>
            <Button onClick={backToEditor}>{t('connectGoogle.backToEditor')}</Button>
          </>
        )}

        {outcome.kind === 'cancelled' && (
          <>
            <Badge tone="neutral"><Undo2 className="h-5 w-5" /></Badge>
            <h1 className="text-lg font-semibold text-hs-text-primary">{t('connectGoogle.cancelledTitle')}</h1>
            <p className="mt-1.5 mb-4 text-sm text-hs-text-muted">{t('connectGoogle.cancelledBody')}</p>
            <Button onClick={backToEditor}>{t('connectGoogle.backToEditor')}</Button>
          </>
        )}

        {outcome.kind === 'failed' && (
          <>
            <Badge tone="warning"><TriangleAlert className="h-5 w-5" /></Badge>
            <h1 className="text-lg font-semibold text-hs-text-primary">{t('connectGoogle.failedTitle')}</h1>
            <p className="mt-1.5 mb-4 text-sm text-hs-text-muted">
              {t('configSections.googlePhotosImport.genericError')}
            </p>
            <Button onClick={backToEditor}>{t('connectGoogle.backToEditor')}</Button>
          </>
        )}
      </div>
    </div>
  );
}

const BADGE_TONES = {
  success: 'bg-hs-success/15 text-hs-success',
  warning: 'bg-hs-warning/15 text-hs-warning-ink',
  neutral: 'bg-hs-card text-hs-text-muted',
};

function Badge({ tone, children }: { tone: keyof typeof BADGE_TONES; children: React.ReactNode }) {
  return (
    <div aria-hidden="true" className={`mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full ${BADGE_TONES[tone]}`}>
      {children}
    </div>
  );
}

/** A translated sentence with one `{slot}` drawn in bold: the name of a button in the editor. */
function withBold(template: string, slot: string, value: string) {
  const [before, after = ''] = template.split(slot);
  return (
    <>
      {before}
      <strong className="font-semibold text-hs-text-secondary">{value}</strong>
      {after}
    </>
  );
}
