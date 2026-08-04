'use client';

import { useState } from 'react';
import { Pause, Play, Plus, Pencil, SkipForward, Square, Check } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { formatQuickName, formatRemaining } from '@/components/display/timer-views/shared';
import type { Routine, TimerView } from '@/types/timers';
import { useDisplayTarget } from '../display-target';
import { useTimersData } from '../hooks/useTimersData';
import ConfirmSheet from './ConfirmSheet';
import RoutineFormOverlay from './RoutineFormOverlay';

/** Preset quick-timer lengths in seconds — short bursts matter to kids. */
const QUICK_PRESETS_SEC = [30, 60, 120, 300, 600, 900];

const MAX_QUICK_SEC = 240 * 60;

export const TIMER_VIEW_LABEL_KEYS: Record<TimerView, string> = {
  ring: 'timers.viewRing',
  face: 'timers.viewFace',
  cascade: 'timers.viewCascade',
  path: 'timers.viewPath',
};

export default function TimersTab() {
  const t = useTranslate('remote');
  const {
    routines, routinesLoaded, routinesError, retryRoutines, live, error, setError,
    startRoutine, startQuick, control, saveRoutines,
  } = useTimersData();
  const { displays } = useDisplayTarget();
  const [editing, setEditing] = useState<Routine | 'new' | null>(null);
  const [quickView, setQuickView] = useState<TimerView>('face');
  const [quickSound, setQuickSound] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');
  const [customSeconds, setCustomSeconds] = useState('');

  // Empty fields count as 0, mirroring the routine step editor.
  const customTotalSec = (() => {
    const minutes = customMinutes === '' ? 0 : Number(customMinutes);
    const seconds = customSeconds === '' ? 0 : Number(customSeconds);
    if (!Number.isInteger(minutes) || !Number.isInteger(seconds)) return null;
    if (minutes < 0 || minutes > 240 || seconds < 0 || seconds > 59) return null;
    const total = minutes * 60 + seconds;
    return total >= 5 && total <= MAX_QUICK_SEC ? total : null;
  })();
  // Starting while another session runs replaces it (one global session) —
  // hold the start behind a confirm so a kitchen quick timer can't silently
  // kill a running bedroom routine.
  const [pendingStart, setPendingStart] = useState<(() => void) | null>(null);

  const running = live && live.status === 'running' ? live : null;

  const requestStart = (start: () => void) => {
    if (running) setPendingStart(() => start);
    else start();
  };

  // The session store is global: whatever is running shows here regardless of
  // the display picker, so name where it's actually showing.
  const targetLabel = running
    ? running.targets === 'all'
      ? displays.length > 0
        ? t('timers.onAllDisplays')
        : null
      : t('timers.onDisplay', {
          name:
            displays.find((d) => d.id === (running.targets as string[])[0])?.name ??
            (running.targets as string[])[0],
        })
    : null;
  const step = running ? running.steps[running.stepIndex] : null;
  const effectiveNow = running?.pausedAt ?? Date.now();
  const remainingMs = running && step && !running.awaitingTap
    ? Math.max(0, step.durationSec * 1000 - (effectiveNow - running.stepStartedAt))
    : 0;
  const runningTitle = running
    ? running.name ?? formatQuickName(running.steps[0].durationSec, t, 'timers')
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
    <div className="pb-32">
      <header className="px-5 pt-6 pb-2 flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-hs-text-primary">{t('timers.title')}</h1>
      </header>

      {error && (
        <button
          onClick={() => setError(null)}
          className="mx-5 mb-3 w-[calc(100%-2.5rem)] text-left px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-[13px]"
        >
          {error}
        </button>
      )}

      {running && step && (
        <section className="mx-5 mb-4 p-4 bg-hs-card border border-hs-border-strong rounded-[14px]">
          <div className="flex items-center gap-3">
            <div className="text-[34px] leading-none">{step.icon}</div>
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
              className="min-h-[44px] rounded-xl bg-red-500/10 text-red-400 text-[13px] font-semibold flex items-center justify-center gap-1.5 active:scale-[0.97]"
            >
              <Square className="w-4 h-4" /> {t('timers.stop')}
            </button>
          </div>
        </section>
      )}

      <section className="mx-5 p-4 bg-hs-card border border-hs-border-strong rounded-[14px]">
        <h2 className="text-[15px] font-bold text-hs-text-primary">{t('timers.quickTimer')}</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {QUICK_PRESETS_SEC.map((sec) => (
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
          <button
            onClick={handleCustomStart}
            disabled={customTotalSec === null || (customMinutes === '' && customSeconds === '')}
            className="flex-1 min-h-[44px] px-5 rounded-xl bg-hs-accent text-white text-[14px] font-bold active:scale-[0.97] disabled:opacity-40"
          >
            {t('timers.start')}
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex gap-1.5 flex-wrap">
            {(Object.keys(TIMER_VIEW_LABEL_KEYS) as TimerView[]).map((view) => (
              <button
                key={view}
                onClick={() => setQuickView(view)}
                className={`px-3 min-h-[34px] rounded-full text-[12px] font-semibold border ${
                  quickView === view
                    ? 'bg-hs-accent/15 border-hs-accent text-hs-accent'
                    : 'bg-transparent border-hs-border-strong text-hs-text-faint'
                }`}
              >
                {t(TIMER_VIEW_LABEL_KEYS[view])}
              </button>
            ))}
          </div>
          <button
            onClick={() => setQuickSound((v) => !v)}
            aria-pressed={quickSound}
            className={`px-3 min-h-[34px] rounded-full text-[12px] font-semibold border shrink-0 ${
              quickSound
                ? 'bg-hs-accent/15 border-hs-accent text-hs-accent'
                : 'bg-transparent border-hs-border-strong text-hs-text-faint'
            }`}
          >
            {t('timers.sound')}
          </button>
        </div>
      </section>

      <section className="mx-5 mt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-hs-text-primary">{t('timers.routines')}</h2>
          {routinesLoaded && (
            <button
              onClick={() => setEditing('new')}
              className="min-h-[36px] px-3 rounded-xl bg-hs-accent/15 text-hs-accent text-[13px] font-bold flex items-center gap-1 active:scale-[0.97]"
            >
              <Plus className="w-4 h-4" /> {t('timers.newRoutine')}
            </button>
          )}
        </div>

        {routinesError && (
          <div className="mt-3 p-4 rounded-[14px] bg-hs-card border border-hs-border-strong">
            <p className="text-[13px] text-hs-text-faint">{t('timers.loadError')}</p>
            <button
              onClick={() => void retryRoutines()}
              className="mt-3 min-h-[40px] px-4 rounded-xl bg-hs-hover text-hs-text-primary text-[13px] font-semibold active:scale-[0.97]"
            >
              {t('timers.retry')}
            </button>
          </div>
        )}

        {routinesLoaded && routines.length === 0 && (
          <p className="mt-3 text-[13px] text-hs-text-faint leading-relaxed">
            {t('timers.emptyHint')}
          </p>
        )}

        <div className="mt-3 flex flex-col gap-2.5">
          {routines.map((routine) => {
            const totalMin = Math.round(
              routine.steps.reduce((sum, s) => sum + s.durationSec, 0) / 60,
            );
            return (
              <div
                key={routine.id}
                className="p-4 bg-hs-card border border-hs-border-strong rounded-[14px] flex items-center gap-3"
              >
                <div className="text-[30px] leading-none">{routine.icon ?? '⏱️'}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold text-hs-text-primary truncate">{routine.name}</div>
                  <div className="text-[12px] text-hs-text-faint">
                    {t('timers.routineMeta', { steps: routine.steps.length, minutes: totalMin })}
                    {' · '}
                    {t(TIMER_VIEW_LABEL_KEYS[routine.view])}
                  </div>
                </div>
                <button
                  onClick={() => setEditing(routine)}
                  aria-label={t('timers.editRoutine')}
                  className="w-10 h-10 rounded-xl bg-hs-hover text-hs-text-faint flex items-center justify-center active:scale-[0.97]"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => requestStart(() => void startRoutine(routine.id))}
                  className="min-h-[40px] px-4 rounded-xl bg-hs-accent text-white text-[14px] font-bold flex items-center gap-1.5 active:scale-[0.97]"
                >
                  <Play className="w-4 h-4" /> {t('timers.start')}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {pendingStart && (
        <ConfirmSheet
          title={t('timers.replaceTitle')}
          description={t('timers.replaceBody')}
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
          onSave={async (next) => {
            const others = routines.filter((r) => r.id !== next.id);
            const isNew = editing === 'new';
            const ok = await saveRoutines(isNew ? [...routines, next] : [...others, next].sort(
              (a, b) => routines.findIndex((r) => r.id === a.id) - routines.findIndex((r) => r.id === b.id),
            ));
            if (ok) setEditing(null);
            return ok;
          }}
          onDelete={
            editing === 'new'
              ? undefined
              : async () => {
                  const ok = await saveRoutines(routines.filter((r) => r.id !== editing.id));
                  if (ok) setEditing(null);
                  return ok;
                }
          }
        />
      )}
    </div>
  );
}
