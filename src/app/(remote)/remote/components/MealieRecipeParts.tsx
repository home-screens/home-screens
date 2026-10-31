'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { Heart, History, Search, X } from 'lucide-react';
import type { MealieRecipeFilter } from '@/lib/meal-client';
import { useTranslate } from '@/i18n';

/**
 * The pieces the recipe picker and the Library share while the plan lives in
 * Mealie: the search box, the Favorites and Recently made shortcuts, the
 * grey rows that hold the place while the hub asks Mealie, and the centred
 * messages for nothing found or no answer.
 */

export function RecipeSearchBox({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  const t = useTranslate('remote');
  const [focused, setFocused] = useState(false);
  return (
    <label
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 44,
        padding: '0 6px 0 12px',
        borderRadius: 10,
        border: focused ? '1px solid var(--hs-accent)' : '1px solid var(--hs-border)',
        boxShadow: focused ? '0 0 0 1px var(--hs-accent)' : 'none',
        background: 'var(--hs-bg-panel)',
        color: 'var(--hs-text-faint)',
      }}
    >
      <Search size={16} strokeWidth={2} aria-hidden style={{ flex: 'none' }} />
      {/* A text box in the search role: iPhone draws its own clear button in
          a search-type box, beside the one here. */}
      <input
        type="text"
        role="searchbox"
        inputMode="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        maxLength={100}
        enterKeyHint="search"
        style={{
          flex: 1,
          minWidth: 0,
          height: 42,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'var(--hs-text-primary)',
          fontSize: 14,
          fontFamily: 'inherit',
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('mealie.search.clear')}
          style={{
            width: 32,
            height: 32,
            borderRadius: 99,
            border: 'none',
            background: 'transparent',
            color: 'var(--hs-text-faint)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 'none',
            cursor: 'pointer',
          }}
        >
          <X size={16} strokeWidth={2} aria-hidden />
        </button>
      )}
    </label>
  );
}

const CHIP: CSSProperties = {
  padding: '6px 14px',
  minHeight: 36,
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 999,
  flexShrink: 0,
  whiteSpace: 'nowrap',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export function FilterChip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon?: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        ...CHIP,
        border: active ? '1px solid #f59e0b' : '1px solid var(--hs-border)',
        background: active ? 'rgba(245,158,11,0.15)' : 'var(--hs-bg-panel)',
        color: active ? '#f59e0b' : 'var(--hs-text-faint)',
      }}
    >
      {icon}
      {children}
    </button>
  );
}

/** Favorites and Recently made; neither is lit while words are typed. */
export function RecipeShortcutChips({
  filter,
  searching,
  onFilter,
  children,
  style,
}: {
  filter: MealieRecipeFilter;
  searching: boolean;
  onFilter: (filter: MealieRecipeFilter) => void;
  /** More chips after the two shortcuts (the Library's All). */
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const t = useTranslate('remote');
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', padding: '10px 0 2px', ...style }}>
      <FilterChip active={!searching && filter === 'favorites'} onClick={() => onFilter('favorites')} icon={<Heart size={13} strokeWidth={2} aria-hidden />}>
        {t('mealie.search.favorites')}
      </FilterChip>
      <FilterChip active={!searching && filter === 'recent'} onClick={() => onFilter('recent')} icon={<History size={13} strokeWidth={2} aria-hidden />}>
        {t('mealie.search.recent')}
      </FilterChip>
      {children}
    </div>
  );
}

/** "Looking in Mealie…" and grey rows that hold the place while the hub asks. */
export function RecipeSkeletonRows({ count = 6, square = 48, radius = 8, card = false }: { count?: number; square?: number; radius?: number; card?: boolean }) {
  const t = useTranslate('remote');
  const widths = ['72%', '55%', '80%', '62%', '48%', '70%'];
  return (
    <div data-testid="mealie-looking" aria-busy="true">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--hs-text-faint)', padding: '10px 0 2px' }}>
        <span
          aria-hidden
          className="animate-spin"
          style={{ width: 14, height: 14, borderRadius: 99, border: '2px solid var(--hs-border-strong)', borderTopColor: 'var(--hs-text-muted)', flex: 'none' }}
        />
        {t('mealie.search.looking')}
      </div>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          aria-hidden
          style={card
            ? { display: 'flex', alignItems: 'center', gap: 12, padding: 14, marginBottom: 8, borderRadius: 12, background: 'var(--hs-bg-card)', border: '1px solid var(--hs-border)' }
            : { display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--hs-border)', minHeight: 66 }}
        >
          <div style={{ width: square, height: square, borderRadius: radius, background: 'var(--hs-bg-hover)', flex: 'none', opacity: 0.6 }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 12, borderRadius: 6, background: 'var(--hs-bg-hover)', width: widths[i % widths.length], opacity: 0.6 }} />
            <div style={{ height: 10, borderRadius: 6, background: 'var(--hs-bg-hover)', width: '30%', marginTop: 8, opacity: 0.6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A round icon, a line in bold and a quieter line under it, centred. */
export function CenterMessage({ icon, title, description, children, padding = '56px 8px' }: {
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
  padding?: string;
}) {
  return (
    <div style={{ padding, textAlign: 'center' }}>
      <div
        aria-hidden
        style={{
          width: 56,
          height: 56,
          borderRadius: 99,
          margin: '0 auto 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--hs-bg-panel)',
          border: '1px solid var(--hs-border)',
          color: 'var(--hs-text-muted)',
        }}
      >
        {icon}
      </div>
      <p style={{ fontSize: 15, color: 'var(--hs-text-body)', fontWeight: 600, margin: '0 0 4px' }}>{title}</p>
      <p style={{ fontSize: 13, color: 'var(--hs-text-faint)', margin: children ? '0 0 20px' : 0, lineHeight: '19.5px' }}>{description}</p>
      {children}
    </div>
  );
}
