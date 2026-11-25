'use client';

import { AlarmClockPlus, Check, Minus, Pause, Play, Square, Volume2, VolumeX } from 'lucide-react';
import type { TimerView } from '@/types/timers';
import { useSettling } from '@/hooks/useSheetTapGuard';
import { STEP_SETTLE_MS } from '@/lib/sheet-tap-guard';
import {
  WallControlBar,
  WallControlButton,
  WallControlHoldButton,
  type WallControlShade,
  type WallControlTone,
} from '@/components/modules/shared/WallControlBar';
import type { TimerTranslate } from './shared';

/** How each look carries the bar: Timer face is the light one; Color fall is bright orange, which a grey shade would muddy. */
const LOOK: Record<TimerView, { tone: WallControlTone; shade: WallControlShade }> = {
  ring: { tone: 'dark', shade: 'dark' },
  path: { tone: 'dark', shade: 'dark' },
  cascade: { tone: 'dark', shade: 'warm' },
  face: { tone: 'light', shade: 'light' },
};

/**
 * Timer face draws its big time low on the screen; its shade stops below it
 * so the time never fades. The other looks keep their words higher up, and
 * their shade covers the step chips the bar sits over.
 */
const shadeHeight = (view: TimerView, paused: boolean) => (view === 'face' ? (paused ? 400 : 360) : 760);

export interface TimerControlsProps {
  view: TimerView;
  paused: boolean;
  s: number;
  /** The wall's width in its own pixels, so the bar can fit all its buttons. */
  maxWidth?: number;
  t: TimerTranslate;
  onPause: () => void;
  onResume: () => void;
  onAddMinute: () => void;
  onStop: () => void;
  /**
   * Take a minute back off. Absent, the button is not drawn: the overlay
   * leaves it out under two minutes (`canSubtractMinute`), and a dimmed
   * button on a wall reads as broken from across the room, where a missing
   * one reads as "not now".
   */
  onSubtractMinute?: () => void;
  /** Mute the chime. Absent leaves the bar without a sound button. */
  onToggleSound?: () => void;
  soundOn?: boolean;
  /**
   * Finish the step that is counting and move to the next one. Only a
   * routine of several steps has one, so a plain timer leaves it out.
   */
  onStepDone?: () => void;
}

/**
 * The running timer's buttons on the wall: Pause (Resume while paused, lit),
 * one more minute, and Stop, which has to be held. They act on the one timer
 * the house has, so a pause here pauses it on every display and the phone.
 * While paused the bar says so over the buttons, in place of each look's own
 * "Paused" pill.
 */
export default function TimerControls({
  view, paused, s, maxWidth, t, onPause, onResume, onAddMinute, onStop,
  onSubtractMinute, onToggleSound, soundOn = true, onStepDone,
}: TimerControlsProps) {
  const look = LOOK[view] ?? LOOK.ring;
  const fill = { fill: 'currentColor', strokeWidth: 0 } as const;
  // The bar is centred, so when "-1 min" goes (or comes back after "+1 min")
  // every button slides. For a moment none takes a tap, so a finger already
  // on its way to "-1 min" lands on nothing rather than on its neighbour.
  // Not on the bar coming up: a tap brings it, and its buttons answer at once.
  const settling = useSettling(!!onSubtractMinute, STEP_SETTLE_MS, { fromMount: false });
  return (
    <WallControlBar
      unit={s}
      tone={look.tone}
      shade={look.shade}
      shadeHeight={shadeHeight(view, paused)}
      maxWidth={maxWidth}
      settling={settling}
      label={paused ? t('timer.paused') : undefined}
      ariaLabel={t('timer.controls')}
      testId="timer-controls"
    >
      {onStepDone && (
        <WallControlButton icon={<Check strokeWidth={3} />} label={t('timer.stepDone')} onPress={onStepDone} testId="timer-step-done" />
      )}
      {paused ? (
        <WallControlButton primary icon={<Play {...fill} />} label={t('timer.resume')} onPress={onResume} testId="timer-resume" />
      ) : (
        <WallControlButton icon={<Pause {...fill} />} label={t('timer.pause')} onPress={onPause} testId="timer-pause" />
      )}
      {onSubtractMinute && (
        <WallControlButton
          icon={<Minus strokeWidth={2.2} />}
          label={t('timer.subtractMinute')}
          onPress={onSubtractMinute}
          testId="timer-subtract-minute"
        />
      )}
      <WallControlButton icon={<AlarmClockPlus strokeWidth={2.2} />} label={t('timer.addMinute')} onPress={onAddMinute} testId="timer-add-minute" />
      {onToggleSound && (
        <WallControlButton
          // Icon and word both say how it stands now, not what a press would
          // do: at a wall's distance "Sound off" under a loudspeaker icon
          // reads as the state, so labelling the action said the opposite of
          // the truth. A press flips both.
          icon={soundOn ? <Volume2 strokeWidth={2.2} /> : <VolumeX strokeWidth={2.2} />}
          label={t(soundOn ? 'timer.soundOn' : 'timer.soundOff')}
          onPress={onToggleSound}
          testId="timer-sound"
        />
      )}
      <WallControlHoldButton
        icon={<Square {...fill} />}
        label={t('timer.stop')}
        ariaLabel={t('timer.stopHoldHint')}
        hint={t('timer.keepHoldingToStop')}
        sub={t('timer.holdShort')}
        onConfirm={onStop}
        testId="timer-stop"
      />
    </WallControlBar>
  );
}
