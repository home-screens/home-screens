'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
import { useDisplayTarget } from '../display-target';

export default function BrightnessCard() {
  const t = useTranslate('remote');
  const [brightness, setBrightness] = useState(100);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { target } = useDisplayTarget();

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const sendBrightness = useCallback((value: number) => {
    setBrightness(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      editorFetch('/api/display/brightness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, ...(target ? { displayId: target } : {}) }),
      }).catch(() => {});
    }, 300);
  }, [target]);

  return (
    <div className="mx-5 mt-4 p-4 bg-hs-card border border-hs-border rounded-[14px]">
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-hs-text-primary">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-[18px] h-[18px] text-hs-warning">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
          </svg>
          {t('brightnessCard.label')}
        </div>
        <span className="text-sm font-semibold text-hs-text-muted tabular-nums">
          {brightness}%
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={brightness}
        onChange={(e) => sendBrightness(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-hs-border-strong
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[22px] [&::-webkit-slider-thumb]:h-[22px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgba(0,0,0,0.3)] [&::-webkit-slider-thumb]:-mt-[7px]
          [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-hs-border-strong
          [&::-moz-range-thumb]:w-[22px] [&::-moz-range-thumb]:h-[22px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
        style={{
          background: `linear-gradient(to right, #f59e0b ${brightness}%, var(--hs-border-strong) ${brightness}%)`,
        }}
        aria-label={t('brightnessCard.valueAriaLabel', { percent: brightness })}
      />
    </div>
  );
}
