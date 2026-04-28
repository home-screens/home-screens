'use client';

import { useState, type CSSProperties } from 'react';
import ChoreIcon, { getIconDef, toLucideValue } from './ChoreIcon';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';

type Variant = 'desktop' | 'mobile';

interface IconPickerProps {
  value: string;
  onChange: (v: string) => void;
  icons: string[];
  label: string;
  variant: Variant;
}

const SEARCH_THRESHOLD: Record<Variant, number> = {
  desktop: 20,
  mobile: 12,
};

const MOBILE_INPUT_STYLE: CSSProperties = {
  width: '100%',
  minHeight: 48,
  padding: '12px 16px',
  background: 'var(--hs-bg-input)',
  border: '1px solid var(--hs-border)',
  borderRadius: 12,
  color: 'var(--hs-text-primary)',
  fontSize: 16,
  outline: 'none',
  marginBottom: 10,
};

const MOBILE_LABEL_STYLE: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--hs-text-faint)',
  marginBottom: 8,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

function filterIcons(icons: string[], search: string): string[] {
  if (!search) return icons;
  const q = search.toLowerCase();
  return icons.filter((name) => {
    const def = getIconDef(name);
    if (!def) return false;
    return name.toLowerCase().includes(q) || def.label.toLowerCase().includes(q);
  });
}

export default function IconPicker({ value, onChange, icons, label, variant }: IconPickerProps) {
  const [search, setSearch] = useState('');
  const showSearch = icons.length > SEARCH_THRESHOLD[variant];
  const filtered = filterIcons(icons, search);

  if (variant === 'mobile') {
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={MOBILE_LABEL_STYLE}>{label}</div>
        {showSearch && (
          <input
            type="text"
            placeholder="Filter icons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={MOBILE_INPUT_STYLE}
          />
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
          {filtered.map((name) => {
            const def = getIconDef(name);
            if (!def) return null;
            const lucideVal = toLucideValue(name);
            const isSelected = value === lucideVal;
            const Icon = def.component;
            return (
              <button
                key={name}
                type="button"
                className="press-scale-sm"
                onClick={() => onChange(isSelected ? '' : lucideVal)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  padding: '8px 4px',
                  minHeight: 48,
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  background: isSelected ? 'var(--hs-bg-hover)' : 'var(--hs-bg-card)',
                  color: def.defaultColor,
                  outline: isSelected ? '2px solid var(--hs-text-primary)' : 'none',
                  outlineOffset: 1,
                }}
              >
                <Icon size={22} strokeWidth={1.75} />
                <span
                  style={{
                    fontSize: 9,
                    color: 'var(--hs-text-faint)',
                    textAlign: 'center',
                    lineHeight: 1.1,
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {def.label}
                </span>
              </button>
            );
          })}
          {search && filtered.length === 0 && (
            <span
              style={{
                fontSize: 12,
                color: 'var(--hs-text-faint)',
                padding: '12px 0',
                gridColumn: '1 / -1',
              }}
            >
              No matching icons
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-hs-text-muted">{label}</span>
        {value ? (
          <ChoreIcon value={value} size={22} />
        ) : (
          <span className="text-xs text-hs-text-faint">None</span>
        )}
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-[10px] text-hs-text-faint hover:text-hs-text-secondary ml-auto"
            aria-label={`Clear ${label.toLowerCase()}`}
          >
            Clear
          </button>
        )}
      </div>

      {showSearch && (
        <input
          type="text"
          placeholder="Filter icons..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={MODAL_INPUT_CLASS}
        />
      )}

      <div className="flex flex-wrap gap-1.5">
        {filtered.map((name) => {
          const def = getIconDef(name);
          if (!def) return null;
          const lucideVal = toLucideValue(name);
          const isSelected = value === lucideVal;
          const Icon = def.component;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(lucideVal)}
              className={`flex flex-col items-center gap-0.5 rounded-lg transition-all px-1.5 py-1.5 ${
                isSelected
                  ? 'ring-2 ring-white ring-offset-1 ring-offset-hs-panel scale-105'
                  : 'hover:scale-105 hover:brightness-125'
              }`}
              style={{
                backgroundColor: `${def.defaultColor}${isSelected ? '30' : '15'}`,
                color: def.defaultColor,
                width: 52,
              }}
            >
              <Icon size={22} strokeWidth={1.75} />
              <span className="text-[9px] leading-tight text-hs-text-muted truncate w-full text-center">
                {def.label}
              </span>
            </button>
          );
        })}
        {search && filtered.length === 0 && (
          <span className="text-xs text-hs-text-faint py-2">No matching icons</span>
        )}
      </div>
    </div>
  );
}
