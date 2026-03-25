'use client';

import { useState, useEffect, useRef } from 'react';

interface PowerControlsProps {
  needsAuth: boolean;
  onAuthFailure: () => void;
}

function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [executed, setExecuted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleClick = () => {
    if (executed) return;
    if (confirming) {
      clearTimeout(timerRef.current);
      setConfirming(false);
      setExecuted(true);
      onConfirm();
    } else {
      setConfirming(true);
      timerRef.current = setTimeout(() => setConfirming(false), 3000);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || executed}
      className={`flex-1 py-3 rounded-lg text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-40 ${
        executed
          ? 'bg-neutral-800 text-neutral-400'
          : confirming
            ? 'bg-red-600 text-white animate-pulse'
            : 'bg-neutral-800 text-red-400 border border-neutral-700'
      }`}
    >
      {executed ? 'Sent' : confirming ? confirmLabel : label}
    </button>
  );
}

export default function PowerControls({ needsAuth, onAuthFailure }: PowerControlsProps) {
  const sendPower = async (action: 'restart-service' | 'reboot') => {
    try {
      const res = await fetch('/api/system/power', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.status === 401) onAuthFailure();
    } catch {
      // Best-effort — the server may already be restarting
    }
  };

  return (
    <section>
      <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
        Power
      </h2>

      {needsAuth ? (
        <a
          href="/login?from=/remote"
          className="block text-sm text-blue-400 bg-neutral-900 rounded-lg p-3 text-center"
        >
          Sign in to manage power
        </a>
      ) : (
        <div className="flex gap-3">
          <ConfirmButton
            label="Restart Service"
            confirmLabel="Tap again to restart"
            onConfirm={() => sendPower('restart-service')}
            disabled={needsAuth}
          />
          <ConfirmButton
            label="Reboot"
            confirmLabel="Tap again to reboot"
            onConfirm={() => sendPower('reboot')}
            disabled={needsAuth}
          />
        </div>
      )}
    </section>
  );
}
