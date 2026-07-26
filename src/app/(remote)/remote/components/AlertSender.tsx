'use client';

import { useState, useEffect } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
import { useCommand } from '../hooks';
import { useDisplayTarget } from '../display-target';

interface AlertSenderProps {
  open: boolean;
  onClose: () => void;
}

// Type and duration options are static structural data; user-visible labels
// are looked up from the `remote.alertSender.*` namespace inside the
// component so they re-render on locale change.
const ALERT_TYPES = [
  { value: 'info', labelKey: 'typeInfo', activeBg: 'bg-hs-accent/[0.15]', activeText: 'text-hs-accent-hover', activeBorder: 'border-hs-accent/30' },
  { value: 'warning', labelKey: 'typeWarning', activeBg: 'bg-hs-warning/[0.15]', activeText: 'text-hs-warning', activeBorder: 'border-hs-warning/30' },
  { value: 'urgent', labelKey: 'typeUrgent', activeBg: 'bg-hs-danger/[0.15]', activeText: 'text-hs-danger', activeBorder: 'border-hs-danger/30' },
] as const;

const DURATIONS = [
  { labelKey: 'duration10s', value: 10000 },
  { labelKey: 'duration30s', value: 30000 },
  { labelKey: 'duration1Min', value: 60000 },
  { labelKey: 'duration5Min', value: 300000 },
  { labelKey: 'durationPersistent', value: 0 },
] as const;

export default function AlertSender({ open, onClose }: AlertSenderProps) {
  const t = useTranslate('remote');
  const [type, setType] = useState<'info' | 'warning' | 'urgent'>('info');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [duration, setDuration] = useState(10000);
  const { state, execute } = useCommand();
  const { target } = useDisplayTarget();

  // Reset form when sheet closes
  useEffect(() => {
    if (!open) {
      setType('info');
      setTitle('');
      setMessage('');
      setDuration(10000);
    }
  }, [open]);

  const canSend = (title.trim() || message.trim()) && state !== 'pending';

  const send = async () => {
    const res = await execute(() =>
      editorFetch('/api/display/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title: title.trim() || undefined,
          message: message.trim() || undefined,
          // Send 0 as-is. `0` is the persistent sentinel the alert store reads
          // (`alert-store.ts` only starts an auto-dismiss timer when duration
          // is > 0), and it must survive as a real number — coercing it to
          // undefined would hand the store a "not specified" value and fall
          // back to the per-type defaults, which auto-dismiss info and warning.
          duration,
          ...(target ? { displayId: target } : {}),
        }),
      }),
    );
    if (res) {
      setTitle('');
      setMessage('');
      onClose();
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-[100] bg-black/50 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-[101] bg-hs-panel rounded-t-[20px] max-h-[85dvh] overflow-y-auto transition-transform duration-300 pb-[env(safe-area-inset-bottom)] ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2.5">
          <div className="w-9 h-[5px] rounded-full bg-white/[0.15]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-lg font-bold text-hs-text-primary">{t('alertSender.title')}</h2>
          <button
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-hs-card flex items-center justify-center text-hs-text-muted"
            aria-label={t('alertSender.closeAriaLabel')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 pb-6 space-y-4">
          {/* Type selector */}
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

          {/* Title */}
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

          {/* Message */}
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

          {/* Duration */}
          <div>
            <span className="block text-xs font-medium text-hs-text-faint mb-1.5">{t('alertSender.durationLabel')}</span>
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDuration(d.value)}
                  className={`shrink-0 px-3.5 py-2 min-h-[44px] rounded-lg text-xs font-semibold transition-all active:scale-[0.98] ${
                    duration === d.value
                      ? 'bg-hs-active text-hs-text-primary'
                      : 'bg-hs-input text-hs-text-faint'
                  }`}
                >
                  {t(`alertSender.${d.labelKey}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Send */}
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
        </div>
      </div>
    </>
  );
}
