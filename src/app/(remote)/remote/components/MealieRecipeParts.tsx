'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { Heart, History, Search, X } from 'lucide-react';
import type { MealieRecipeFilter } from '@/lib/mealie';
import { useTranslate } from '@/i18n';
import ChipButton from './ChipButton';
import IconButton from './IconButton';
import PhoneSpinner from './PhoneSpinner';

/**
 * The pieces the recipe picker and the Library share while the plan lives in
 * Mealie: the search box, the Favorites and Recently made shortcuts, and the
 * grey rows that hold the place while the hub asks Mealie. The picker's
 * search box and chips serve the family's own meals too. Nothing found and no
 * answer are said with `EmptyState`, as on every other page.
 */

export function RecipeSearchBox({
  value,
  onChange,
  placeholder,
  ariaLabel,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  /** The keyboard's Enter key, with the box (the search itself runs as words are typed). */
  onEnter?: (input: HTMLInputElement) => void;
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
        onKeyDown={onEnter && ((e) => {
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
          e.preventDefault();
          onEnter(e.currentTarget);
        })}
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
        <IconButton
          label={t('mealie.search.clear')}
          onClick={() => onChange('')}
          style={{ margin: '-1px -6px -1px 0', borderRadius: 99, color: 'var(--hs-text-faint)' }}
        >
          <X size={16} strokeWidth={2} aria-hidden />
        </IconButton>
      )}
    </label>
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
  const tCore = useTranslate('core');
  return (
    // The chips' 44 px targets carry their own 4 px above and below.
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', padding: '6px 0 0', ...style }}>
      <ChipButton selected={!searching && filter === 'favorites'} onClick={() => onFilter('favorites')} icon={<Heart size={13} strokeWidth={2} aria-hidden />}>
        {tCore('mealie.search.favorites')}
      </ChipButton>
      <ChipButton selected={!searching && filter === 'recent'} onClick={() => onFilter('recent')} icon={<History size={13} strokeWidth={2} aria-hidden />}>
        {tCore('mealie.search.recent')}
      </ChipButton>
      {children}
    </div>
  );
}

/** "Looking in Mealie…" and grey rows that hold the place while the hub asks. */
export function RecipeSkeletonRows({ count = 6, square = 48, radius = 8, card = false }: { count?: number; square?: number; radius?: number; card?: boolean }) {
  const tCore = useTranslate('core');
  const widths = ['72%', '55%', '80%', '62%', '48%', '70%'];
  return (
    <div data-testid="mealie-looking" aria-busy="true">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--hs-text-faint)', padding: '10px 0 2px' }}>
        <PhoneSpinner size={14} tone="quiet" />
        {tCore('mealie.search.looking')}
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
