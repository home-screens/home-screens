'use client';

import { useState } from 'react';
import type { LayoutProps } from './types';
import { TargetPicker } from './TargetPicker';
import { HoldConfirmButton } from './HoldConfirmButton';

export function PadLayout(props: LayoutProps) {
  const { allowRetargeting, isLegacyMode, availableDisplays, currentTarget, setCurrentTarget, onPrev, onNext, onSleep, onBrightness } = props;
  const [brightnessOpen, setBrightnessOpen] = useState(false);
  const [brightness, setBrightness] = useState(50);
  const showPicker = allowRetargeting && !isLegacyMode;

  return (
    <div className="h-full w-full flex flex-col p-4 gap-3">
      {showPicker && (
        <div className="flex items-center gap-2">
          <TargetPicker
            mode="dropdown"
            value={currentTarget ?? 'all'}
            onChange={(v) => setCurrentTarget(v)}
            options={availableDisplays}
          />
        </div>
      )}

      {brightnessOpen ? (
        <BrightnessEditor
          brightness={brightness}
          setBrightness={setBrightness}
          onCommit={() => onBrightness(brightness)}
          onClose={() => setBrightnessOpen(false)}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2 flex-1">
          <PadButton label="Prev" onClick={onPrev} aria="Previous screen">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 19l-7-7 7-7" /></svg>
          </PadButton>
          <PadButton label="Next" onClick={onNext} aria="Next screen">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7" /></svg>
          </PadButton>
          <HoldConfirmButton
            ariaLabel="Sleep (hold to confirm)"
            onConfirm={onSleep}
            className="h-full w-full rounded-xl bg-hs-card border border-hs-border-strong text-hs-text-muted flex flex-col items-center justify-center gap-1"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            <span className="text-[11px]">Sleep</span>
          </HoldConfirmButton>
          <PadButton label="Brightness" onClick={() => setBrightnessOpen(true)} aria="Brightness">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /></svg>
          </PadButton>
        </div>
      )}
    </div>
  );
}

function PadButton({
  label,
  onClick,
  aria,
  children,
}: {
  label: string;
  onClick: () => void;
  aria: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={aria}
      onClick={onClick}
      className="h-full w-full rounded-xl bg-hs-card border border-hs-border-strong flex flex-col items-center justify-center gap-1 text-hs-text-muted transition-transform active:scale-95"
    >
      {children}
      <span className="text-[11px]">{label}</span>
    </button>
  );
}

function BrightnessEditor({
  brightness,
  setBrightness,
  onCommit,
  onClose,
}: {
  brightness: number;
  setBrightness: (n: number) => void;
  onCommit: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex-1 rounded-xl bg-hs-card border border-hs-border-strong flex flex-col p-4 gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-hs-text-muted">Brightness</span>
        <button
          type="button"
          aria-label="Close brightness"
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center text-hs-text-muted transition-transform active:scale-95"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6l-12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 flex items-center">
        <input
          aria-label="Brightness"
          type="range"
          min={0}
          max={100}
          value={brightness}
          onChange={(e) => setBrightness(Number(e.target.value))}
          onPointerUp={onCommit}
          className="w-full h-3 accent-hs-accent"
        />
      </div>
      <div className="text-center text-base font-mono text-hs-text-faint">{brightness}%</div>
    </div>
  );
}
