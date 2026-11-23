'use client';

import { useState } from 'react';
import { Pause, Play, Plus, Pencil, SkipForward, Square, Check, Timer } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { formatQuickName, formatRemaining } from '@/components/display/timer-views/shared';
import type { Routine, TimerView } from '@/types/timers';
import { useDisplayTarget } from '../display-target';
import { useTimersData } from '../hooks/useTimersData';
import { DEFAULT_TIMER_SOUND, MIN_STEP_SEC, QUICK_TIMER_PRESETS_SEC, routineTotalSec, secondsFromFields } from '@/lib/timer-logic';
import ConfirmSheet from './ConfirmSheet';
import PrimaryButton from './PrimaryButton';
import { ACCENT_SOFT_BUTTON, toggleChipStyle } from './remote-styles';
import RoutineFormOverlay from './RoutineFormOverlay';
import TimerViewThumb from './TimerViewThumb';
import Glyph from '@/components/ui/Glyph';
import TabHeader from './TabHeader';
import { LoadFailed } from './RetryButton';
import EmptyState from './EmptyState';

const MAX_QUICK_SEC = 240 * 60;

/** How long after a start the card says "waiting" before "no display is showing this". */
const TIMER_ACK_GRACE_MS = 15_000;

export const TIMER_VIEW_LABEL_KEYS: Record<TimerView, string> = {
  ring: 'timers.viewRing',
  face: 'timers.viewFace',
  cascade: 'timers.viewCascade',
  path: 'timers.viewPath',
};

