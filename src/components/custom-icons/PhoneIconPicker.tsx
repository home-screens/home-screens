'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { useTranslate, type TranslateFn } from '@/i18n';
import ChoreIcon, { getIconDef, toLucideValue } from '@/components/modules/chore-chart/ChoreIcon';
import { useCustomIcons } from '@/hooks/useCustomIcons';
import { parseCustomIconValue } from '@/lib/custom-icons';
import { emojiGridWithChosen } from '@/lib/icon-value';
import { withAlpha } from '@/lib/hex-color';
import { FIELD, FIELD_LABEL, REMOTE_ACCENT, REMOTE_ACCENT_INK } from '@/app/(remote)/remote/components/remote-styles';
import PhoneCustomIconSection, { PHONE_SUBHEAD_STYLE } from './PhoneCustomIconSection';

/**
 * What a form offers under "Your icons": named built-in icons (a chore, a
 * reward, a person), or a short row of everyday emoji (a meal, a routine).
 */
export type PhoneIconChoices =
  | { kind: 'icons'; names: readonly string[] }
  | { kind: 'emoji'; emoji: readonly string[] };

/** A long list of named icons gets a filter box; a short one does not need it. */
const SEARCH_THRESHOLD = 12;

function filterIcons(names: readonly string[], search: string, t: TranslateFn): string[] {
  const known = names.filter((name) => getIconDef(name));
  if (!search) return known;
  const q = search.toLowerCase();
  return known.filter((name) => name.toLowerCase().includes(q) || t(`chore-chart.iconLabels.${name}`).toLowerCase().includes(q));
}

/**
 * The grid behind the chooser: the family's own icons first, then what the
 * form offers. Used open by `PhoneIconPicker`, and on its own under a
 * routine step's icon, which has its own button to open it.
 */
export function PhoneIconChoicesPanel({ value, onPick, choices, suggestedName }: {
  value: string;
  onPick: (value: string) => void;
  choices: PhoneIconChoices;
  suggestedName?: string;
}) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const [search, setSearch] = useState('');
  const named = choices.kind === 'icons';
  const filtered = named ? filterIcons(choices.names, search, t) : [];

  return (
    <div>
      <PhoneCustomIconSection value={value} captions={named} suggestedName={suggestedName} onPick={onPick} />
      <div style={{ ...PHONE_SUBHEAD_STYLE, marginTop: 12 }}>
        {tCore(named ? 'customIcons.builtInIcons' : 'customIcons.everydayEmoji')}
      </div>
      {named ? (
        <>
          {choices.names.length > SEARCH_THRESHOLD && (
            <input
              type="text"
              placeholder={t('chore-chart.iconPicker.filter')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...FIELD, marginBottom: 10 }}
            />
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(48px, 1fr))', gap: 6 }}>
            {filtered.map((name) => {
              const def = getIconDef(name)!;
              const lucideVal = toLucideValue(name);
              const isSelected = value === lucideVal;
              const Icon = def.component;
              return (
                <button
                  key={name}
                  type="button"
                  className="press-scale-sm"
                  aria-pressed={isSelected}
                  // A second tap on the chosen icon takes it off again.
                  onClick={() => onPick(isSelected ? '' : lucideVal)}
                  style={{ ...tileStyle(isSelected), flexDirection: 'column', gap: 2, padding: '8px 4px', color: def.defaultColor }}
                >
                  <Icon size={22} strokeWidth={1.75} />
                  <span style={{ fontSize: 9, color: 'var(--hs-text-faint)', textAlign: 'center', lineHeight: 1.1, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t(`chore-chart.iconLabels.${name}`)}
                  </span>
                </button>
              );
            })}
            {search && filtered.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--hs-text-faint)', padding: '12px 0', gridColumn: '1 / -1' }}>
                {t('chore-chart.iconPicker.noMatch')}
              </span>
            )}
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: 6 }}>
          {emojiGridWithChosen(choices.emoji, value).map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="press-scale-sm"
              aria-pressed={value === emoji}
              onClick={() => onPick(emoji)}
              style={{ ...tileStyle(value === emoji), aspectRatio: '1', fontSize: 22 }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** One tile in the grid: amber when it is the chosen one, like every chosen thing on the phone. */
function tileStyle(selected: boolean): CSSProperties {
  return {
    width: '100%',
    minHeight: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    border: `2px solid ${selected ? REMOTE_ACCENT_INK : 'transparent'}`,
    background: selected ? withAlpha(REMOTE_ACCENT, 0.12) : 'var(--hs-bg-card)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  };
}

/**
 * The phone's one icon chooser, on the chore, reward, person, meal and
 * routine forms: a row that shows what is picked, which opens the grid
 * (the family's own icons, then the built-in ones), and closes again on a
 * pick. Collapsed, so a long grid never pushes the fields that matter down
 * the screen. A plain emoji is its own picture, so it is shown once, with no
 * name beside it.
 *
 * `labelStyle` follows the form (`COMPACT_LABEL` on the denser meal form);
 * `labelAction` sits at the end of the label row (the meal form's Manage).
 */
export default function PhoneIconPicker({ value, onChange, choices, label, suggestedName, labelStyle = FIELD_LABEL, labelAction, style }: {
  value: string;
  onChange: (value: string) => void;
  choices: PhoneIconChoices;
  label: string;
  /** What a new picture is called to start with: the chore, meal or person being edited. */
  suggestedName?: string;
  labelStyle?: CSSProperties;
  labelAction?: ReactNode;
  style?: CSSProperties;
}) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const { byId } = useCustomIcons();
  const [open, setOpen] = useState(false);

  const iconName = value.startsWith('lucide:') ? value.slice('lucide:'.length) : '';
  const customId = parseCustomIconValue(value);
  const nameOf = (): string | null => {
    if (iconName && getIconDef(iconName)) return t(`chore-chart.iconLabels.${iconName}`);
    if (customId) return byId.get(customId)?.name ?? t('chore-chart.iconPicker.none');
    if (value) return null;
    return t('chore-chart.iconPicker.none');
  };
  const shownName = nameOf();

  return (
    <div style={{ marginBottom: 24, ...style }}>
      <div style={{ ...labelStyle, ...(labelAction ? { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } : {}) }}>
        <span>{label}</span>
        {labelAction}
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${label}: ${shownName ?? value}`}
        style={{
          ...FIELD,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          border: `1px solid ${open ? 'var(--hs-border-strong)' : 'var(--hs-border)'}`,
          fontSize: 15,
          fontFamily: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {value ? <ChoreIcon value={value} size={22} /> : <span style={{ width: 22 }} aria-hidden />}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {shownName}
        </span>
        <ChevronDown
          size={18}
          aria-hidden
          style={{ flexShrink: 0, color: 'var(--hs-text-faint)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
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
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <Plus size={15} aria-hidden="true" />
          {tCore('customIcons.addYourOwnLink')}
        </button>
      )}
      {open && (
        <div style={{ marginTop: 10 }}>
          <PhoneIconChoicesPanel
            value={value}
            choices={choices}
            suggestedName={suggestedName}
            onPick={(picked) => { onChange(picked); setOpen(false); }}
          />
        </div>
      )}
    </div>
  );
}
