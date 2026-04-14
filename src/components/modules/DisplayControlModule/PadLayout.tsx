'use client';

import { useState } from 'react';
import type { LayoutProps } from './types';
import { TargetPicker } from './TargetPicker';
import { HoldConfirmButton } from './HoldConfirmButton';
import { BrightnessPopover } from './BrightnessPopover';

export function PadLayout(props: LayoutProps) {
  const { allowRetargeting, isLegacyMode, availableDisplays, currentTarget, setCurrentTarget, onPrev, onNext, onSleep, onBrightness } = props;
  const [brightnessOpen, setBrightnessOpen] = useState(false);
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
          className="rounded-xl bg-hs-card border border-hs-border-strong text-hs-text-muted flex flex-col items-center justify-center gap-1"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
          <span className="text-[11px]">Sleep</span>
        </HoldConfirmButton>
        <div className="relative">
          <PadButton label="Brightness" onClick={() => setBrightnessOpen((v) => !v)} aria="Brightness">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /></svg>
          </PadButton>
          {brightnessOpen && (
            <div className="absolute bottom-full right-0 mb-2 z-20">
              <BrightnessPopover
                initial={50}
                onCommit={(v) => {
                  onBrightness(v);
                  setBrightnessOpen(false);
                }}
                onDismiss={() => setBrightnessOpen(false)}
              />
            </div>
          )}
        </div>
      </div>
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
      className="rounded-xl bg-hs-card border border-hs-border-strong flex flex-col items-center justify-center gap-1 text-hs-text-muted transition-transform active:scale-95"
    >
      {children}
      <span className="text-[11px]">{label}</span>
    </button>
  );
}
