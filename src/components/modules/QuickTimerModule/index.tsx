'use client';

/** A minute, the unit the add and subtract buttons work in. */
const MINUTE_MS = 60_000;

import { useCallback } from 'react';
import { Minus, Pause, Play, Plus, Square } from 'lucide-react';
import type { ModuleStyle, QuickTimerConfig } from '@/types/config';
import type { TimerTargets, TimerView } from '@/types/timers';
import { useTranslate } from '@/i18n';
import { useDisplayId } from '@/hooks/useDisplayId';
import { useElementBox } from '@/hooks/useElementBox';
import { useTimerSession } from '@/hooks/useTimerSession';
import { WallButton } from '../shared/WallButton';
import { useModuleSurface } from '@/components/modules/module-surface';
import ModuleWrapper from '@/components/modules/ModuleWrapper';
import { resolveTextScale } from '@/lib/module-style';
import { sessionProgress } from '@/lib/timer-logic';
import { postTimerControl, startQuickTimer, type TimerControlAction } from '@/lib/timer-control';
import { formatQuickName, formatRemaining } from '@/components/display/timer-views/shared';
import { HoldConfirmButton } from '@/components/modules/shared/HoldConfirmButton';
import { quickTimerMetrics } from './metrics';

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
 * Nothing running: the preset lengths, one tap each. Something running: the
 * countdown and the controls for it. The two states are exclusive on purpose
 * — while a timer is going there is nothing here to tap but Stop, so a hand
 * at kid height cannot replace a bedtime routine with a five minute timer,
 * which is the case the phone holds behind a confirm sheet.
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

  const { live, now, refresh } = useTimerSession((s) => s.status === 'running');
  const running = live && live.status === 'running' ? live : null;
  const { step, remainingMs, fraction, paused } = sessionProgress(live, now);

  // Measured inside the card, so the box is what the card's padding left.
  const [boxRef, box] = useElementBox('content');
  const m = quickTimerMetrics({
    w: box.width,
    h: box.height,
    presets: presets.length,
    running: !!running,
    textScale: resolveTextScale(style),
  });

  const act = useCallback((action: TimerControlAction) => {
    if (surface !== 'display') return;
    void (async () => {
      await postTimerControl(action);
      void refresh();
    })();
  }, [surface, refresh]);

  const start = (minutes: number) => {
    if (surface !== 'display') return;
    void (async () => {
      await startQuickTimer({ durationSec: Math.round(minutes * 60), view, sound, targets, fullScreen });
      void refresh();
    })();
  };

  const heading = m.head > 0 && !style.title?.trim() && (
    <div
      style={{
        fontSize: m.head,
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
    const canSubtract = !running.awaitingTap && remainingMs > MINUTE_MS;
    const label = [
      running.name ?? formatQuickName(running.steps[0].durationSec, tCore, 'timer'),
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
        <div style={{ display: 'flex', gap: m.gap, flexShrink: 0 }}>
          {running.awaitingTap ? (
            <WallButton
              data-testid="quick-timer-done"
              onClick={() => act('step-done')}
              style={{ ...ctrl, flex: 2, background: '#34d399', color: '#06281c' }}
            >
              {tCore('timer.done')}
            </WallButton>
          ) : (
            <>
              <WallButton
                data-testid="quick-timer-pause"
                onClick={() => act(paused ? 'resume' : 'pause')}
                style={{ ...ctrl, flex: 1 }}
              >
                {paused ? <Play style={icon} /> : <Pause style={icon} />}
                {tCore(paused ? 'timer.resume' : 'timer.pause')}
              </WallButton>
              <WallButton
                data-testid="quick-timer-subtract"
                aria-label={tCore('timer.subtractMinuteSpoken')}
                disabled={!canSubtract}
                onClick={() => canSubtract && act('subtract-minute')}
                style={{ ...ctrl, flex: 1, opacity: canSubtract ? 1 : 0.35, cursor: canSubtract ? 'pointer' : 'default' }}
              >
                <Minus style={icon} />
                {tCore('timer.oneMinute')}
              </WallButton>
              <WallButton
                data-testid="quick-timer-add"
                aria-label={tCore('timer.addMinuteSpoken')}
                onClick={() => act('add-minute')}
                style={{ ...ctrl, flex: 1 }}
              >
                <Plus style={icon} />
                {tCore('timer.oneMinute')}
              </WallButton>
            </>
          )}
          <HoldConfirmButton
            onConfirm={() => act('cancel')}
            ariaLabel={tCore('timer.stop')}
            hint={tCore('timer.holdToStop')}
            hintFontSize={Math.max(9, m.ctrl * 0.85)}
            style={{ ...ctrl, flex: 1, background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
          >
            <span data-testid="quick-timer-stop" style={{ display: 'flex', alignItems: 'center', gap: m.ctrl * 0.35 }}>
              <Square style={icon} />
              {tCore('timer.stop')}
            </span>
          </HoldConfirmButton>
          </div>
        </div>
      </ModuleWrapper>
    );
  }

  return (
    <ModuleWrapper style={style}>
      <div
        ref={boxRef}
        data-testid="quick-timer"
        data-state="idle"
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
            aria-label={t('quick-timer.startAriaLabel', { minutes })}
            onClick={() => start(minutes)}
            style={{ ...buttonBase, flexDirection: 'column', lineHeight: 1, minWidth: 0 }}
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
      </div>
    </ModuleWrapper>
  );
}
