'use client';

import { useState, useRef, useEffect } from 'react';

export interface TargetPickerProps {
  mode: 'chips' | 'dropdown';
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; name: string }>;
}

const ALL_OPTION = { id: 'all', name: 'All' } as const;

export function TargetPicker({ mode, value, onChange, options }: TargetPickerProps) {
  const allOptions = [ALL_OPTION, ...options];
  if (mode === 'chips') {
    return (
      // data-swipe-ignore: the chip row scrolls sideways — a drag across it
      // must never trigger screen navigation.
      <div className="flex gap-1.5 overflow-x-auto pb-1" data-swipe-ignore>
        {allOptions.map((opt) => {
          const active = opt.id === value;
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt.id)}
              className={`shrink-0 px-3.5 min-h-[40px] rounded-xl text-sm font-medium transition-all active:scale-[0.97] border ${
                active
                  ? 'bg-hs-accent-soft text-hs-accent-hover border-hs-accent/25'
                  : 'bg-hs-card text-hs-text-muted border-hs-border-strong'
              }`}
            >
              {opt.name}
            </button>
          );
        })}
      </div>
    );
  }
  return <DropdownTargetPicker value={value} onChange={onChange} allOptions={allOptions} />;
}

function DropdownTargetPicker({
  value,
  onChange,
  allOptions,
}: {
  value: string;
  onChange: (v: string) => void;
  allOptions: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const selected = allOptions.find((o) => o.id === value) ?? allOptions[0];
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="px-3 h-10 rounded-xl bg-hs-card border border-hs-border-strong flex items-center gap-2 text-sm font-medium text-hs-text-muted"
      >
        <span>{selected.name}</span>
        <svg className="w-3 h-3 text-hs-text-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 mt-1 min-w-[160px] rounded-xl bg-hs-card border border-hs-border-strong shadow-lg overflow-hidden z-10"
        >
          {allOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onChange(opt.id);
                setOpen(false);
              }}
              className={`block w-full text-left px-3 py-2 text-sm ${
                opt.id === value ? 'text-hs-accent-hover bg-hs-accent-soft' : 'text-hs-text-muted hover:bg-hs-hover'
              }`}
            >
              {opt.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
