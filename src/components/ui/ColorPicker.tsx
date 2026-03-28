'use client';

import { useState } from 'react';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export default function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const [draft, setDraft] = useState(value);
  // Keep draft in sync when parent value changes (e.g. undo/redo)
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setDraft(value);
    setPrevValue(value);
  }

  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-xs text-neutral-400">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value.startsWith('#') ? value : '#ffffff'}
          onChange={(e) => { onChange(e.target.value); setDraft(e.target.value); }}
          className="w-8 h-8 rounded border border-neutral-600 bg-transparent cursor-pointer"
        />
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (HEX_RE.test(draft)) {
              onChange(draft);
            } else {
              setDraft(value);
            }
          }}
          className="w-28 px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-200"
        />
      </div>
    </label>
  );
}
