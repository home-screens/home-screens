'use client';

import { useState, useEffect, useRef } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
import { useCommand } from '../hooks';
import { useDisplayTarget } from '../display-target';
import { displayCommandRequest } from '@/lib/display-dispatch';
import { showToast } from '../remote-toast';
import SlideUpSheet from './SlideUpSheet';
import { ALERT_DURATION_CHOICES_MS, defaultAlertDurationMs, nearestAlertDurationChoice } from '@/lib/alert-defaults';

interface AlertSenderProps {
  open: boolean;
  onClose: () => void;
  /** Display name for the confirmation toast; null when broadcasting to all. */
  targetName: string | null;
  /** The one display of a household that never named it: sentences say "the display". */
  targetUnnamed?: boolean;
  /**
   * Alerts the target display(s) report on screen right now, or null when
   * unknown (no heartbeat yet). Drives the "Clear alerts" row: hidden count
   * when unknown, inert at zero.
   */
  activeAlerts: number | null;
  /**
   * The household's default alert length in ms for the target (0 = each type
   * its own): the length the sheet starts on. With "All" picked it is the
   * shared default, whatever a single display has set for itself.
   */
  defaultDurationMs: number;
  /** Fires after a command is sent, so the parent can speed up its status polls. */
  onSent: () => void;
}

/** How long the green "Sent!" state holds before the sheet slides away. */
const SENT_HOLD_MS = 900;

// Type and duration options are static structural data; user-visible labels
// are looked up from the `remote.alertSender.*` namespace inside the
// component so they re-render on locale change.
const ALERT_TYPES = [
  { value: 'info', labelKey: 'typeInfo', activeBg: 'bg-hs-accent/[0.15]', activeText: 'text-hs-accent-hover', activeBorder: 'border-hs-accent/30' },
  { value: 'warning', labelKey: 'typeWarning', activeBg: 'bg-hs-warning/[0.15]', activeText: 'text-hs-warning', activeBorder: 'border-hs-warning/30' },
  { value: 'urgent', labelKey: 'typeUrgent', activeBg: 'bg-hs-danger/[0.15]', activeText: 'text-hs-danger', activeBorder: 'border-hs-danger/30' },
] as const;

const DURATION_LABEL_KEYS: Record<(typeof ALERT_DURATION_CHOICES_MS)[number], string> = {
  10000: 'duration10s',
  30000: 'duration30s',
  60000: 'duration1Min',
  300000: 'duration5Min',
  0: 'durationPersistent',
};

