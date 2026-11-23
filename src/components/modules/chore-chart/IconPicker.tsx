'use client';

import { useState, type KeyboardEvent } from 'react';
import { useTranslate, type TranslateFn } from '@/i18n';
import ChoreIcon, { getIconDef, toLucideValue } from './ChoreIcon';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import EditorCustomIconSection from '@/components/custom-icons/EditorCustomIconSection';

interface IconPickerProps {
  value: string;
  onChange: (v: string) => void;
  icons: string[];
  label: string;
  /** What a new picture is called to start with: the chore, reward or person
   *  being edited. */
  suggestedName?: string;
}

/** A long list of icons gets a filter box. */
const SEARCH_THRESHOLD = 20;

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

/**
 * The editor's icon picker (chore window, Family page): the family's own icons,
 * then the built-in grid. The phone has its own chooser, `PhoneIconPicker`.
 */
export default function IconPicker({ value, onChange, icons, label, suggestedName }: IconPickerProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const [search, setSearch] = useState('');
  const showSearch = icons.length > SEARCH_THRESHOLD;
  const filtered = filterIcons(icons, search, t);

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
