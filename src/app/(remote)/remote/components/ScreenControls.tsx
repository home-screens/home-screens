'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { DisplayStatus } from '@/lib/display-commands';
import Slider from '@/components/ui/Slider';
import { useCommand } from '../hooks';

interface ScreenControlsProps {
  status: DisplayStatus | null;
  onNav: (direction: 'next' | 'prev') => void;
  onSleepWake: (currentlyAsleep: boolean) => void;
}

function CommandButton({
  label,
  onClick,
  className = '',
  variant = 'secondary',
}: {
  label: string;
  onClick: () => Promise<Response | null>;
  className?: string;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const { state, execute } = useCommand();

  const variantStyles = {
    primary: 'bg-blue-600 active:bg-blue-500 text-white',
    secondary: 'bg-neutral-800 active:bg-neutral-700 text-neutral-200',
    danger: 'bg-red-600 active:bg-red-500 text-white',
  };

  const displayLabel =
    state === 'pending' ? '\u2026' :
    state === 'success' ? '\u2713' :
    state === 'error' ? 'Failed' :
    label;

  return (
    <button
      className={`rounded-lg font-medium transition-all active:scale-[0.98] disabled:opacity-50 ${variantStyles[variant]} ${className}`}
      onClick={() => execute(onClick)}
      disabled={state === 'pending'}
    >
      {displayLabel}
    </button>
  );
}

export default function ScreenControls({ status, onNav, onSleepWake }: ScreenControlsProps) {
  const isAsleep = status?.displayState === 'asleep';
  const [brightness, setBrightness] = useState(100);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Clean up debounce on unmount
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const sendBrightness = useCallback((value: number) => {
    setBrightness(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch('/api/display/brightness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      }).catch(() => {});
    }, 300);
  }, []);

  return (
    <div className="space-y-3">
      {/* Prev / Next */}
      <div className="grid grid-cols-2 gap-3">
        <CommandButton
          label={'\u25C0  Prev'}
          onClick={() => { onNav('prev'); return fetch('/api/display/prev-screen'); }}
          className="h-14 text-base"
        />
        <CommandButton
          label={'Next  \u25B6'}
          onClick={() => { onNav('next'); return fetch('/api/display/next-screen'); }}
          className="h-14 text-base"
        />
      </div>

      {/* Wake / Sleep */}
      <CommandButton
        label={isAsleep ? 'Wake Display' : 'Sleep Display'}
        onClick={() => {
          onSleepWake(isAsleep);
          return fetch(`/api/display/${isAsleep ? 'wake' : 'sleep'}`);
        }}
        className="w-full h-12 text-sm"
        variant={isAsleep ? 'primary' : 'secondary'}
      />

      {/* Brightness */}
      <div className="bg-neutral-900 rounded-lg p-3">
        <Slider
          label="Brightness"
          value={brightness}
          min={0}
          max={100}
          step={5}
          displayValue={`${brightness}%`}
          onChange={sendBrightness}
        />
      </div>
    </div>
  );
}
