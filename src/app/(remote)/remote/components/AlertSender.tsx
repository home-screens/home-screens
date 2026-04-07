'use client';

import { useState, useEffect } from 'react';
import { useCommand } from '../hooks';
import { useDisplayTarget } from '../display-target';

interface AlertSenderProps {
  open: boolean;
  onClose: () => void;
}

const ALERT_TYPES = [
  { value: 'info', label: 'Info', activeBg: 'bg-blue-500/[0.15]', activeText: 'text-blue-400', activeBorder: 'border-blue-500/30' },
  { value: 'warning', label: 'Warning', activeBg: 'bg-amber-500/[0.15]', activeText: 'text-amber-400', activeBorder: 'border-amber-500/30' },
  { value: 'urgent', label: 'Urgent', activeBg: 'bg-red-500/[0.15]', activeText: 'text-red-400', activeBorder: 'border-red-500/30' },
] as const;

const DURATIONS = [
  { label: '10s', value: 10000 },
  { label: '30s', value: 30000 },
  { label: '1 min', value: 60000 },
  { label: '5 min', value: 300000 },
  { label: 'Persistent', value: 0 },
];

export default function AlertSender({ open, onClose }: AlertSenderProps) {
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
      fetch('/api/display/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title: title.trim() || undefined,
          message: message.trim() || undefined,
          duration: duration || undefined,
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
        className={`fixed bottom-0 left-0 right-0 z-[101] bg-[#141414] rounded-t-[20px] max-h-[85dvh] overflow-y-auto transition-transform duration-300 pb-[env(safe-area-inset-bottom)] ${
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
          <h2 className="text-lg font-bold text-white">Send Alert</h2>
          <button
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-white/[0.08] flex items-center justify-center text-neutral-400"
            aria-label="Close alert sender"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 pb-6 space-y-4">
          {/* Type selector */}
          <div className="flex gap-2">
            {ALERT_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={`flex-1 min-h-[44px] py-2.5 rounded-xl text-[13px] font-semibold border transition-all active:scale-[0.98] ${
                  type === t.value
                    ? `${t.activeBg} ${t.activeText} ${t.activeBorder}`
                    : 'bg-white/[0.04] text-neutral-500 border-white/[0.06]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Title */}
          <div>
            <label htmlFor="alert-title" className="block text-xs font-medium text-neutral-500 mb-1.5">Title</label>
            <input
              id="alert-title"
              type="text"
              placeholder="Optional"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 min-h-[44px] text-sm bg-white/[0.04] border border-white/[0.06] rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500/40 transition-colors"
            />
          </div>

          {/* Message */}
          <div>
            <label htmlFor="alert-message" className="block text-xs font-medium text-neutral-500 mb-1.5">Message</label>
            <textarea
              id="alert-message"
              placeholder="What should the display show?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              className="w-full px-4 py-3 text-sm bg-white/[0.04] border border-white/[0.06] rounded-xl text-white placeholder-neutral-600 resize-none focus:outline-none focus:border-blue-500/40 transition-colors"
            />
          </div>

          {/* Duration */}
          <div>
            <span className="block text-xs font-medium text-neutral-500 mb-1.5">Duration</span>
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDuration(d.value)}
                  className={`shrink-0 px-3.5 py-2 min-h-[44px] rounded-lg text-xs font-semibold transition-all active:scale-[0.98] ${
                    duration === d.value
                      ? 'bg-white/[0.1] text-white'
                      : 'bg-white/[0.04] text-neutral-500'
                  }`}
                >
                  {d.label}
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
                ? 'bg-green-600 text-white'
                : state === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-blue-600 active:bg-blue-500 text-white'
            }`}
          >
            {state === 'pending' ? 'Sending\u2026' : state === 'success' ? 'Sent!' : state === 'error' ? 'Failed \u2014 try again' : 'Send Alert'}
          </button>
        </div>
      </div>
    </>
  );
}