export default function TimersTab() {
  const t = useTranslate('remote');
  const tc = useTranslate('core');
  const {
    routines, routinesLoaded, routinesError, retryRoutines, live, error, setError,
    startRoutine, startQuick, control, saveRoutines, targetIds, setTargetIds,
  } = useTimersData();
  const { displays, live: liveDisplays } = useDisplayTarget();
  const [editing, setEditing] = useState<Routine | 'new' | null>(null);
  const [quickView, setQuickView] = useState<TimerView>('face');
  const [quickSound, setQuickSound] = useState(DEFAULT_TIMER_SOUND);
  const [customMinutes, setCustomMinutes] = useState('');
  const [customSeconds, setCustomSeconds] = useState('');

  const customTotalSec = secondsFromFields(customMinutes, customSeconds, { min: MIN_STEP_SEC, max: MAX_QUICK_SEC });
  // Starting while another session runs replaces it (one global session) —
  // hold the start behind a confirm so a kitchen quick timer can't silently
  // kill a running bedroom routine.
  const [pendingStart, setPendingStart] = useState<(() => void) | null>(null);

  const running = live && live.status === 'running' ? live : null;
  // A finished timer the walls still hold on "Time's up!". A wall without a
  // touchscreen holds it until the hub lets go, so the phone offers Stop for
  // as long as some wall reports it on screen.
  const finished = live && live.status === 'done'
    && liveDisplays.some((d) => d.status?.timerSessionId === live.id) ? live : null;

  const requestStart = (start: () => void) => {
    if (running) setPendingStart(() => start);
    else start();
  };

  const toggleTarget = (id: string) =>
    setTargetIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  // The session store is global: whatever is running shows here regardless of
  // the display picker, so name where it's actually showing. Multi-target
  // sessions get a count ("On 3 displays") — a joined name list would be the
  // first thing truncated out of the single-line card meta.
  const targetLabel = (() => {
    if (!running) return null;
    if (running.targets === 'all') return displays.length > 0 ? t('timers.onAllDisplays') : null;
    const ids = running.targets;
    if (ids.length > 1) return t('timers.onDisplays', { count: ids.length });
    return t('timers.onDisplay', { name: displays.find((d) => d.id === ids[0])?.name ?? ids[0] });
  })();
  // Acknowledgement, as distinct from the target above: which displays report
  // this session on screen in their heartbeat. A display that is off never
  // acks, and that is exactly what a parent standing in the hall needs to know.
  const ackLabel = (() => {
    if (!running) return null;
    const showing = liveDisplays.filter((d) => d.status?.timerSessionId === running.id);
    if (showing.length > 0) {
      return {
        tone: 'ok' as const,
        text: displays.length > 0
          ? t('timers.showingOn', { names: showing.map((d) => d.name).join(', ') })
          : t('timers.showingOnDisplay'),
      };
    }
    // Displays poll every few seconds and heartbeat on pickup; give them a
    // moment before calling it out.
    if (Date.now() - running.startedAt < TIMER_ACK_GRACE_MS) {
      return { tone: 'waiting' as const, text: t('timers.waitingForDisplay') };
    }
    return { tone: 'missing' as const, text: t('timers.notShowing') };
  })();
  const step = running ? running.steps[running.stepIndex] : null;
  const effectiveNow = running?.pausedAt ?? Date.now();
  const remainingMs = running && step && !running.awaitingTap
    ? Math.max(0, step.durationSec * 1000 - (effectiveNow - running.stepStartedAt))
    : 0;
  const runningTitle = running
    ? running.name ?? formatQuickName(running.steps[0].durationSec, t, 'timers')
    : '';
  const finishedTitle = finished
    ? finished.name ?? formatQuickName(finished.steps[0].durationSec, t, 'timers')
    : '';

  const handleCustomStart = () => {
    if (customTotalSec === null) return;
    requestStart(() => {
      void startQuick(customTotalSec, quickView, quickSound);
      setCustomMinutes('');
      setCustomSeconds('');
    });
  };

  return (
    <div>
      <TabHeader title={t('timers.title')} />

      {error && (
        <button
          onClick={() => setError(null)}
          className="mb-3 w-full text-left px-4 py-3 rounded-xl bg-hs-danger/10 border border-hs-danger/30 text-hs-danger text-[13px]"
        >
          {error}
        </button>
      )}

      {running && step && (
        <section className="mb-4 p-4 bg-hs-card border border-hs-border-strong rounded-[14px]">
          <div className="flex items-center gap-3">
            <div className="text-[34px] leading-none"><Glyph value={step.icon} fallback="⏱️" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold text-hs-text-primary truncate">{runningTitle}</div>
              <div className="text-[12px] text-hs-text-faint truncate">
                {running.kind === 'routine' && (
                  <>
                    {step.label}
                    {' · '}
                    {t('timers.stepCount', { current: running.stepIndex + 1, total: running.steps.length })}
                  </>
                )}
                {running.kind === 'routine' && targetLabel && ' · '}
                {targetLabel}
              </div>
            </div>
            <div className="text-[30px] font-bold tabular-nums text-hs-text-primary">
              {running.awaitingTap ? '0:00' : formatRemaining(remainingMs)}
            </div>
          </div>

          {ackLabel && (
            <div
              data-testid="timer-ack"
              data-tone={ackLabel.tone}
              className={`mt-2 text-[12px] ${
                ackLabel.tone === 'missing' ? 'text-hs-warning-ink' : 'text-hs-text-faint'
              }`}
            >
              {ackLabel.text}
            </div>
          )}

          <div className="mt-3 h-2 rounded-full bg-hs-hover overflow-hidden">
            <div
              className="h-full rounded-full bg-hs-accent transition-[width] duration-1000 ease-linear"
              style={{
                width: `${Math.min(100, Math.max(0, (remainingMs / (step.durationSec * 1000)) * 100))}%`,
              }}
            />
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            {running.awaitingTap ? (
              <button
                onClick={() => void control('step-done')}
                className="col-span-2 min-h-[44px] rounded-xl bg-emerald-500 text-white text-[14px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.97]"
              >
                <Check className="w-4 h-4" /> {t('timers.done')}
              </button>
            ) : (
              <button
                onClick={() => void control(running.pausedAt !== undefined ? 'resume' : 'pause')}
                className="min-h-[44px] rounded-xl bg-hs-hover text-hs-text-primary text-[13px] font-semibold flex items-center justify-center gap-1.5 active:scale-[0.97]"
              >
                {running.pausedAt !== undefined ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                {running.pausedAt !== undefined ? t('timers.resume') : t('timers.pause')}
              </button>
            )}
            <button
              onClick={() => void control('add-minute')}
              className="min-h-[44px] rounded-xl bg-hs-hover text-hs-text-primary text-[13px] font-semibold flex items-center justify-center active:scale-[0.97]"
            >
              {t('timers.addMinute')}
            </button>
            {running.kind === 'routine' && !running.awaitingTap && (
              <button
                onClick={() => void control('skip')}
                className="min-h-[44px] rounded-xl bg-hs-hover text-hs-text-primary text-[13px] font-semibold flex items-center justify-center gap-1.5 active:scale-[0.97]"
              >
                <SkipForward className="w-4 h-4" /> {t('timers.skip')}
              </button>
            )}
            <button
              onClick={() => void control('cancel')}
              className="min-h-[44px] rounded-xl bg-hs-danger/10 text-hs-danger text-[13px] font-semibold flex items-center justify-center gap-1.5 active:scale-[0.97]"
            >
              <Square className="w-4 h-4" /> {t('timers.stop')}
            </button>
          </div>
        </section>
      )}

      {finished && (
        <section data-testid="timer-times-up" className="mb-4 p-4 bg-hs-card border border-hs-border-strong rounded-[14px]">
          <div className="flex items-center gap-3">
            <div className="text-[34px] leading-none"><Glyph value={finished.icon ?? finished.steps[finished.steps.length - 1]?.icon} fallback="⏱️" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold text-hs-text-primary truncate">{finishedTitle}</div>
              {/* The wall's own words for it: a routine is all done, a quick timer's time is up. */}
              <div className="text-[12px] text-hs-text-faint truncate">{tc(finished.kind === 'routine' ? 'timer.allDone' : 'timer.timesUp')}</div>
            </div>
          </div>
          <button
            onClick={() => void control('cancel')}
            className="mt-4 w-full min-h-[44px] rounded-xl bg-hs-danger/10 text-hs-danger text-[13px] font-semibold flex items-center justify-center gap-1.5 active:scale-[0.97]"
          >
            <Square className="w-4 h-4" /> {t('timers.stop')}
          </button>
        </section>
      )}

      {displays.length > 0 && (
        <section
          data-testid="timer-target-picker"
          className="mb-4 flex items-center gap-1.5 flex-wrap"
        >
          <span className="text-[12px] font-semibold text-hs-text-faint mr-0.5">
            {/* Chips only scope the NEXT start — they can't move a running
                session — so say that while one is running. */}
            {t(running ? 'timers.showOnNext' : 'timers.showOn')}
          </span>
          <button
            onClick={() => setTargetIds([])}
            aria-pressed={targetIds.length === 0}
            className="press-scale-sm"
            style={toggleChipStyle(targetIds.length === 0)}
          >
            {t('timers.allDisplays')}
          </button>
          {displays.map((d) => (
            <button
              key={d.id}
              onClick={() => toggleTarget(d.id)}
              aria-pressed={targetIds.includes(d.id)}
              className="press-scale-sm"
              style={toggleChipStyle(targetIds.includes(d.id))}
            >
              {d.name}
            </button>
          ))}
        </section>
      )}

      <section className="p-4 bg-hs-card border border-hs-border-strong rounded-[14px]">
        <h2 className="text-[15px] font-bold text-hs-text-primary">{t('timers.quickTimer')}</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {QUICK_TIMER_PRESETS_SEC.map((sec) => (
            <button
              key={sec}
              onClick={() => requestStart(() => void startQuick(sec, quickView, quickSound))}
              className="min-h-[52px] rounded-xl bg-hs-hover text-hs-text-primary text-[15px] font-bold active:scale-[0.97]"
            >
              {sec < 60
                ? t('timers.secondsShort', { seconds: sec })
                : t('timers.minutesShort', { minutes: sec / 60 })}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={240}
            value={customMinutes}
            onChange={(e) => setCustomMinutes(e.target.value)}
            aria-label={t('timers.stepMinutes')}
            className="w-20 min-h-[44px] px-2 text-center rounded-xl bg-hs-hover text-hs-text-primary text-[14px] outline-none focus:ring-2 focus:ring-hs-accent"
          />
          <span className="text-[12px] font-semibold text-hs-text-faint">{t('timers.minUnit')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            value={customSeconds}
            onChange={(e) => setCustomSeconds(e.target.value)}
            aria-label={t('timers.stepSeconds')}
            className="w-20 min-h-[44px] px-2 text-center rounded-xl bg-hs-hover text-hs-text-primary text-[14px] outline-none focus:ring-2 focus:ring-hs-accent"
          />
          <span className="text-[12px] font-semibold text-hs-text-faint">{t('timers.secUnit')}</span>
          <PrimaryButton
            compact
            onClick={handleCustomStart}
            disabled={customTotalSec === null || (customMinutes === '' && customSeconds === '')}
            style={{ flex: 1, padding: '0 20px' }}
          >
            {t('timers.start')}
          </PrimaryButton>
        </div>
        {/* Something is typed and Start is off: say why, as the routine form does. */}
        {customTotalSec === null && (customMinutes !== '' || customSeconds !== '') && (
          <p role="status" data-testid="quick-why-no-start" className="mt-2 text-[12.5px] text-hs-text-muted">
            {t('timers.quickTooShort', { seconds: 5 })}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex gap-1.5 flex-wrap">
            {(Object.keys(TIMER_VIEW_LABEL_KEYS) as TimerView[]).map((view) => (
              <button
                key={view}
                onClick={() => setQuickView(view)}
                aria-pressed={quickView === view}
                className="press-scale-sm"
                style={{ ...toggleChipStyle(quickView === view), gap: 6 }}
              >
                <TimerViewThumb view={view} />
                {t(TIMER_VIEW_LABEL_KEYS[view])}
              </button>
            ))}
          </div>
          <button
            onClick={() => setQuickSound((v) => !v)}
            aria-pressed={quickSound}
            className="press-scale-sm"
            style={{ ...toggleChipStyle(quickSound), flexShrink: 0 }}
          >
            {t('timers.sound')}
          </button>
        </div>
      </section>

      <section className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-hs-text-primary">{t('timers.routines')}</h2>
          {routinesLoaded && (
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="press-scale-sm min-h-[44px] px-3 rounded-xl text-[13px] flex items-center gap-1"
              style={ACCENT_SOFT_BUTTON}
            >
              <Plus className="w-4 h-4" /> {t('timers.newRoutine')}
            </button>
          )}
        </div>

        {routinesError && <LoadFailed message={tc('timer.routinesLoadError')} onRetry={retryRoutines} />}

        {routinesLoaded && routines.length === 0 && (
          <EmptyState icon={Timer} title={t('timers.emptyTitle')} body={t('timers.emptyHint')} testId="timers-no-routines" style={{ padding: '24px 16px 8px' }} />
        )}

        <div className="mt-3 flex flex-col gap-2.5">
          {routines.map((routine) => {
            const totalMin = Math.round(routineTotalSec(routine) / 60);
            return (
              <div
                key={routine.id}
                className="p-4 bg-hs-card border border-hs-border-strong rounded-[14px] flex items-center gap-3"
              >
                <div className="text-[30px] leading-none"><Glyph value={routine.icon ?? '⏱️'} fallback="⏱️" /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold text-hs-text-primary truncate">{routine.name}</div>
                  <div className="text-[12px] text-hs-text-faint">
                    {tc('timer.routineMeta', { count: routine.steps.length, steps: routine.steps.length, minutes: totalMin })}
                    {' · '}
                    {t(TIMER_VIEW_LABEL_KEYS[routine.view])}
                  </div>
                </div>
                <button
                  onClick={() => setEditing(routine)}
                  aria-label={t('timers.editRoutine')}
                  className="w-11 h-11 rounded-xl bg-hs-hover text-hs-text-faint flex items-center justify-center active:scale-[0.97]"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <PrimaryButton
                  compact
                  onClick={() => requestStart(() => void startRoutine(routine.id))}
                  style={{ padding: '0 16px', gap: 6 }}
                >
                  <Play className="w-4 h-4" /> {t('timers.start')}
                </PrimaryButton>
              </div>
            );
          })}
        </div>
      </section>

      {pendingStart && (
        <ConfirmSheet
          title={tc('timer.replaceTitle')}
          description={tc('timer.replaceBody')}
          confirmLabel={t('timers.start')}
          onConfirm={() => {
            pendingStart();
            setPendingStart(null);
          }}
          onCancel={() => setPendingStart(null)}
        />
      )}

      {editing && (
        <RoutineFormOverlay
          routine={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          saveError={error}
          onSave={async (next) => {
            // In place when it is still in the list, else at the end: a new
            // routine, or one another phone deleted while it was being edited.
            const ok = await saveRoutines((list) => (list.some((r) => r.id === next.id)
              ? list.map((r) => (r.id === next.id ? next : r))
              : [...list, next]));
            if (ok) setEditing(null);
            return ok;
          }}
          onDelete={
            editing === 'new'
              ? undefined
              : async () => {
                  const ok = await saveRoutines((list) => list.filter((r) => r.id !== editing.id));
                  if (ok) setEditing(null);
                  return ok;
                }
          }
        />
      )}
    </div>
  );
}
