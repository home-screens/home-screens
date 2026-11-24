'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslate } from '@/i18n';
import { displayFetch } from '@/lib/display-fetch';
import { settingsPlaceText } from '@/lib/settings-route';
import { WALL_PAGE_HEADER } from '@/lib/wall-request-header';
import { NotAddedYet } from './DisplayNotFound';

interface WallGateProps {
  /** The display this page is for. None on a hub with one display. */
  displayId?: string;
  /** The hub has this display. False for a name it has not been given yet. */
  known: boolean;
}

const ASK_EVERY_MS = 5_000;
const LET_IN_AT = 'hs-wall-let-in-at';
/** A reload that lands back here this soon after being let in means the cookie was not kept. */
const LET_IN_RECENT_MS = 30_000;

type GateState = 'asking' | 'waiting' | 'no-cookie';

/** When this tab was last told it is let in, or 0. Null when the browser has no storage to remember it in. */
function lastLetInAt(): number | null {
  try {
    return Number(sessionStorage.getItem(LET_IN_AT)) || 0;
  } catch {
    return null;
  }
}

/**
 * What a browser sees at `/display` on a hub with a password when it has
 * not been let in: it asks the hub (`POST /api/display/claim`) and either
 * loads the wall or waits.
 *
 * Black while asking, because the usual answer is "come in" within a
 * moment: the hub's own screen, a wall on an allowed network, and in the
 * days after the update any existing display's wall. Those reload once and
 * the wall appears. Anything else waits here, asking again every few
 * seconds, until a grown-up lets it in from the editor.
 *
 * The reload is guarded. A browser that does not keep cookies would be let
 * in, reload, and land here again without end, so the second time round it
 * stops and says what is wrong.
 */
export default function WallGate({ displayId, known }: WallGateProps) {
  const t = useTranslate('core');
  const [state, setState] = useState<GateState>('asking');
  const leavingRef = useRef(false);
  // This page has already been given a cookie to wait with. If the next ask
  // arrives without it, the browser is not keeping cookies, and asking again
  // would only make a new waiting entry every few seconds.
  const givenCookieRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function ask() {
      if (!mounted || leavingRef.current) return;
      const letInAt = lastLetInAt();
      const letInRecently = letInAt !== null && letInAt > 0 && Date.now() - letInAt < LET_IN_RECENT_MS;
      const again = letInRecently || givenCookieRef.current;
      try {
        const res = await displayFetch('/api/display/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [WALL_PAGE_HEADER]: '1' },
          body: JSON.stringify({
            ...(displayId ? { displayId } : {}),
            width: window.innerWidth,
            height: window.innerHeight,
            ...(again ? { again: true } : {}),
          }),
        });
        if (!mounted) return;
        if (res.ok) {
          const { status } = (await res.json()) as { status?: string };
          if (!mounted) return;
          if (status === 'in') {
            // Let in twice running and still here: the cookie is not
            // reaching the page, and another reload would not change that.
            if (letInRecently || letInAt === null) {
              setState('no-cookie');
              return;
            }
            try {
              sessionStorage.setItem(LET_IN_AT, String(Date.now()));
            } catch {
              setState('no-cookie');
              return;
            }
            leavingRef.current = true;
            window.location.replace(window.location.href);
            return;
          }
          if (status === 'no-cookie') {
            setState('no-cookie');
            return;
          }
          if (status === 'waiting') {
            givenCookieRef.current = true;
            setState('waiting');
          }
        }
      } catch {
        // The hub did not answer; ask again on the next turn.
      }
      if (mounted) timer = setTimeout(ask, ASK_EVERY_MS);
    }

    void ask();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [displayId]);

  if (state === 'asking') return <div style={BLACK} />;

  if (state === 'waiting' && !known && displayId) {
    return (
      <NotAddedYet displayId={displayId}>
        <SignInLink label={t('wallGate.signIn')} />
      </NotAddedYet>
    );
  }

  const noCookie = state === 'no-cookie';
  return (
    <div style={PAGE}>
      <div style={{ maxWidth: 540 }}>
        <h1 style={TITLE}>{t(noCookie ? 'wallGate.noCookieTitle' : 'wallGate.title')}</h1>
        <p style={BODY}>
          {noCookie ? t('wallGate.noCookieLine') : t('wallGate.line', { place: settingsPlaceText(t, 'displays') })}
        </p>
        {!noCookie && (
          <>
            <div style={PILL}>
              <span style={DOT} />
              {t('wallGate.waiting')}
            </div>
            <SignInLink label={t('wallGate.signIn')} />
          </>
        )}
      </div>
      <style>{`
        @keyframes hs-pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.9); }
          50%      { opacity: 1;   transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}

/** For a grown-up who only wants to look: signing in shows the wall without making this browser one. */
function SignInLink({ label }: { label: string }) {
  const [href, setHref] = useState('/login');
  useEffect(() => {
    setHref(`/login?from=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, []);
  return (
    <div style={{ marginTop: 28 }}>
      <a href={href} style={LINK}>
        {label}
      </a>
    </div>
  );
}

const BLACK: CSSProperties = { width: '100vw', height: '100vh', backgroundColor: '#000' };
const PAGE: CSSProperties = {
  width: '100vw',
  height: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#0a0a0a',
  color: '#e5e5e5',
  fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
  padding: 32,
  textAlign: 'center',
};
const TITLE: CSSProperties = { fontSize: 40, fontWeight: 600, margin: '0 0 24px', color: '#fafafa' };
const BODY: CSSProperties = { fontSize: 18, lineHeight: 1.5, color: '#a3a3a3', margin: '0 0 32px' };
const PILL: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 16px',
  borderRadius: 999,
  backgroundColor: '#171717',
  border: '1px solid #262626',
  fontSize: 13,
  color: '#737373',
};
const DOT: CSSProperties = {
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  backgroundColor: '#22c55e',
  animation: 'hs-pulse 1.6s ease-in-out infinite',
};
const LINK: CSSProperties = { fontSize: 15, color: '#a3a3a3', textDecoration: 'underline', padding: '12px 8px', display: 'inline-block' };