export default function AlertSender({ open, onClose, targetName, targetUnnamed = false, activeAlerts, defaultDurationMs, onSent }: AlertSenderProps) {
  const t = useTranslate('remote');
  const [type, setType] = useState<'info' | 'warning' | 'urgent'>('info');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  // The length follows the household's default for the type (an urgent
  // alert stays up, a warning gets longer than a note) until a chip is
  // picked; from then on it is the sender's. The lit chip is always what is
  // sent, so a default the chips do not hold lights the closest one.
  const [pickedDuration, setPickedDuration] = useState<number | null>(null);
  const duration = pickedDuration ?? nearestAlertDurationChoice(defaultAlertDurationMs(type, defaultDurationMs));
  const { state, execute } = useCommand();
  const clear = useCommand();
  const { target } = useDisplayTarget();
  const holdRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(holdRef.current), []);

  // Reset form when sheet closes
  useEffect(() => {
    if (!open) {
      setType('info');
      setTitle('');
      setMessage('');
      setPickedDuration(null);
    }
  }, [open]);

  const canSend = (title.trim() || message.trim()) && state !== 'pending';

  const send = async () => {
    const res = await execute(() => {
      const { url, init } = displayCommandRequest('alert', target, {
        type,
        title: title.trim() || undefined,
        message: message.trim() || undefined,
        // Always a number, 0 included. `0` is the "stays until dismissed"
        // sentinel the alert store reads (it only starts a timer when the
        // duration is above 0); left out, the wall would apply its own
        // default, which is not always the chip the sender saw lit.
        duration,
      });
      return editorFetch(url, init);
    });
    if (res) {
      onSent();
      // Hold the sheet in its green "Sent!" state long enough to be seen —
      // closing in the same tick made a successful send look like a dismiss.
      clearTimeout(holdRef.current);
      holdRef.current = setTimeout(() => {
        setTitle('');
        setMessage('');
        onClose();
        showToast(
          targetUnnamed
            ? t('feedback.alertSentUnnamed')
            : targetName
            ? t('feedback.alertSent', { name: targetName })
            : t('feedback.alertSentAll'),
        );
      }, SENT_HOLD_MS);
    }
  };

  // A persistent alert (or a mistaken one) can be taken down from here too —
  // `clear-alerts` is the same command the editor's Alerts page dispatches.
  const canClear = clear.state !== 'pending' && activeAlerts !== 0;
  const clearAlerts = async () => {
    const res = await clear.execute(() => {
      const { url, init } = displayCommandRequest('clear-alerts', target, undefined, 'POST');
      return editorFetch(url, init);
    });
    if (res) {
      onSent();
      onClose();
      showToast(
        targetUnnamed
          ? t('feedback.alertsClearedUnnamed')
          : targetName
          ? t('feedback.alertsCleared', { name: targetName })
          : t('feedback.alertsClearedAll'),
      );
    }
  };

  return (
    <SlideUpSheet open={open} onClose={onClose} title={t('alertSender.title')} closeLabel={t('alertSender.closeAriaLabel')} maxHeight="85dvh">
      <div className="px-5 pb-6 space-y-4">
        <div className="flex gap-2">
          {ALERT_TYPES.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setType(opt.value)}
              className={`flex-1 min-h-[44px] py-2.5 rounded-xl text-[13px] font-semibold border transition-all active:scale-[0.98] ${
                type === opt.value
                  ? `${opt.activeBg} ${opt.activeText} ${opt.activeBorder}`
                  : 'bg-hs-input text-hs-text-faint border-hs-border-strong'
              }`}
            >
              {t(`alertSender.${opt.labelKey}`)}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="alert-title" className="block text-xs font-medium text-hs-text-faint mb-1.5">{t('alertSender.titleLabel')}</label>
          <input
            id="alert-title"
            type="text"
            placeholder={t('alertSender.titlePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-3 min-h-[44px] text-sm bg-hs-input border border-hs-border-strong rounded-xl text-hs-text-primary placeholder-hs-text-faint focus:outline-none focus:border-hs-accent/40 transition-colors"
          />
        </div>

        <div>
          <label htmlFor="alert-message" className="block text-xs font-medium text-hs-text-faint mb-1.5">{t('alertSender.messageLabel')}</label>
          <textarea
            id="alert-message"
            placeholder={t('alertSender.messagePlaceholder')}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            className="w-full px-4 py-3 text-sm bg-hs-input border border-hs-border-strong rounded-xl text-hs-text-primary placeholder-hs-text-faint resize-none focus:outline-none focus:border-hs-accent/40 transition-colors"
          />
        </div>

        <div>
          <span className="block text-xs font-medium text-hs-text-faint mb-1.5">{t('alertSender.durationLabel')}</span>
          {/* The chips share the row, each as wide as its word plus an even
              share of what is left; a row that scrolled sideways cut the
              last chip at the edge of the phone in the longer languages. */}
          <div className="flex flex-wrap gap-2">
            {ALERT_DURATION_CHOICES_MS.map((value) => (
              <button
                key={value}
                onClick={() => setPickedDuration(value)}
                aria-pressed={duration === value}
                className={`flex-auto whitespace-nowrap px-2 py-2 min-h-[44px] rounded-lg text-xs font-semibold transition-all active:scale-[0.98] ${
                  duration === value
                    ? 'bg-hs-active text-hs-text-primary'
                    : 'bg-hs-input text-hs-text-faint'
                }`}
              >
                {t(`alertSender.${DURATION_LABEL_KEYS[value]}`)}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={send}
          disabled={!canSend}
          className={`w-full py-3.5 min-h-[48px] rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${
            state === 'success'
              ? 'bg-hs-success text-white'
              : state === 'error'
                ? 'bg-hs-danger text-white'
                : 'bg-hs-accent active:bg-hs-accent-hover text-white'
          }`}
        >
          {state === 'pending' ? t('alertSender.sendingButton') : state === 'success' ? t('alertSender.sentButton') : state === 'error' ? t('alertSender.failedButton') : t('alertSender.sendButton')}
        </button>

        <button
          onClick={clearAlerts}
          disabled={!canClear}
          className="w-full min-h-[44px] rounded-xl text-[13px] font-semibold text-hs-text-muted bg-hs-input border border-hs-border-strong transition-all active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
        >
          {clear.state === 'pending'
            ? t('alertSender.clearingButton')
            : clear.state === 'error'
              ? t('alertSender.failedButton')
              : targetUnnamed
                ? t('alertSender.clearOnUnnamed')
                : targetName
                ? t('alertSender.clearOnDisplay', { name: targetName })
                : t('alertSender.clearOnAll')}
          {activeAlerts !== null && activeAlerts > 0 && (
            <span className="ml-1.5 text-hs-text-faint font-medium">
              {t('alertSender.showingNow', { count: activeAlerts })}
            </span>
          )}
        </button>
      </div>
    </SlideUpSheet>
  );
}
