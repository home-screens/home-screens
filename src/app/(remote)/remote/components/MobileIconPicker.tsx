'use client';

import { useState } from 'react';
import { getIconDef, toLucideValue } from '@/components/modules/chore-chart/ChoreIcon';
import { INPUT_STYLE, LABEL_STYLE } from './chore-form-styles';

export default function MobileIconPicker({
  value,
  onChange,
  icons,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  icons: string[];
  label: string;
}) {
  const [search, setSearch] = useState('');

  const filtered = search
    ? icons.filter((name) => {
        const def = getIconDef(name);
        if (!def) return false;
        const q = search.toLowerCase();
        return name.toLowerCase().includes(q) || def.label.toLowerCase().includes(q);
      })
    : icons;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={LABEL_STYLE}>{label}</div>
      {icons.length > 12 && (
        <input
          type="text"
          placeholder="Filter icons..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...INPUT_STYLE, marginBottom: 10 }}
        />
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 6,
        }}
      >
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
                background: isSelected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                color: def.defaultColor,
                outline: isSelected ? '2px solid #fafafa' : 'none',
                outlineOffset: 1,
              }}
            >
              <Icon size={22} strokeWidth={1.75} />
              <span
                style={{
                  fontSize: 9,
                  color: '#525252',
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
          <span style={{ fontSize: 12, color: '#525252', padding: '12px 0', gridColumn: '1 / -1' }}>
            No matching icons
          </span>
        )}
      </div>
    </div>
  );
}
