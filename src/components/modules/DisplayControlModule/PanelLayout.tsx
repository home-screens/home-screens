'use client';

import { useState } from 'react';
import type { LayoutProps } from './types';
import { TargetPicker } from './TargetPicker';
import { HoldConfirmButton } from './HoldConfirmButton';

export function PanelLayout(props: LayoutProps) {
  const { allowRetargeting, isLegacyMode, availableDisplays, currentTarget, setCurrentTarget, onPrev, onNext, onSleep, onBrightness } = props;
  const showPicker = allowRetargeting && !isLegacyMode;
  const [brightness, setBrightness] = useState(50);

  return (
    <div className="h-full w-full flex flex-col p-5 gap-3">
      {showPicker && (
        <TargetPicker
          mode="chips"
          value={currentTarget ?? 'all'}
          onChange={(v) => setCurrentTarget(v)}
          options={availableDisplays}
        />
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <LabeledButton aria="Previous screen" label="Prev" onClick={onPrev}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 19l-7-7 7-7" /></svg>
        </LabeledButton>
        <LabeledButton aria="Next screen" label="Next" onClick={onNext}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7" /></svg>
        </LabeledButton>
        <HoldConfirmButton
          ariaLabel="Sleep (hold to confirm)"
          onConfirm={onSleep}
          className="h-14 rounded-xl bg-hs-card border border-hs-border-strong text-hs-text-muted flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
          <span className="text-sm">Sleep</span>
        </HoldConfirmButton>
      </div>

      <div className="space-y-1.5 mt-auto">
        <div className="flex items-center justify-between">
          <span className="text-xs text-hs-text-muted uppercase tracking-wider">Brightness</span>
          <span className="text-xs font-mono text-hs-text-faint">{brightness}%</span>
        </div>
        <input
          aria-label="Brightness"
          type="range"
          min={0}
          max={100}
          value={brightness}
          onChange={(e) => setBrightness(Number(e.target.value))}
          onPointerUp={() => onBrightness(brightness)}
          className="w-full accent-hs-accent"
        />
      </div>
    </div>
  );
}

function LabeledButton({
  label,
  aria,
  onClick,
  children,
}: {
  label: string;
  aria: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={aria}
      onClick={onClick}
      className="h-14 rounded-xl bg-hs-card border border-hs-border-strong text-hs-text-muted flex items-center justify-center gap-2 transition-transform active:scale-95"
    >
      {children}
      <span className="text-sm">{label}</span>
    </button>
  );
}
