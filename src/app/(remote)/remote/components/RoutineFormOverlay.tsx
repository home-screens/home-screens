'use client';

import { useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { uuid } from '@/lib/uuid';
import { withAlpha } from '@/lib/hex-color';
import { DEFAULT_TIMER_SOUND, MAX_STEP_SEC, MAX_STEPS, MIN_STEP_SEC, secondsFromFields } from '@/lib/timer-logic';
import type { Routine, RoutineStep, TimerView } from '@/types/timers';
import FormOverlay from './FormOverlay';
import SaveDeleteFooter from './SaveDeleteFooter';
import ConfirmSheet from './ConfirmSheet';
import { useFormDirty } from '@/hooks/useFormDirty';
import { TIMER_VIEW_LABEL_KEYS } from './TimersTab';
import TimerViewThumb from './TimerViewThumb';
import Glyph from '@/components/ui/Glyph';
import PhoneIconPicker, { PhoneIconChoicesPanel } from '@/components/custom-icons/PhoneIconPicker';
import { FIELD, FIELD_LABEL, HELPER_TEXT, REMOTE_ACCENT, REMOTE_ACCENT_INK, toggleChipStyle } from './remote-styles';
import { buildDeleteConfirm, sheetQuestion } from '@/lib/delete-confirmations';

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

/** A step's two boxes (min / sec) as seconds: short steps ("30 seconds of tidying") need no decimal minutes. */
const stepSecondsFrom = (minText: string, secText: string) => secondsFromFields(minText, secText, { min: MIN_STEP_SEC, max: MAX_STEP_SEC });

/** A square 44 px button on a step: move it, or take it out. */
const STEP_BUTTON: CSSProperties = {
  width: 44,
  height: 44,
  flexShrink: 0,
  borderRadius: 10,
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--hs-bg-hover)',
  color: 'var(--hs-text-muted)',
  cursor: 'pointer',
};

const NUMBER_FIELD: CSSProperties = { ...FIELD, width: 72, padding: '0 8px', textAlign: 'center', fontSize: 15 };
const UNIT: CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--hs-text-faint)' };

