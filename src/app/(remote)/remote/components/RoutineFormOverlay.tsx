'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { uuid } from '@/lib/uuid';
import { MAX_STEP_SEC, MIN_STEP_SEC } from '@/lib/timer-logic';
import type { Routine, RoutineStep, TimerView } from '@/types/timers';
import FormOverlay from './FormOverlay';
import { useFormDirty } from '@/hooks/useFormDirty';
import { TIMER_VIEW_LABEL_KEYS, timerChipClass } from './TimersTab';

const ROUTINE_EMOJI = ['🚀', '🌞', '🌙', '🪥', '👕', '🛏️', '🎒', '📚', '🧹', '🍽️', '🛁', '🧸', '⚽', '🎨', '🐶', '⏱️'];

const STEP_EMOJI = [
  '👕', '🪥', '🛏️', '🎒', '📚', '🧹', '🍽️', '🥣',
  '🛁', '🚿', '🧦', '👟', '🦷', '🧼', '🐶', '⚽',
  '🎨', '🧸', '💤', '🚗', '✏️', '🎹', '📖', '⏱️',
];

// uuid() rather than crypto.randomUUID(): /remote is served over plain HTTP
// on the LAN, where randomUUID is unavailable (see lib/uuid.ts).
function newStep(): RoutineStep {
  return { id: uuid(), label: '', icon: '⏱️', durationSec: 300 };
}

/**
 * Duration entry is two labeled fields (min / sec) — seconds are the stored
 * unit, so the pair round-trips exactly and short steps ("30 seconds of
 * tidying") don't need decimal-minute tricks. Empty fields count as 0 so
 * clearing one to type never fights the keyboard.
 */
function stepSecondsFrom(minText: string, secText: string): number | null {
  const minutes = minText === '' ? 0 : Number(minText);
  const seconds = secText === '' ? 0 : Number(secText);
  if (!Number.isInteger(minutes) || !Number.isInteger(seconds)) return null;
  if (minutes < 0 || minutes > 240 || seconds < 0 || seconds > 59) return null;
  const total = minutes * 60 + seconds;
  if (total < MIN_STEP_SEC || total > MAX_STEP_SEC) return null;
  return total;
}

/**
 * Create/edit one routine. Steps are the heart of it: each has an emoji
 * (picked from a tap-to-open grid — no free-text field to strand users in),
 * a name, a min/sec length, and an optional "wait for a Done tap" hold.
 */
