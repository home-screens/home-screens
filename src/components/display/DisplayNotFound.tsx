'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { setDisplayToken, displayFetch } from '@/lib/display-fetch';
import { getDisplayClientId } from '@/lib/display-client-id';

interface DisplayNotFoundProps {
  displayId: string;
  displayToken: string | null;
}

const COMMAND_POLL_MS = 3_000;
const CHECK_POLL_MS = 5_000;
/**
 * Maximum time a stranded display ID sits on DisplayNotFound before we
 * auto-navigate to `/display` (which the server redirects to the current
 * default). 60 s is long enough for a legitimately-bootstrapping new Pi
 * to be adopted from the editor, and short enough that a hub chromium
 * stuck on a dead URL (e.g. after the user renamed the display) recovers
 * itself without a power cycle.
 */
const AUTO_RECOVER_MS = 60_000;

/**
 * Rendered when a display loads `/display/<id>` for an ID that does not
 * exist in the hub's `displays` registry. The page does two things:
 *
 * 1. **Heartbeat / discovery** — polls `/api/display/commands?display=<id>`
 *    every 3 s. The drain endpoint adds the ID to the hub's `knownDisplays`
 *    set even when there are no commands to drain, which makes the display
 *    appear in the editor's "Unadopted Displays" section so the user can
 *    click "Adopt" without typing the ID by hand.
 *
 * 2. **Adoption check** — polls `/api/displays?id=<id>` every 5 s. The
 *    moment that endpoint reports `adopted: true`, the page hard-reloads;
 *    the next render runs through `filterConfigForDisplay` and mounts
 *    `ScreenRotator` instead of this fallback.
 *
 * This is intentionally a fetch-poll, not a full-page reload loop — fewer
 * network round trips, no browser flicker, and the heartbeat keeps flowing
 * the entire time the user is browsing the editor.
 */
