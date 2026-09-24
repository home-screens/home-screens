'use client';

import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslate, type TranslateFn } from '@/i18n';
import ChoreIcon, { getIconDef, toLucideValue } from './ChoreIcon';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import PhoneCustomIconSection, { PHONE_SUBHEAD_STYLE } from '@/components/custom-icons/PhoneCustomIconSection';
import EditorCustomIconSection from '@/components/custom-icons/EditorCustomIconSection';
import { useCustomIcons } from '@/hooks/useCustomIcons';
import { parseCustomIconValue } from '@/lib/custom-icons';

type Variant = 'desktop' | 'mobile';

interface IconPickerProps {
  value: string;
  onChange: (v: string) => void;
  icons: string[];
  label: string;
  variant: Variant;
  /** What a new picture is called to start with: the chore, reward or person
   *  being edited. */
  suggestedName?: string;
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

/** Icon name behind a stored value ("lucide:broom" -> "broom"); '' for emoji/none. */
function storedIconName(value: string): string {
  return value.startsWith('lucide:') ? value.slice('lucide:'.length) : '';
}

function filterIcons(icons: string[], search: string, t: TranslateFn): string[] {
  if (!search) return icons;
  const q = search.toLowerCase();
  return icons.filter((name) => {
    if (!getIconDef(name)) return false;
    const label = t(`chore-chart.iconLabels.${name}`);
    return name.toLowerCase().includes(q) || label.toLowerCase().includes(q);
  });
}

/**
 * Arrow keys, Home and End move the focus between the buttons of an icon grid.
 * The grid wraps to the panel's width, so Up and Down find the icon in the
 * row above or below nearest in line with the one focused.
 */
function moveIconFocus(event: KeyboardEvent<HTMLElement>) {
  const buttons = [...event.currentTarget.querySelectorAll<HTMLElement>(':scope > button')];
  const from = buttons.indexOf(document.activeElement as HTMLElement);
  if (from < 0) return;
  let to: number | undefined;
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    const here = buttons[from];
    const down = event.key === 'ArrowDown';
    const rows = buttons.filter((b) => (down ? b.offsetTop > here.offsetTop : b.offsetTop < here.offsetTop));
    if (rows.length) {
      const rowTop = down ? Math.min(...rows.map((b) => b.offsetTop)) : Math.max(...rows.map((b) => b.offsetTop));
      const row = rows.filter((b) => b.offsetTop === rowTop);
      const nearest = row.reduce((best, b) => (Math.abs(b.offsetLeft - here.offsetLeft) < Math.abs(best.offsetLeft - here.offsetLeft) ? b : best));
      to = buttons.indexOf(nearest);
    }
  } else {
    to = { ArrowRight: from + 1, ArrowLeft: from - 1, Home: 0, End: buttons.length - 1 }[event.key];
  }
  if (to === undefined || to < 0 || to >= buttons.length) return;
  event.preventDefault();
  buttons[to].focus();
}