export default function RoutineFormOverlay({
  routine,
  onClose,
  onSave,
  onDelete,
}: {
  routine: Routine | null;
  onClose: () => void;
  onSave: (routine: Routine) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
}) {
  const t = useTranslate('remote');
  const [name, setName] = useState(routine?.name ?? '');
  const [icon, setIcon] = useState(routine?.icon ?? '🚀');
  const [view, setView] = useState<TimerView>(routine?.view ?? 'ring');
  const [sound, setSound] = useState(routine?.sound ?? true);
  const [steps, setSteps] = useState<Array<RoutineStep & { minutesText: string; secondsText: string }>>(
    (routine?.steps ?? [newStep()]).map((s) => ({
      ...s,
      minutesText: String(Math.floor(s.durationSec / 60)),
      secondsText: String(s.durationSec % 60),
    })),
  );
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Step id whose emoji grid is open. */
  const [pickingIconFor, setPickingIconFor] = useState<string | null>(null);
  const dirty = useFormDirty([name, icon, view, sound, steps]);

  const updateStep = (
    id: string,
    patch: Partial<RoutineStep & { minutesText: string; secondsText: string }>,
  ) => setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const moveStep = (index: number, delta: number) =>
    setSteps((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const valid =
    name.trim().length > 0 &&
    steps.length > 0 &&
    steps.every(
      (s) => s.label.trim().length > 0 && stepSecondsFrom(s.minutesText, s.secondsText) !== null,
    );

  const handleSave = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const ok = await onSave({
      id: routine?.id ?? uuid(),
      name: name.trim(),
      icon,
      view,
      sound,
      steps: steps.map(({ minutesText, secondsText, ...s }) => ({
        ...s,
        label: s.label.trim(),
        icon: s.icon || '⏱️',
        durationSec: stepSecondsFrom(minutesText, secondsText)!,
      })),
    });
    if (!ok) setSaving(false);
  };

  return (
    <FormOverlay
      title={routine ? t('timers.editRoutine') : t('timers.newRoutine')}
      dirty={dirty}
      onBack={onClose}
      footer={
        <div className="flex gap-2">
          {onDelete && (
            <button
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                void onDelete();
              }}
              className={`min-h-[48px] px-4 rounded-xl text-[14px] font-bold active:scale-[0.97] ${
                confirmDelete ? 'bg-red-500 text-white' : 'bg-red-500/10 text-red-400'
              }`}
            >
              {confirmDelete ? t('timers.reallyDelete') : t('timers.deleteRoutine')}
            </button>
          )}
          <button
            onClick={() => void handleSave()}
            disabled={!valid || saving}
            className="flex-1 min-h-[48px] rounded-xl bg-hs-accent text-white text-[15px] font-bold active:scale-[0.97] disabled:opacity-40"
          >
            {t('timers.save')}
          </button>
        </div>
      }
    >
      <div className="px-5 pb-6 flex flex-col gap-5">
        <label className="block">
          <span className="text-[13px] font-semibold text-hs-text-faint">{t('timers.routineName')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder={t('timers.routineNamePlaceholder')}
            className="mt-1.5 w-full min-h-[46px] px-3 rounded-xl bg-hs-hover text-hs-text-primary text-[15px] placeholder:text-hs-text-faint outline-none focus:ring-2 focus:ring-hs-accent"
          />
        </label>

        <div>
          <span className="text-[13px] font-semibold text-hs-text-faint">{t('timers.routineIcon')}</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ROUTINE_EMOJI.map((emoji) => (
              <button
                key={emoji}
                onClick={() => setIcon(emoji)}
                aria-pressed={icon === emoji}
                className={`w-11 h-11 rounded-xl text-[22px] flex items-center justify-center border ${
                  icon === emoji ? 'bg-hs-accent/15 border-hs-accent' : 'bg-hs-hover border-transparent'
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="text-[13px] font-semibold text-hs-text-faint">{t('timers.viewLabel')}</span>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {(Object.keys(TIMER_VIEW_LABEL_KEYS) as TimerView[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`min-h-[44px] rounded-xl text-[13px] font-semibold border ${
                  view === v
                    ? 'bg-hs-accent/15 border-hs-accent text-hs-accent'
                    : 'bg-hs-hover border-transparent text-hs-text-primary'
                }`}
              >
                {t(TIMER_VIEW_LABEL_KEYS[v])}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="text-[13px] font-semibold text-hs-text-faint">{t('timers.sound')}</span>
          <div className="mt-1.5">
            <button
              onClick={() => setSound((v) => !v)}
              aria-pressed={sound}
              className={`px-3 min-h-[38px] rounded-full text-[13px] font-semibold border ${
                sound
                  ? 'bg-hs-accent/15 border-hs-accent text-hs-accent'
                  : 'bg-transparent border-hs-border-strong text-hs-text-faint'
              }`}
            >
              {sound ? t('timers.soundOn') : t('timers.soundOff')}
            </button>
          </div>
        </div>

        <div>
          <span className="text-[13px] font-semibold text-hs-text-faint">{t('timers.steps')}</span>
          <div className="mt-1.5 flex flex-col gap-3">
            {steps.map((step, index) => (
              <div key={step.id} className="p-3 bg-hs-card border border-hs-border-strong rounded-[14px]">
                <div className="flex gap-2">
                  <button
                    onClick={() => setPickingIconFor((cur) => (cur === step.id ? null : step.id))}
                    aria-label={t('timers.stepIcon')}
                    aria-expanded={pickingIconFor === step.id}
                    className={`w-14 min-h-[44px] shrink-0 rounded-xl text-[22px] flex items-center justify-center border ${
                      pickingIconFor === step.id
                        ? 'bg-hs-accent/15 border-hs-accent'
                        : 'bg-hs-hover border-transparent'
                    }`}
                  >
                    {step.icon || '⏱️'}
                  </button>
                  <input
                    value={step.label}
                    onChange={(e) => updateStep(step.id, { label: e.target.value })}
                    maxLength={60}
                    placeholder={t('timers.stepNamePlaceholder')}
                    className="flex-1 min-w-0 min-h-[44px] px-3 rounded-xl bg-hs-hover text-hs-text-primary text-[14px] placeholder:text-hs-text-faint outline-none focus:ring-2 focus:ring-hs-accent"
                  />
                </div>

                {pickingIconFor === step.id && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(STEP_EMOJI.includes(step.icon) ? STEP_EMOJI : [step.icon, ...STEP_EMOJI]).map(
                      (emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            updateStep(step.id, { icon: emoji });
                            setPickingIconFor(null);
                          }}
                          aria-pressed={step.icon === emoji}
                          className={`w-11 h-11 rounded-xl text-[22px] flex items-center justify-center border ${
                            step.icon === emoji
                              ? 'bg-hs-accent/15 border-hs-accent'
                              : 'bg-hs-hover border-transparent'
                          }`}
                        >
                          {emoji}
                        </button>
                      ),
                    )}
                  </div>
                )}

                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={240}
                      value={step.minutesText}
                      onChange={(e) => updateStep(step.id, { minutesText: e.target.value })}
                      aria-label={t('timers.stepMinutes')}
                      className="w-16 min-h-[44px] px-2 text-center rounded-xl bg-hs-hover text-hs-text-primary text-[14px] outline-none focus:ring-2 focus:ring-hs-accent"
                    />
                    <span className="text-[12px] font-semibold text-hs-text-faint">{t('timers.minUnit')}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={59}
                      value={step.secondsText}
                      onChange={(e) => updateStep(step.id, { secondsText: e.target.value })}
                      aria-label={t('timers.stepSeconds')}
                      className="w-16 min-h-[44px] px-2 text-center rounded-xl bg-hs-hover text-hs-text-primary text-[14px] outline-none focus:ring-2 focus:ring-hs-accent"
                    />
                    <span className="text-[12px] font-semibold text-hs-text-faint">{t('timers.secUnit')}</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => moveStep(index, -1)}
                      disabled={index === 0}
                      aria-label={t('timers.moveUp')}
                      className="w-9 h-9 rounded-lg bg-hs-hover text-hs-text-faint flex items-center justify-center disabled:opacity-30"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveStep(index, 1)}
                      disabled={index === steps.length - 1}
                      aria-label={t('timers.moveDown')}
                      className="w-9 h-9 rounded-lg bg-hs-hover text-hs-text-faint flex items-center justify-center disabled:opacity-30"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setSteps((prev) => prev.filter((s) => s.id !== step.id))}
                      disabled={steps.length === 1}
                      aria-label={t('timers.removeStep')}
                      className="w-9 h-9 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-2">
                  <button
                    onClick={() => updateStep(step.id, { waitForTap: !step.waitForTap })}
                    aria-pressed={!!step.waitForTap}
                    className={timerChipClass(!!step.waitForTap)}
                  >
                    {t('timers.waitForTap')}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() =>
              setSteps((prev) =>
                prev.length >= 20
                  ? prev
                  : [...prev, { ...newStep(), minutesText: '5', secondsText: '0' }],
              )
            }
            className="mt-3 w-full min-h-[44px] rounded-xl border border-dashed border-hs-border-strong text-hs-text-faint text-[13px] font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" /> {t('timers.addStep')}
          </button>
        </div>
      </div>
    </FormOverlay>
  );
}