export default function DisplayNotFound({ displayId, displayToken }: DisplayNotFoundProps) {
  // The display token must be set before any displayFetch fires.
  useLayoutEffect(() => { setDisplayToken(displayToken); }, [displayToken]);

  const reloadingRef = useRef(false);
  const navigatingRef = useRef(false);

  /**
   * When the hub already has at least one registered display, a stranded
   * chromium tab at this URL is almost certainly a stale redirect target —
   * not a brand-new Pi waiting to be adopted. We surface a visible countdown
   * so the user can see self-recovery is pending, plus a tap target for
   * touchscreens that want to recover immediately. `null` means no recovery
   * (single-display hub or bootstrap install with no other displays yet).
   */
  const [recoverDeadline, setRecoverDeadline] = useState<number | null>(null);
  const [msRemaining, setMsRemaining] = useState<number | null>(null);

  const goToDefault = () => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    // Navigate to the legacy /display entry point so the server-side
    // redirect picks the current default (main or first registered).
    window.location.href = '/display';
  };

  useEffect(() => {
    let mounted = true;
    const commandsUrl = `/api/display/commands?display=${encodeURIComponent(displayId)}`;
    const statusUrl = '/api/display/status';
    const checkUrl = `/api/displays?id=${encodeURIComponent(displayId)}`;

    async function heartbeat() {
      // Drain commands (adds this display to knownDisplays so the editor
      // surfaces it in the "Unadopted Displays" section). We don't care
      // about the response body — the side effect is what matters.
      try {
        await displayFetch(commandsUrl);
      } catch {
        // ignore — keep retrying on the next interval
      }

      // Also POST a stub status with our reported viewport so the editor
      // can pre-fill per-display dimensions when the user clicks "Adopt".
      // `innerWidth`/`innerHeight` are post-rotation, so a 1920×1080 panel
      // with --transform 90 reports as 1080×1920 directly.
      //
      // `clientId` is a stable per-tab UUID — the hub keys viewport reports
      // per (displayId, clientId), so two tabs with the same display ID
      // don't silently flap their viewports in the editor: they both show
      // up as distinct reporters.
      try {
        await displayFetch(statusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayId,
            clientId: getDisplayClientId(),
            currentScreen: { index: 0, id: '', name: '' },
            screenCount: 0,
            activeProfile: null,
            displayState: 'active',
            timestamp: Date.now(),
            reportedViewport: {
              width: window.innerWidth,
              height: window.innerHeight,
            },
          }),
        });
      } catch {
        // ignore
      }
    }

    async function check() {
      if (!mounted || reloadingRef.current) return;
      try {
        const res = await displayFetch(checkUrl);
        if (!res.ok) return;
        const data = (await res.json()) as { adopted?: boolean };
        if (data.adopted && mounted) {
          reloadingRef.current = true;
          window.location.reload();
        }
      } catch {
        // ignore
      }
    }

    async function discoverOtherDisplays() {
      // Fetch the full registry so we can tell "bootstrap scenario" (no
      // other displays — wait forever for adoption) apart from "stranded
      // URL" (other displays already exist — auto-recover after 60s).
      try {
        const res = await displayFetch('/api/displays');
        if (!res.ok || !mounted) return;
        const data = (await res.json()) as { displays?: Array<{ id: string }> };
        if (data.displays && data.displays.length > 0 && mounted) {
          setRecoverDeadline(Date.now() + AUTO_RECOVER_MS);
        }
      } catch {
        // ignore — without knowing, we default to waiting indefinitely
      }
    }

    heartbeat();
    check();
    discoverOtherDisplays();
    const heartbeatTimer = setInterval(heartbeat, COMMAND_POLL_MS);
    const checkTimer = setInterval(check, CHECK_POLL_MS);

    // Re-report viewport on orientation/resize changes so the editor sees
    // an updated value if the user rotates the display at runtime.
    const onResize = () => { heartbeat(); };
    window.addEventListener('resize', onResize);

    return () => {
      mounted = false;
      clearInterval(heartbeatTimer);
      clearInterval(checkTimer);
      window.removeEventListener('resize', onResize);
    };
  }, [displayId]);

  // Countdown tick + auto-navigate when the deadline passes. Separate from
  // the heartbeat effect so the heartbeat interval doesn't need to know or
  // care about the countdown state.
  useEffect(() => {
    if (recoverDeadline === null) return;
    const tick = () => {
      const remaining = recoverDeadline - Date.now();
      setMsRemaining(Math.max(0, remaining));
      if (remaining <= 0) {
        goToDefault();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [recoverDeadline]);

  return (
    <div
      style={{
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
      }}
    >
      <div style={{ maxWidth: 540 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#737373',
            marginBottom: 12,
          }}
        >
          Display Not Registered
        </div>
        <h1
          style={{
            fontSize: 48,
            fontWeight: 600,
            margin: '0 0 24px',
            color: '#fafafa',
            wordBreak: 'break-word',
          }}
        >
          {displayId}
        </h1>
        <p
          style={{
            fontSize: 18,
            lineHeight: 1.5,
            color: '#a3a3a3',
            margin: '0 0 32px',
          }}
        >
          This display is connected to the hub but has not been adopted yet.
          Open the editor on the hub, go to <strong>Settings → Displays</strong>,
          and click <strong>Adopt</strong> next to{' '}
          <code
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              backgroundColor: '#262626',
              color: '#e5e5e5',
              fontSize: 16,
            }}
          >
            {displayId}
          </code>
          .
        </p>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            borderRadius: 999,
            backgroundColor: '#171717',
            border: '1px solid #262626',
            fontSize: 13,
            color: '#737373',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: '#22c55e',
              animation: 'hs-pulse 1.6s ease-in-out infinite',
            }}
          />
          Waiting for adoption…
        </div>

        {/* Auto-recovery — only when the hub already has other registered
             displays. A fresh bootstrap install never sees this. */}
        {recoverDeadline !== null && msRemaining !== null && (
          <div
            style={{
              marginTop: 32,
              padding: 20,
              borderRadius: 12,
              backgroundColor: '#171717',
              border: '1px solid #262626',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 13, color: '#a3a3a3', marginBottom: 12, lineHeight: 1.5 }}>
              This display ID isn&rsquo;t registered, but your hub has other
              displays set up. Switching to the default display in{' '}
              <strong style={{ color: '#fafafa', fontVariantNumeric: 'tabular-nums' }}>
                {Math.ceil(msRemaining / 1000)}s
              </strong>
              .
            </div>
            <button
              type="button"
              onClick={goToDefault}
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                borderRadius: 8,
                border: '1px solid #3b82f6',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                minHeight: 44,
                minWidth: 44,
              }}
            >
              Go to default display now
            </button>
          </div>
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
