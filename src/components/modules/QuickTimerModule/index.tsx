'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Minus, Pause, Play, Plus, Square } from 'lucide-react';
import type { ModuleStyle, QuickTimerConfig } from '@/types/config';
import type { TimerTargets, TimerView } from '@/types/timers';
import { useTranslate } from '@/i18n';
import { useDisplayId } from '@/hooks/useDisplayId';
import { useElementBox } from '@/hooks/useElementBox';
import { TIMER_TICK_MS, useTimerSession } from '@/hooks/useTimerSession';
import { WallButton } from '../shared/WallButton';
import { useModuleSurface } from '@/components/modules/module-surface';
import { useSettling } from '@/hooks/useSheetTapGuard';
import { STEP_SETTLE_MS } from '@/lib/sheet-tap-guard';
import ModuleWrapper from '@/components/modules/ModuleWrapper';
import { resolveTextScale } from '@/lib/module-style';
import { canSubtractMinute, quickTimerLengthSec, sessionProgress, sessionTargetsDisplay } from '@/lib/timer-logic';
import {
  dismissTimesUp,
  getDismissedTimesUp,
  setBoxTimerSession,
  subscribeTimerPresence,
} from '@/lib/timer-presence';
import { postTimerControl, startQuickTimer, type TimerControlAction } from '@/lib/timer-control';
import { formatQuickName, formatRemaining } from '@/components/display/timer-views/shared';
import { HoldConfirmButton } from '@/components/modules/shared/HoldConfirmButton';
import { MIN_TYPE, NAME_LINE, quickTimerFinishedMetrics, quickTimerMetrics } from './metrics';

/** What the module falls back to, and what the registry's defaultConfig says. */
export const DEFAULT_PRESET_MINUTES = [1, 5, 10, 15];
/** More than this and the buttons stop being readable across a kitchen. */
export const MAX_PRESETS = 6;

export interface QuickTimerModuleProps {
  config?: Partial<QuickTimerConfig>;
  style: ModuleStyle;
  /** Authoritative render-as display id, threaded from ScreenRenderer; the
   *  legacy /display route renders main inline, so the URL alone can't say. */
  renderDisplayId?: string;
}

/**
 * The phone's Quick Timer, as a box on the wall.
 *
 * Nothing running: the preset lengths, one tap each. Something running on
 * this wall: the countdown and the controls for it. The two states are
 * exclusive on purpose: while a timer is going there is nothing here to tap
 * but Stop, so a hand at kid height cannot replace a bedtime routine with a
 * five minute timer, which is the case the phone holds behind a confirm
 * sheet. A timer running only on another wall is not this wall's to stop, and
 * the family has one timer at a time, so the lengths wait, dimmed, until it
 * is over. A timer kept in this box says "Time's up!" here until a tap puts
 * it away.
 *
 * It drives the one family session (`/api/timers/session`), so the phone's
 * Timers tab, the full-screen takeover and this box always agree.
 */
