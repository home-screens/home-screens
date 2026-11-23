'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslate } from '@/i18n';
import { displayFetch } from '@/lib/display-fetch';
import { subscribeRevisions } from '@/lib/display-heartbeat';
import { DISPLAY_LAYERS } from '@/lib/display-layers';
import { materializeSession } from '@/lib/timer-logic';
import { setShowingTimerSession, subscribeTimerRefresh } from '@/lib/timer-presence';
import { useTouchReveal } from '@/components/modules/shared/useTouchReveal';
import type { MaterializedTimerSession, TimerSession } from '@/types/timers';
import { NUDGE_FRACTION, TIMER_CANVAS_H, TIMER_CANVAS_W, formatQuickName } from './timer-views/shared';
import { playTimerSound } from './timer-views/timer-sounds';
import RingTimerView from './timer-views/RingTimerView';
import FaceTimerView from './timer-views/FaceTimerView';
import CascadeTimerView from './timer-views/CascadeTimerView';
import PathTimerView from './timer-views/PathTimerView';
import TimerCelebration from './timer-views/TimerCelebration';
import TimerControls from './timer-views/TimerControls';

const TICK_MS = 250;

/** How long the buttons a tap brings up stay with nobody touching the screen. */
export const TIMER_CONTROLS_IDLE_MS = 8_000;

/** "Time's up!" stays for minutes, so it checks for its end once a second rather than four times. */
const DONE_TICK_MS = 1_000;

type SessionAction = 'pause' | 'resume' | 'add-minute' | 'cancel' | 'step-done';

interface TimerOverlayProps {
  /** Undefined on the legacy single-display route — matches every session. */
  displayId?: string;
  /**
   * Measured viewport from ScreenRotator. The views scale against the timer
   * mockup canvas (1080×1920), NOT the display's configured canvas — a
   * landscape display's canvas-fit scale is ~1, which would overflow the
   * portrait composition and let flexbox squash the clock faces into ovals.
   */
  viewport?: { w: number; h: number };
}

/**
 * Full-screen takeover for a running timer/routine session, started from
 * /remote or the wall's Timers sheet. Its buttons (pause, one more minute,
 * stop) show for `TIMER_CONTROLS_IDLE_MS` when a timer starts and after every
 * tap, and stay up while paused. A step waiting for its "Done!" keeps the
 * whole screen as that button. "Time's up!" stays until a tap closes it on
 * this display (or `TIMES_UP_HOLD_MS` passes). Fetches the session when the heartbeat names a new revision (a
 * start, skip, pause or cancel was saved) and derives the live countdown,
 * step advances and expiry locally from the session's epoch timestamps via
 * `materializeSession` — so beat latency affects only how fast a takeover
 * appears, never countdown accuracy.
 *
 * Sits ABOVE SleepOverlay (same z, later in DOM): starting a timer at a
 * sleeping display is an explicit wake intent. Below AlertOverlay so urgent
 * alerts still surface. Rotation continues underneath, covered — when the
 * session ends the display is exactly where rotation would have put it.
 */
