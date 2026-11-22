'use client';

import { AlarmClockPlus, Pause, Play, Square } from 'lucide-react';
import type { TimerView } from '@/types/timers';
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
  t: TimerTranslate;
  onPause: () => void;
  onResume: () => void;
  onAddMinute: () => void;
  onStop: () => void;
}

/**
 * The running timer's buttons on the wall: Pause (Resume while paused, lit),
 * one more minute, and Stop, which has to be held. They act on the one timer
 * the house has, so a pause here pauses it on every display and the phone.
 * While paused the bar says so over the buttons, in place of each look's own
 * "Paused" pill.
 */
export default function TimerControls({ view, paused, s, t, onPause, onResume, onAddMinute, onStop }: TimerControlsProps) {
  const look = LOOK[view] ?? LOOK.ring;
  const fill = { fill: 'currentColor', strokeWidth: 0 } as const;
  return (
    <WallControlBar
      unit={s}
      tone={look.tone}
      shade={look.shade}
      shadeHeight={shadeHeight(view, paused)}
      label={paused ? t('timer.paused') : undefined}
      ariaLabel={t('timer.controls')}
      testId="timer-controls"
    >
      {paused ? (
        <WallControlButton primary icon={<Play {...fill} />} label={t('timer.resume')} onPress={onResume} testId="timer-resume" />
      ) : (
        <WallControlButton icon={<Pause {...fill} />} label={t('timer.pause')} onPress={onPause} testId="timer-pause" />
      )}
      <WallControlButton icon={<AlarmClockPlus strokeWidth={2.2} />} label={t('timer.addMinute')} onPress={onAddMinute} testId="timer-add-minute" />
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