export default function QuickTimerModule({ config = {}, style, renderDisplayId }: QuickTimerModuleProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const urlDisplayId = useDisplayId();
  const displayId = renderDisplayId ?? urlDisplayId;
  // Only the kiosk itself starts timers. The editor renders this module as a
  // preview, and a tap there must not set the kitchen wall counting.
  const surface = useModuleSurface();

  const presets = (config.presetMinutes ?? DEFAULT_PRESET_MINUTES)
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, MAX_PRESETS);
  const view = (config.timerView ?? 'face') as TimerView;
  const sound = config.timerSound ?? true;
  const fullScreen = config.fullScreen ?? true;
  const targets: TimerTargets =
    config.timerTarget === 'this' && displayId ? [displayId] : 'all';

  // Only this wall's own timer needs the clock here: four times a second
  // while it counts, once a second while a finished one waits for a tap.
  const { session, live, now, loaded, refresh } = useTimerSession(
    (l) => {
      // Another wall's timer is not drawn here, but this box still has to
      // notice it end: the hub says nothing when a timer simply runs out, so
      // without a clock the lengths would stay dimmed until the next timer.
      if (!sessionTargetsDisplay(l, displayId)) return l.status === 'running' ? 1_000 : null;
      if (l.status === 'running') return TIMER_TICK_MS;
      return l.status === 'done' && l.fullScreen === false ? 1_000 : null;
    },
    surface === 'display',
  );
  const mine = sessionTargetsDisplay(session, displayId);
  const running = live && live.status === 'running' && mine ? live : null;
  // Another wall's timer: nothing to show here, and nothing to start either.
  const busyElsewhere = !!live && live.status === 'running' && !mine;
  const { step, remainingMs, fraction, paused } = sessionProgress(running, now);

  // A timer kept in its box ends here too. The takeover is not drawn for it,
  // so without this the box would drop back to its lengths at 0:00 with
  // nothing on the wall saying the time is up.
  const dismissedId = useSyncExternalStore(subscribeTimerPresence, getDismissedTimesUp, () => null);
  const finished =
    live && live.status === 'done' && mine && live.fullScreen === false && live.id !== dismissedId
      ? live
      : null;

  // Tell the page a box is drawing this timer in place: the phone's "Showing
  // on" line reads it, and the takeover leaves the finish to this box.
  const [boxKey] = useState(() => ({}));
  const inBox = running?.fullScreen === false ? running.id : finished?.id ?? null;
  useEffect(() => {
    setBoxTimerSession(boxKey, inBox);
  }, [boxKey, inBox]);
  useEffect(() => () => setBoxTimerSession(boxKey, null), [boxKey]);

  // "No title" in the Title setting means no heading at all, as on every
  // module with a heading of its own; a card title stands in for it.
  const showHeading = config.showTitle !== false && !style.title?.trim();

  // Measured inside the card, so the box is what the card's padding left.
  const [boxRef, box] = useElementBox('content');
  const m = quickTimerMetrics({
    w: box.width,
    h: box.height,
    presets: presets.length,
    running: !!running,
    heading: showHeading,
    textScale: resolveTextScale(style),
  });

  // "-1 min" is drawn only while it leaves a minute on the clock, in a box
  // with room for the minute buttons.
  const subtract = !!running && m.nudges && canSubtractMinute(remainingMs);

  // What the box shows changes in place, under whatever finger made it
  // change: the lengths come back where "Time's up!" and Stop were, the
  // buttons appear where a length was, and the row closes up when "-1 min"
  // goes under two minutes (and opens again for it after "+1 min"). For a
  // moment after each change nothing new takes a tap, so the second half of
  // a double tap starts nothing, and a tap meant for "-1 min" lands on
  // nothing rather than on the button that took its place.
  const boxState = running ? 'running' : finished ? 'finished' : busyElsewhere ? 'busy' : 'idle';
  const settling = useSettling(`${boxState}:${subtract}`, STEP_SETTLE_MS);

  // A press names the timer and step it was made looking at, so the hub can
  // turn down one meant for a timer that is no longer the one running.
  const act = useCallback((action: TimerControlAction) => {
    if (surface !== 'display' || !running) return;
    const on = { id: running.id, stepIndex: running.stepIndex };
    void (async () => {
      await postTimerControl(action, on);
      void refresh();
    })();
  }, [surface, refresh, running]);

  // The length a finger last went down on. Stop is held, and when it fires
  // the lengths come back under a finger that is still down: lifting it then
  // must not count as a tap on whichever length took Stop's place.
  const pressedLength = useRef<number | null>(null);

  const start = (minutes: number) => {
    if (surface !== 'display' || busyElsewhere) return;
    void (async () => {
      await startQuickTimer({ durationSec: Math.round(minutes * 60), view, sound, targets, fullScreen });
      void refresh();
    })();
  };

  const heading = m.head > 0 && (
    <div
      style={{
        fontSize: m.head,
        lineHeight: 1.3,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        // Ink from the card, dimmed — a fixed grey would ignore Text color.
        opacity: 0.55,
        flexShrink: 0,
      }}
    >
      {t('quick-timer.title')}
    </div>
  );

  const buttonBase = {
    border: 'none',
    borderRadius: m.radius,
    background: 'rgba(127,127,127,0.18)',
    color: 'inherit',
    fontFamily: 'inherit',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as const;

  if (running && step) {
    // The row closes up when "-1 min" is not offered: three across in a wide
    // box, and in a two-by-two box Pause takes the whole top row, so +1 min
    // and Stop stay where they were. A step waiting for its tap has two
    // buttons whatever the box.
    const cols = running.awaitingTap ? 2 : m.ctrlRows === 1 && m.nudges && !subtract ? 3 : m.ctrlCols;
    const pauseRow = m.ctrlRows === 2 && m.nudges && !subtract;
    const label = [
      running.name ?? formatQuickName(quickTimerLengthSec(running), tCore, 'timer'),
      running.kind === 'routine' ? step.label : null,
      paused ? tCore('timer.paused') : null,
    ].filter(Boolean).join(' · ');

    const ctrl = {
      ...buttonBase,
      height: m.ctrlH,
      fontSize: m.ctrl,
      fontWeight: 600,
      gap: m.ctrl * 0.35,
      borderRadius: m.radius * 0.85,
      minWidth: 0,
    };
    const icon = { width: m.ctrlIcon, height: m.ctrlIcon, flexShrink: 0 };

    return (
      <ModuleWrapper style={style}>
        <div
          ref={boxRef}
          data-testid="quick-timer"
          data-state="running"
          style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', gap: m.gap }}
        >
        {heading}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: m.gap, minHeight: 0 }}>
          <div
            data-testid="quick-timer-remaining"
            style={{
              fontSize: m.time,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1,
              textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
              // Dimmed rather than recoloured, so the card's Text color stands.
              opacity: paused ? 0.6 : 1,
            }}
          >
            {running.awaitingTap ? '0:00' : formatRemaining(remainingMs)}
          </div>
          {m.name > 0 && (
            <div
              style={{
                fontSize: m.name,
                lineHeight: NAME_LINE,
                flexShrink: 0,
                textAlign: 'center',
                opacity: 0.6,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {label}
            </div>
          )}
          {m.bar > 0 && (
            <div style={{ height: m.bar, borderRadius: 999, background: 'rgba(127,127,127,0.25)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${fraction * 100}%`,
                  borderRadius: 999,
                  background: paused ? 'currentColor' : '#2dd4bf',
                }}
              />
            </div>
          )}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gap: m.gap,
            flexShrink: 0,
          }}
        >
          {running.awaitingTap ? (
            <WallButton
              data-testid="quick-timer-done"
              disabled={settling}
              onClick={() => act('step-done')}
              style={{ ...ctrl, background: '#34d399', color: '#06281c' }}
            >
              {tCore('timer.done')}
            </WallButton>
          ) : (
            <>
              <WallButton
                data-testid="quick-timer-pause"
                aria-label={tCore(paused ? 'timer.resume' : 'timer.pause')}
                disabled={settling}
                onClick={() => act(paused ? 'resume' : 'pause')}
                style={pauseRow ? { ...ctrl, gridColumn: '1 / -1' } : ctrl}
              >
                {paused ? <Play style={icon} /> : <Pause style={icon} />}
                {m.ctrlWords && tCore(paused ? 'timer.resume' : 'timer.pause')}
              </WallButton>
              {m.nudges && (
                <>
                  {subtract && (
                    <WallButton
                      data-testid="quick-timer-subtract"
                      aria-label={tCore('timer.subtractMinuteSpoken')}
                      disabled={settling}
                      onClick={() => act('subtract-minute')}
                      style={ctrl}
                    >
                      <Minus style={icon} />
                      {m.ctrlWords ? tCore('timer.oneMinute') : '1'}
                    </WallButton>
                  )}
                  <WallButton
                    data-testid="quick-timer-add"
                    aria-label={tCore('timer.addMinuteSpoken')}
                    disabled={settling}
                    onClick={() => act('add-minute')}
                    style={ctrl}
                  >
                    <Plus style={icon} />
                    {m.ctrlWords ? tCore('timer.oneMinute') : '1'}
                  </WallButton>
                </>
              )}
            </>
          )}
          <HoldConfirmButton
            onConfirm={() => act('cancel')}
            ariaLabel={tCore('timer.stop')}
            hint={tCore('timer.holdToStop')}
            hintFontSize={Math.max(MIN_TYPE, m.ctrl * 0.85)}
            // Over the row, not on it: on the button it hid the word "Stop"
            // under the finger that had just tapped it.
            hintPlacement="above"
            hintAlign="end"
            style={{ ...ctrl, background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
          >
            <span data-testid="quick-timer-stop" style={{ display: 'flex', alignItems: 'center', gap: m.ctrl * 0.35 }}>
              <Square style={icon} />
              {m.ctrlWords && tCore('timer.stop')}
            </span>
          </HoldConfirmButton>
          </div>
        </div>
      </ModuleWrapper>
    );
  }

  if (finished) {
    const f = quickTimerFinishedMetrics({ w: box.width, h: box.height, textScale: resolveTextScale(style) });
    const big = f.big;
    const small = f.small;
    const name = finished.name ?? formatQuickName(quickTimerLengthSec(finished), tCore, 'timer');
    return (
      <ModuleWrapper style={style}>
        <div
          ref={boxRef}
          data-testid="quick-timer"
          data-state="finished"
          style={{ height: '100%', width: '100%', display: 'flex' }}
        >
          <WallButton
            row
            data-testid="quick-timer-times-up"
            disabled={settling}
            onClick={() => dismissTimesUp(finished.id)}
            style={{
              ...buttonBase,
              flex: 1,
              flexDirection: 'column',
              gap: small * 0.5,
              minWidth: 0,
              // The "Done!" green every timer look uses, solid: a box that
              // only tints is easy to miss from across a kitchen with the
              // sound off. It breathes a few times and then rests, as the
              // full-screen finish's confetti does, to spare a Pi.
              background: '#34d399',
              color: '#06281c',
              animation: 'hs-quick-timer-done 1.6s ease-in-out 6 alternate',
              lineHeight: 1.1,
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: big, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {tCore('timer.timesUp')}
            </span>
            {f.name && (
              <span style={{ fontSize: small, opacity: 0.8, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name}
              </span>
            )}
            {f.hint && (
              <span style={{ fontSize: small, opacity: 0.65 }}>{tCore('timer.tapToClose')}</span>
            )}
          </WallButton>
        </div>
      </ModuleWrapper>
    );
  }

  return (
    <ModuleWrapper style={style}>
      <div
        ref={boxRef}
        data-testid="quick-timer"
        data-state={busyElsewhere ? 'busy' : 'idle'}
        style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', gap: m.gap }}
      >
      {heading}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: `repeat(${m.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${m.rows}, minmax(0, 1fr))`,
          gap: m.gap,
          minHeight: 0,
        }}
      >
        {presets.map((minutes, i) => (
          <WallButton
            key={`${minutes}-${i}`}
            type="button"
            data-testid="quick-timer-preset"
            data-minutes={minutes}
            aria-label={t('quick-timer.startAriaLabel', { count: minutes, minutes })}
            // Until the hub has said what is running, a tap could replace a
            // timer this box has not heard of yet.
            disabled={busyElsewhere || settling || !loaded}
            onPointerDown={() => { pressedLength.current = minutes; }}
            onClick={(e) => {
              // `detail` is 0 for a key press, which has no pointer to check.
              const fromHere = e.detail === 0 || pressedLength.current === minutes;
              pressedLength.current = null;
              if (fromHere) start(minutes);
            }}
            style={{
              ...buttonBase,
              flexDirection: 'column',
              lineHeight: 1,
              minWidth: 0,
              opacity: busyElsewhere ? 0.35 : 1,
              cursor: busyElsewhere ? 'default' : 'pointer',
            }}
          >
            <span style={{ fontSize: m.number, fontWeight: 700 }}>{minutes}</span>
            {m.unit > 0 && (
              <span style={{ fontSize: m.unit, fontWeight: 600, marginTop: m.unit * 0.35, opacity: 0.6 }}>
                {t('quick-timer.unit')}
              </span>
            )}
          </WallButton>
          ))}
        </div>
        {busyElsewhere && (
          <div
            data-testid="quick-timer-busy"
            // The only thing on the wall saying why a tap does nothing, so it
            // is sized to be read from a step back and may take two lines.
            style={{
              fontSize: Math.max(MIN_TYPE, Math.min(22, (box.width || 308) / 24)) * resolveTextScale(style),
              lineHeight: 1.2,
              textAlign: 'center',
              opacity: 0.85,
              flexShrink: 0,
            }}
          >
            {t('quick-timer.busyElsewhere')}
          </div>
        )}
      </div>
    </ModuleWrapper>
  );
}