export default function IconPicker({ value, onChange, icons, label, variant, suggestedName }: IconPickerProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const { byId } = useCustomIcons();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const showSearch = icons.length > SEARCH_THRESHOLD[variant];
  const filtered = filterIcons(icons, search, t);

  if (variant === 'mobile') {
    // Collapsed by default: a 60-icon grid pushed the fields that actually
    // matter (tickets, who does it) two screens down. The row shows what is
    // picked; opening it reveals the grid, and picking closes it again.
    const currentName = storedIconName(value);
    const currentDef = currentName ? getIconDef(currentName) : undefined;
    const customId = parseCustomIconValue(value);
    const currentLabel = currentDef
      ? t(`chore-chart.iconLabels.${currentName}`)
      : customId
        ? byId.get(customId)?.name ?? t('chore-chart.iconPicker.none')
      : value
        ? value
        : t('chore-chart.iconPicker.none');

    return (
      <div style={{ marginBottom: 24 }}>
        <div style={MOBILE_LABEL_STYLE}>{label}</div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${label}: ${currentLabel}`}
          style={{
            width: '100%',
            minHeight: 48,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 12,
            background: 'var(--hs-bg-input)',
            border: `1px solid ${open ? 'var(--hs-border-strong)' : 'var(--hs-border)'}`,
            color: 'var(--hs-text-primary)',
            fontSize: 15,
            fontFamily: 'inherit',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          {value ? (
            <ChoreIcon value={value} size={22} />
          ) : (
            <span style={{ width: 22 }} aria-hidden />
          )}
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentLabel}
          </span>
          <ChevronDown
            size={18}
            aria-hidden
            style={{
              flexShrink: 0,
              color: 'var(--hs-text-faint)',
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s',
            }}
          />
        </button>
        {/* The collapsed row reads as "pick from a list"; say out loud that
            your own picture is in there too. */}
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              background: 'none', border: 'none', padding: '12px 0 4px', minHeight: 44, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 14, fontWeight: 500, color: 'var(--hs-accent-hover)',
            }}
          >
            + {tCore('customIcons.addYourOwnLink')}
          </button>
        )}
        {open && (
          <div style={{ marginTop: 10 }}>
            <PhoneCustomIconSection
              value={value}
              captions
              suggestedName={suggestedName}
              accent="var(--hs-text-primary)"
              onPick={(picked) => { onChange(picked); setOpen(false); }}
            />
            <div style={{ ...PHONE_SUBHEAD_STYLE, marginTop: 12 }}>{tCore('customIcons.builtInIcons')}</div>
            {showSearch && (
              <input
                type="text"
                placeholder={t('chore-chart.iconPicker.filter')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={MOBILE_INPUT_STYLE}
              />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(48px, 1fr))', gap: 6 }}>
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
                    aria-pressed={isSelected}
                    onClick={() => {
                      onChange(isSelected ? '' : lucideVal);
                      setOpen(false);
                    }}
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
                      {t(`chore-chart.iconLabels.${name}`)}
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
                  {t('chore-chart.iconPicker.noMatch')}
                </span>
              )}
            </div>
          </div>
        )}
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
          <span className="text-xs text-hs-text-faint">{t('chore-chart.iconPicker.none')}</span>
        )}
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-[10px] text-hs-text-faint hover:text-hs-text-secondary ml-auto"
            aria-label={`${t('chore-chart.iconPicker.clear')} ${label.toLowerCase()}`}
          >
            {t('chore-chart.iconPicker.clear')}
          </button>
        )}
      </div>

      {showSearch && (
        <input
          type="text"
          placeholder={t('chore-chart.iconPicker.filter')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={MODAL_INPUT_CLASS}
        />
      )}

      <EditorCustomIconSection value={value} onPick={onChange} query={search} suggestedName={suggestedName} />
      <div className="text-[10px] font-bold uppercase tracking-wider text-hs-text-faint">{tCore('customIcons.builtInIcons')}</div>
      {/* One tab stop for the whole grid, arrow keys inside it: sixty-odd
          icons used to sit between the chore's name and everything below. */}
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5" onKeyDown={moveIconFocus}>
        {filtered.map((name, index) => {
          const def = getIconDef(name);
          if (!def) return null;
          const lucideVal = toLucideValue(name);
          const isSelected = value === lucideVal;
          const Icon = def.component;
          const anySelected = filtered.some((n) => value === toLucideValue(n));
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(lucideVal)}
              aria-pressed={isSelected}
              tabIndex={isSelected || (!anySelected && index === 0) ? 0 : -1}
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
                {t(`chore-chart.iconLabels.${name}`)}
              </span>
            </button>
          );
        })}
        {search && filtered.length === 0 && (
          <span className="text-xs text-hs-text-faint py-2">{t('chore-chart.iconPicker.noMatch')}</span>
        )}
      </div>
    </div>
  );
}