/**
 * Create/edit one routine. Steps are the heart of it: each has an emoji
 * (picked from a tap-to-open grid, never a free-text field to strand users
 * in), a name, a min/sec length, and an optional "wait for a Done tap" hold.
 * Built like the chore form: the same fields, labels and footer.
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
  const tCore = useTranslate('core');
  const [name, setName] = useState(routine?.name ?? '');
  const [icon, setIcon] = useState(routine?.icon ?? '🚀');
  const [view, setView] = useState<TimerView>(routine?.view ?? 'ring');
  const [sound, setSound] = useState(routine?.sound ?? DEFAULT_TIMER_SOUND);
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

  // Why Save is off, in the order someone filling the form in would meet it.
  // A greyed-out button with no word about it reads as a broken button.
  const whyNoSave = valid
    ? null
    : name.trim().length === 0
      ? t('timers.whyNoSave.name')
      : steps.some((s) => s.label.trim().length === 0)
        ? t('timers.whyNoSave.stepName')
        : t('timers.whyNoSave.stepLength', { seconds: MIN_STEP_SEC });
  const atStepLimit = steps.length >= MAX_STEPS;

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
    <>
      <FormOverlay
        title={routine ? t('timers.editRoutine') : t('timers.newRoutine')}
        dirty={dirty}
        onBack={onClose}
        footer={
          <SaveDeleteFooter
            canSave={valid}
            busy={saving}
            onSave={() => void handleSave()}
            notice={whyNoSave}
            deleteLabel={onDelete ? t('timers.deleteRoutine') : undefined}
            onDelete={() => setConfirmDelete(true)}
          />
        }
      >
        <div style={{ marginBottom: 24 }}>
          <label htmlFor="routine-name" style={FIELD_LABEL}>{t('timers.routineName')}</label>
          <input
            id="routine-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder={t('timers.routineNamePlaceholder')}
            style={FIELD}
          />
        </div>

        <PhoneIconPicker
          value={icon}
          onChange={setIcon}
          choices={{ kind: 'emoji', emoji: ROUTINE_EMOJI }}
          label={t('timers.routineIcon')}
          suggestedName={name}
        />

        <div style={{ marginBottom: 24 }}>
          <div style={FIELD_LABEL}>{t('timers.viewLabel')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(Object.keys(TIMER_VIEW_LABEL_KEYS) as TimerView[]).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className="press-scale" style={{ ...toggleChipStyle(view === v), borderRadius: 12 }}>
                <TimerViewThumb view={v} />
                {t(TIMER_VIEW_LABEL_KEYS[v])}
              </button>
            ))}
          </div>
          {/* Named "Sound", on or off by its look, as on the Timers tab. */}
          <button type="button" onClick={() => setSound((v) => !v)} aria-pressed={sound} className="press-scale" style={{ ...toggleChipStyle(sound), marginTop: 10 }}>
            {t('timers.sound')}
          </button>
        </div>

        <div>
          <div style={FIELD_LABEL}>{t('timers.steps')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {steps.map((step, index) => (
              <div key={step.id} style={{ padding: 12, background: 'var(--hs-bg-card)', border: '1px solid var(--hs-border)', borderRadius: 14 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setPickingIconFor((cur) => (cur === step.id ? null : step.id))}
                    aria-label={t('timers.stepIcon')}
                    aria-expanded={pickingIconFor === step.id}
                    style={{
                      ...STEP_BUTTON,
                      width: 56,
                      fontSize: 22,
                      border: `1px solid ${pickingIconFor === step.id ? REMOTE_ACCENT_INK : 'transparent'}`,
                      background: pickingIconFor === step.id ? withAlpha(REMOTE_ACCENT, 0.15) : 'var(--hs-bg-hover)',
                    }}
                  >
                    <Glyph value={step.icon || '⏱️'} fallback="⏱️" />
                  </button>
                  <input
                    value={step.label}
                    onChange={(e) => updateStep(step.id, { label: e.target.value })}
                    maxLength={60}
                    placeholder={t('timers.stepNamePlaceholder')}
                    style={{ ...FIELD, flex: 1, minWidth: 0, minHeight: 44, padding: '0 12px', fontSize: 15 }}
                  />
                  {/* Up here beside the name, where every phone has room for
                      it: in the time row it was pushed out of the card. */}
                  <button
                    type="button"
                    onClick={() => setSteps((prev) => prev.filter((s) => s.id !== step.id))}
                    disabled={steps.length === 1}
                    aria-label={t('timers.removeStep')}
                    style={{ ...STEP_BUTTON, background: withAlpha('var(--hs-danger)', 0.12), color: 'var(--hs-danger)', opacity: steps.length === 1 ? 0.3 : 1 }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {pickingIconFor === step.id && (
                  <div style={{ marginTop: 10 }}>
                    <PhoneIconChoicesPanel
                      value={step.icon}
                      choices={{ kind: 'emoji', emoji: STEP_EMOJI }}
                      suggestedName={step.label}
                      onPick={(picked) => { updateStep(step.id, { icon: picked }); setPickingIconFor(null); }}
                    />
                  </div>
                )}

                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={240}
                      value={step.minutesText}
                      onChange={(e) => updateStep(step.id, { minutesText: e.target.value })}
                      aria-label={t('timers.stepMinutes')}
                      style={NUMBER_FIELD}
                    />
                    <span style={UNIT}>{t('timers.minUnit')}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={59}
                      value={step.secondsText}
                      onChange={(e) => updateStep(step.id, { secondsText: e.target.value })}
                      aria-label={t('timers.stepSeconds')}
                      style={NUMBER_FIELD}
                    />
                    <span style={UNIT}>{t('timers.secUnit')}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => moveStep(index, -1)}
                      disabled={index === 0}
                      aria-label={t('timers.moveUp')}
                      style={{ ...STEP_BUTTON, opacity: index === 0 ? 0.3 : 1 }}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStep(index, 1)}
                      disabled={index === steps.length - 1}
                      aria-label={t('timers.moveDown')}
                      style={{ ...STEP_BUTTON, opacity: index === steps.length - 1 ? 0.3 : 1 }}
                    >
                      <ArrowDown size={16} />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => updateStep(step.id, { waitForTap: !step.waitForTap })}
                  aria-pressed={!!step.waitForTap}
                  className="press-scale"
                  style={{ ...toggleChipStyle(!!step.waitForTap), marginTop: 10 }}
                >
                  {t('timers.waitForTap')}
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setSteps((prev) =>
                prev.length >= MAX_STEPS
                  ? prev
                  : [...prev, { ...newStep(), minutesText: '5', secondsText: '0' }],
              )
            }
            disabled={atStepLimit}
            className="press-scale"
            style={{
              marginTop: 12, width: '100%', minHeight: 48, borderRadius: 12, border: '2px dashed var(--hs-border)',
              background: 'transparent', color: 'var(--hs-text-faint)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              cursor: atStepLimit ? 'default' : 'pointer', opacity: atStepLimit ? 0.4 : 1,
            }}
          >
            <Plus size={16} /> {t('timers.addStep')}
          </button>
          {atStepLimit && (
            <p role="status" style={{ ...HELPER_TEXT, textAlign: 'center' }}>
              {t('timers.stepLimit', { count: MAX_STEPS })}
            </p>
          )}
        </div>
      </FormOverlay>

      {confirmDelete && (
        <ConfirmSheet
          {...sheetQuestion(buildDeleteConfirm({ verb: 'delete', name: routine?.name ?? '', consequence: t('timers.deleteConfirm.description') }, tCore))}
          onConfirm={() => {
            setConfirmDelete(false);
            void onDelete?.();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
