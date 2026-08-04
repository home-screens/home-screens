'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslate } from '@/i18n';
import { displayFetch } from '@/lib/display-fetch';
import { materializeSession } from '@/lib/timer-logic';
import type { MaterializedTimerSession, TimerSession } from '@/types/timers';
import { NUDGE_FRACTION, formatQuickName } from './timer-views/shared';
import { playTimerSound } from './timer-views/timer-sounds';
import RingTimerView from './timer-views/RingTimerView';
import FaceTimerView from './timer-views/FaceTimerView';
import CascadeTimerView from './timer-views/CascadeTimerView';
import PathTimerView from './timer-views/PathTimerView';
import TimerCelebration from './timer-views/TimerCelebration';

const SESSION_POLL_MS = 3_000;
const TICK_MS = 250;

interface TimerOverlayProps {
  /** Undefined on the legacy single-display route — matches every session. */
  displayId?: string;
  /** Canvas scale from ScreenRotator (same one AlertOverlay uses). */
  scale?: number;
}

/**
 * Full-screen takeover for a running timer/routine session, started from
 * /remote. Polls the hub every few seconds for session *events* (start,
 * skip, cancel) and derives the live countdown locally from the session's
 * epoch timestamps via `materializeSession` — so poll latency affects only
 * how fast a takeover appears, never countdown accuracy.
 *
 * Sits ABOVE SleepOverlay (same z, later in DOM): starting a timer at a
 * sleeping display is an explicit wake intent. Below AlertOverlay so urgent
 * alerts still surface. Rotation continues underneath, covered — when the
 * session ends the display is exactly where rotation would have put it.
 */
export default function TimerOverlay({ displayId, scale = 1 }: TimerOverlayProps) {
  const t = useTranslate('core');
  const [serverSession, setServerSession] = useState<TimerSession | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const res = await displayFetch('/api/timers/session');
      if (!res.ok) return;
      const json = (await res.json()) as { session: TimerSession | null };
      setServerSession(json.session);
      setNow(Date.now());
    } catch {
      // Keep the last known session — local materialization still advances
      // and expires it, so a hub blip can't strand a stale takeover.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), SESSION_POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const live: MaterializedTimerSession | null = useMemo(
    () => materializeSession(serverSession, now),
    [serverSession, now],
  );

  // Target match derives from the raw session (targets are immutable per
  // session), so it can gate the tick without depending on `live`.
  const matches =
    !serverSession ||
    serverSession.targets === 'all' ||
    displayId === undefined ||
    serverSession.targets.includes(displayId);

  // Fast local tick only while this display is actually showing the session.
  // Keyed on the session id, not `live` — materialization returns a fresh
  // object every tick, which would tear down and rebuild this interval 4x/s.
  // Non-targeted displays skip the tick entirely and just keep the 3s poll.
  const tickingSessionId = serverSession && matches ? serverSession.id : null;
  useEffect(() => {
    if (!tickingSessionId) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [tickingSessionId]);

  const step = live && live.status === 'running' ? live.steps[live.stepIndex] : undefined;
  const durMs = step ? step.durationSec * 1000 : 0;
  const effectiveNow = live?.pausedAt ?? now;
  const remainingMs = step && !live?.awaitingTap
    ? Math.max(0, durMs - (effectiveNow - (live?.stepStartedAt ?? 0)))
    : 0;
  // add-a-minute can push remaining past the step's duration — clamp to full.
  const fraction = step ? Math.min(1, Math.max(0, remainingMs / durMs)) : 0;
  const nudge = !!step && !live?.awaitingTap && remainingMs > 0 && fraction <= NUDGE_FRACTION;
  const paused = live?.pausedAt !== undefined;

  const title =
    live?.name ?? (live ? formatQuickName(live.steps[0].durationSec, t, 'timer') : '');

  // Sound transitions — compare against the previous materialized frame.
  const prevRef = useRef<{ id: string; stepIndex: number; nudge: boolean; status: string } | null>(null);
  useEffect(() => {
    const current = live && matches
      ? { id: live.id, stepIndex: live.stepIndex, nudge, status: live.status }
      : null;
    const prev = prevRef.current;
    prevRef.current = current;
    if (!current || !live?.sound || live.status === 'cancelled') return;
    if (prev?.id !== current.id) return; // session start/replace: no chime
    if (current.status === 'done' && prev.status !== 'done') playTimerSound('done');
    else if (current.stepIndex !== prev.stepIndex) playTimerSound('step');
    else if (current.nudge && !prev.nudge) playTimerSound('nudge');
  }, [live, matches, nudge]);

  const tapDone = useCallback(() => {
    void (async () => {
      try {
        await displayFetch('/api/timers/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'step-done' }),
        });
      } catch {
        // The next poll reconciles.
      }
      void refresh();
    })();
  }, [refresh]);

  if (!live || !matches || live.status === 'cancelled') return null;

  const s = scale;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 9997,
        overflow: 'hidden',
        // Opt out of the screen-rotation view transition (rotation keeps
        // running underneath): without a named group the timer is captured
        // in the root snapshot and visibly slides/freezes on every rotation,
        // and the pinned sleep-overlay group paints above it while dimmed.
        // Paired with the ::view-transition rules in globals.css.
        viewTransitionName: 'timer-overlay',
      }}
      onClick={live.awaitingTap ? tapDone : undefined}
    >
      {live.status === 'done' ? (
        <TimerCelebration session={live} title={title} s={s} t={t} />
      ) : (
        (() => {
          const props = { session: live, step: step!, remainingMs, fraction, nudge, paused, title, s, t };
          switch (live.view) {
            case 'face':
              return <FaceTimerView {...props} />;
            case 'cascade':
              return <CascadeTimerView {...props} />;
            case 'path':
              return <PathTimerView {...props} />;
            default:
              return <RingTimerView {...props} />;
          }
        })()
      )}
    </div>
  );
}
