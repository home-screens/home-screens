'use client';

import { useState } from 'react';
import { useCommand } from '../RemoteClient';

const ALERT_TYPES = [
  { value: 'info', label: 'Info', style: 'bg-blue-600/20 text-blue-400 border-blue-500/40' },
  { value: 'warning', label: 'Warning', style: 'bg-amber-600/20 text-amber-400 border-amber-500/40' },
  { value: 'urgent', label: 'Urgent', style: 'bg-red-600/20 text-red-400 border-red-500/40' },
] as const;

const DURATIONS = [
  { label: '10s', value: 10000 },
  { label: '30s', value: 30000 },
  { label: '1 min', value: 60000 },
  { label: '5 min', value: 300000 },
  { label: 'Persistent', value: 0 },
];

export default function AlertSender() {
  const [type, setType] = useState<'info' | 'warning' | 'urgent'>('info');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [duration, setDuration] = useState(10000);
  const { state, execute } = useCommand();

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
        }),
      }),
    );
    if (res) {
      setTitle('');
      setMessage('');
    }
  };

  return (
    <section>
      <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
        Send Alert
      </h2>

      <div className="bg-neutral-900 rounded-lg p-3 space-y-3">
        {/* Type selector */}
        <div className="flex gap-2">
          {ALERT_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={`flex-1 py-2 rounded-md text-xs font-medium border transition-all active:scale-[0.98] ${
                type === t.value ? t.style : 'bg-neutral-800 text-neutral-400 border-neutral-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Title */}
        <input
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2.5 text-sm bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-200 placeholder-neutral-500"
        />

        {/* Message */}
        <textarea
          placeholder="Message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          className="w-full px-3 py-2.5 text-sm bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-200 placeholder-neutral-500 resize-none"
        />

        {/* Duration */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {DURATIONS.map((d) => (
            <button
              key={d.value}
              onClick={() => setDuration(d.value)}
              className={`shrink-0 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all active:scale-[0.98] ${
                duration === d.value
                  ? 'bg-neutral-700 text-neutral-200'
                  : 'bg-neutral-800 text-neutral-500'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* Send */}
        <button
          onClick={send}
          disabled={!canSend}
          className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${
            state === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-blue-600 active:bg-blue-500 text-white'
          }`}
        >
          {state === 'pending' ? 'Sending\u2026' : state === 'success' ? 'Sent!' : 'Send Alert'}
        </button>
      </div>
    </section>
  );
}