export default function TimerOverlay({ displayId, viewport }: TimerOverlayProps) {
  const t = useTranslate('core');
  const [serverSession, setServerSession] = useState<TimerSession | null>(null);
  const [now, setNow] = useState(() => Date.now());

  /** Fetch the session. Resolves true once it is applied. */
  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const res = await displayFetch('/api/timers/session');
      if (!res.ok) return false;
      const json = (await res.json()) as { session: TimerSession | null };
      setServerSession(json.session);
      setNow(Date.now());
      return true;
    } catch {
      // Keep the last known session — local materialization still advances
      // and expires it, so a hub blip can't strand a stale takeover.
      return false;
    }
  }, []);

  // The session revision last applied. Advanced only after a successful
  // fetch, so a failed one is retried on the next beat.
  const appliedRevisionRef = useRef<string | null>(null);
  const fetchingRef = useRef(false);
  useEffect(() => subscribeRevisions(({ timer }) => {
    if (timer === undefined || timer === appliedRevisionRef.current || fetchingRef.current) return;
    fetchingRef.current = true;
    void refresh().then((applied) => {
      fetchingRef.current = false;
      if (applied) appliedRevisionRef.current = timer;
    });
  }), [refresh]);

  // The Timers sheet on this display just started one: show it now.
  useEffect(() => subscribeTimerRefresh(() => { void refresh(); }), [refresh]);

  const live: MaterializedTimerSession | null = useMemo(
    () => materializeSession(serverSession, now),
    [serverSession, now],
  );

  // Target match derives from the raw session (targets are immutable per
  // session).
  const matches =
    !serverSession ||
    serverSession.targets === 'all' ||
    displayId === undefined ||
    serverSession.targets.includes(displayId);

  // Fast local tick only while this display is actually showing the session.
  // Keyed on the session id, not `live` — materialization returns a fresh
  // object every tick, which would tear down and rebuild this interval 4x/s.
  // Non-targeted displays skip the tick entirely. The tick stops once the
  // session expires here: the hub keeps the finished session on file, so no
  // new revision (and no fetch) ever arrives to clear `serverSession`.
  const tickingSessionId = live && matches ? live.id : null;
  const tickMs = live?.status === 'done' ? DONE_TICK_MS : TICK_MS;
  useEffect(() => {
    if (!tickingSessionId) return;
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickingSessionId, tickMs]);

  // "Time's up!" closed by a tap here. Other displays keep their linger.
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const dismissed = live?.status === 'done' && live.id === dismissedId;

  // Tell the status heartbeat which session is on this screen (null when the
  // takeover is down), so the remote can confirm a display picked it up.
  const showingId = live && matches && live.status !== 'cancelled' && !dismissed ? live.id : null;
  useEffect(() => {
    setShowingTimerSession(showingId);
  }, [showingId]);
  useEffect(() => () => setShowingTimerSession(null), []);

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
  const controls = useTouchReveal({
    idleMs: TIMER_CONTROLS_IDLE_MS,
    pinned: paused,
    enabled: !!step && !live?.awaitingTap,
  });

  // Each new timer shows its buttons for the first wait, so someone who has
  // never seen them learns a tap brings them back.
  const introducedRef = useRef<string | null>(null);
  const introduce = controls.poke;
  const introId = live && matches && live.status === 'running' && !live.awaitingTap ? live.id : null;
  useEffect(() => {
    if (!introId || introducedRef.current === introId) return;
    introducedRef.current = introId;
    introduce();
  }, [introId, introduce]);

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

  // A press names the timer on this screen and, for "Done!", the step: the
  // hub's timer can be another one by now (started from a phone inside the
  // last heartbeat), and a second "Done!" tap must not skip the next step.
  // The hub turns a press for anything else down, and the read that follows
  // every press shows what is really running.
  const act = useCallback((action: SessionAction, on: Pick<TimerSession, 'id' | 'stepIndex'>) => {
    void (async () => {
      try {
        await displayFetch('/api/timers/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            sessionId: on.id,
            ...(action === 'step-done' ? { stepIndex: on.stepIndex } : {}),
          }),
        });
      } catch {
        // The next poll reconciles.
      }
      void refresh();
    })();
  }, [refresh]);

  if (!live || !matches || live.status === 'cancelled' || dismissed) return null;

  // What a tap on the screen means: "Done!" on a step waiting for it, close on
  // "Time's up!", and otherwise bring the buttons up (or keep them up). A tap
  // on one of the buttons lands here too, which keeps them up a while longer.
  const onTap = live.awaitingTap
    ? () => act('step-done', live)
    : live.status === 'done'
      ? () => setDismissedId(live.id)
      : controls.poke;

  // 0 until the rotator has measured the viewport — same invisible-first-frame
  // convention as the screen renderer, preventing an unscaled flash.
  const s = viewport && viewport.w > 0
    ? Math.min(viewport.w / TIMER_CANVAS_W, viewport.h / TIMER_CANVAS_H)
    : 0;

  return (
    <div
      data-testid="timer-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: DISPLAY_LAYERS.timer,
        overflow: 'hidden',
        // Opt out of the screen-rotation view transition (rotation keeps
        // running underneath): without a named group the timer is captured
        // in the root snapshot and visibly slides/freezes on every rotation,
        // and the pinned sleep-overlay group paints above it while dimmed.
        // Paired with the ::view-transition rules in globals.css.
        viewTransitionName: 'timer-overlay',
      }}
      // A finger going down counts as a touch too: Stop is a hold with no
      // click until it ends, and the buttons must not go away under it. While
      // a step waits for "Done!" or "Time's up!" shows, a poke does nothing.
      onPointerDown={controls.poke}
      onClick={onTap}
    >
      {live.status === 'done' ? (
        <TimerCelebration session={live} title={title} s={s} t={t} />
      ) : (
        (() => {
          const props = { session: live, step: step!, remainingMs, fraction, nudge, title, s, t };
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
      {controls.shown && live.status === 'running' && (
        <TimerControls
          view={live.view}
          paused={paused}
          s={s}
          t={t}
          onPause={() => act('pause', live)}
          onResume={() => act('resume', live)}
          onAddMinute={() => act('add-minute', live)}
          onStop={() => {
            controls.hide();
            act('cancel', live);
          }}
        />
      )}
    </div>
  );
}
