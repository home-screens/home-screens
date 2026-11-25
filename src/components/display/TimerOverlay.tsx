'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useTranslate } from '@/i18n';
import { DISPLAY_LAYERS } from '@/lib/display-layers';
import { canSubtractMinute, quickTimerLengthSec, sessionProgress, sessionTargetsDisplay } from '@/lib/timer-logic';
import { postTimerControl, type TimerControlAction } from '@/lib/timer-control';
import {
  dismissTimesUp,
  getBoxTimerSession,
  getDismissedTimesUp,
  setShowingTimerSession,
  subscribeTimerPresence,
} from '@/lib/timer-presence';
import { useTimerSession } from '@/hooks/useTimerSession';
import { useTouchReveal } from '@/components/modules/shared/useTouchReveal';
import type { TimerSession } from '@/types/timers';
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
  // Whether this display is one the timer runs on. Targets never change
  // within a session.
  const { session: serverSession, live, now, refresh } = useTimerSession(
    (l) => (sessionTargetsDisplay(l, displayId) ? (l.status === 'done' ? DONE_TICK_MS : TICK_MS) : null),
  );
  const targeted = sessionTargetsDisplay(serverSession, displayId);

  // "Time's up!" closed by a tap on this wall, here or in a Quick Timer box.
  // Other displays keep their linger.
  const dismissedId = useSyncExternalStore(subscribeTimerPresence, getDismissedTimesUp, () => null);
  const dismissed = live?.status === 'done' && live.id === dismissedId;

  // A Quick Timer set to stay in its own box asks for no takeover: this
  // display is still one the timer is running on, so it keeps the tick and
  // keeps chiming, and the box draws the countdown and the finish. Only the
  // cover comes off. The one thing a box cannot do is say "Time's up!" when
  // its screen is not the one showing, and a timer nobody is told has ended
  // has failed at the one thing it is for, so the finish is drawn here then.
  const boxSessionId = useSyncExternalStore(subscribeTimerPresence, getBoxTimerSession, () => null);
  const boxed = serverSession?.fullScreen === false;
  const finishedUnseen = boxed && live?.status === 'done' && boxSessionId !== live.id;
  const matches = targeted && (!boxed || finishedUnseen);

  // Tell the status heartbeat which session this wall has (null when it has
  // none), so the remote can confirm a display picked it up. A timer kept in
  // its box counts for as long as it runs here, even while the rotation is on
  // a screen without the box: this wall is still keeping the time and will
  // say when it is up, and "check that the wall is on" would send a parent
  // looking for a fault that is not there.
  const heldInBox = boxed && targeted && live?.status === 'running';
  const showingId = live && (matches || heldInBox) && live.status !== 'cancelled' && !dismissed ? live.id : null;
  useEffect(() => {
    setShowingTimerSession(showingId);
  }, [showingId]);
  useEffect(() => () => setShowingTimerSession(null), []);

  const { step, remainingMs, fraction, paused } = sessionProgress(live, now);
  const nudge = !!step && !live?.awaitingTap && remainingMs > 0 && fraction <= NUDGE_FRACTION;
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
    live?.name ?? (live ? formatQuickName(quickTimerLengthSec(live), t, 'timer') : '');

  // Sound transitions — compare against the previous materialized frame.
  const prevRef = useRef<{ id: string; stepIndex: number; nudge: boolean; status: string } | null>(null);
  useEffect(() => {
    const current = live && targeted
      ? { id: live.id, stepIndex: live.stepIndex, nudge, status: live.status }
      : null;
    const prev = prevRef.current;
    prevRef.current = current;
    if (!current || !live?.sound || live.status === 'cancelled') return;
    if (prev?.id !== current.id) return; // session start/replace: no chime
    if (current.status === 'done' && prev.status !== 'done') playTimerSound('done');
    else if (current.stepIndex !== prev.stepIndex) playTimerSound('step');
    else if (current.nudge && !prev.nudge) playTimerSound('nudge');
  }, [live, targeted, nudge]);

  // Every press names the timer on this screen (`postTimerControl`), and the
  // read that follows it shows what is really running.
  const act = useCallback((action: TimerControlAction, on: Pick<TimerSession, 'id' | 'stepIndex'>) => {
    void (async () => {
      await postTimerControl(action, on);
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
      ? () => dismissTimesUp(live.id)
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
          maxWidth={viewport?.w}
          t={t}
          onPause={() => act('pause', live)}
          onResume={() => act('resume', live)}
          onAddMinute={() => act('add-minute', live)}
          // Only offered while it leaves a minute on the clock: under two
          // minutes a few plain taps would run the timer down to nothing,
          // where Stop asks for a hold.
          onSubtractMinute={canSubtractMinute(remainingMs) ? () => act('subtract-minute', live) : undefined}
          onToggleSound={() => act('toggle-sound', live)}
          soundOn={live.sound !== false}
          // A routine can be moved on by hand while there is a step to move
          // on to. On the last one the button would end the whole routine at
          // a tap, which is Stop's job and Stop asks for a hold.
          onStepDone={live.stepIndex < live.steps.length - 1 ? () => act('step-done', live) : undefined}
          onStop={() => {
            controls.hide();
            act('cancel', live);
          }}
        />
      )}
    </div>
  );
}
