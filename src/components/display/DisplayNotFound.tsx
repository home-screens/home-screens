'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { setDisplayToken, displayFetch } from '@/lib/display-fetch';

interface DisplayNotFoundProps {
  displayId: string;
  displayToken: string | null;
}

const COMMAND_POLL_MS = 3_000;
const CHECK_POLL_MS = 5_000;

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

  useEffect(() => {
    let mounted = true;
    const url = `/api/display/commands?display=${encodeURIComponent(displayId)}`;
    const checkUrl = `/api/displays?id=${encodeURIComponent(displayId)}`;

    async function heartbeat() {
      // Drain commands (we ignore the contents — the side effect is what matters)
      try {
        await displayFetch(url);
      } catch {
        // ignore — keep retrying on the next interval
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

    heartbeat();
    check();
    const heartbeatTimer = setInterval(heartbeat, COMMAND_POLL_MS);
    const checkTimer = setInterval(check, CHECK_POLL_MS);
    return () => {
      mounted = false;
      clearInterval(heartbeatTimer);
      clearInterval(checkTimer);
    };
  }, [displayId]);

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
        fontFamily: 'Inter, system-ui, sans-serif',
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
