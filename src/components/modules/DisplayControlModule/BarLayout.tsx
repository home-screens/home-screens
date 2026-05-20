'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import type { LayoutProps } from './types';
import { TargetPicker } from './TargetPicker';
import { HoldConfirmButton } from './HoldConfirmButton';
import { BrightnessPopover } from './BrightnessPopover';

export function BarLayout(props: LayoutProps) {
  const t = useTranslate('modules');
  const { allowRetargeting, isLegacyMode, availableDisplays, currentTarget, setCurrentTarget, onPrev, onNext, onSleep, onBrightness } = props;
  const [brightnessOpen, setBrightnessOpen] = useState(false);
  const [brightness, setBrightness] = useState(50);

  const showPicker = allowRetargeting && !isLegacyMode;

  return (
    <div className="h-full w-full flex items-center gap-3 px-4">
      {showPicker && (
        <TargetPicker
          mode="dropdown"
          value={currentTarget ?? 'all'}
          onChange={(v) => setCurrentTarget(v)}
          options={availableDisplays}
        />
      )}
      {showPicker && <div className="w-px h-8 bg-hs-border-strong" />}

      <IconButton ariaLabel={t('display-control.ariaPrev')} onClick={onPrev}>
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 19l-7-7 7-7" /></svg>
      </IconButton>
      <IconButton ariaLabel={t('display-control.ariaNext')} onClick={onNext}>
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7" /></svg>
      </IconButton>

      <div className="w-px h-8 bg-hs-border-strong" />

      <HoldConfirmButton
        ariaLabel={t('display-control.sleepHoldHint')}
        onConfirm={onSleep}
        className="w-12 h-12 rounded-full bg-hs-card border border-hs-border-strong text-hs-text-muted"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
      </HoldConfirmButton>

      <div className="relative">
        <IconButton ariaLabel={t('display-control.brightness')} onClick={() => setBrightnessOpen((v) => !v)}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /></svg>
        </IconButton>
        {brightnessOpen && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20">
            <BrightnessPopover
              initial={brightness}
              label={t('display-control.brightness')}
              onCommit={(v) => {
                setBrightness(v);
                onBrightness(v);
                setBrightnessOpen(false);
              }}
              onDismiss={() => setBrightnessOpen(false)}
            />
          </div>
        )}
      </div>

      <div className="flex-1" />
    </div>
  );
}

function IconButton({ children, onClick, ariaLabel }: { children: React.ReactNode; onClick: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="w-12 h-12 rounded-full bg-hs-card border border-hs-border-strong text-hs-text-muted flex items-center justify-center transition-transform active:scale-95"
    >
      {children}
    </button>
  );
}
