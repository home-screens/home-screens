'use client';

import { FamilyMealStars } from '@/components/meals/FamilyMealRating';

import { wallPressProps } from '../wallPress';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { SavedMeal } from '@/types/config';
import { useTranslate } from '@/i18n';
import { useInteractionHold } from '@/lib/interaction-hold';
import { isMealieMeal } from '@/lib/meal-dish-rules';
import { chipsThatFit, recipeBookChipId, type RecipeBookChip } from '@/lib/meal-recipe-book';
import { useElementBox } from '@/hooks/useElementBox';
import MealPicture from '@/components/meals/MealPicture';
import { useMealMinutes } from '../useMealMinutes';

/** The chooser of every chip closes itself after this long with no touch, like the event detail. */
export const CHIP_SHEET_AUTO_CLOSE_MS = 45_000;

/** Authored pixels (at 1080 wide, Medium text) to this surface's pixels. */
export type Px = (n: number) => number;

const LABEL: CSSProperties = { fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--fmp-text-3)' };

const ICONS = {
  heart: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
  history: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  book: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  x: 'M18 6 6 18M6 6l12 12',
  cloudOff: 'm2 2 20 20M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07',
} as const;

export function BookIcon({ name, size, strokeWidth = 2.2, fill = 'none', style }: {
  name: keyof typeof ICONS;
  size: number;
  strokeWidth?: number;
  /** `currentColor` for a filled heart. */
  fill?: string;
  style?: CSSProperties;
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={fill} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <path d={ICONS[name]} />
    </svg>
  );
}

// ── Tiles ──

/**
 * One recipe in the book: its photo (or emoji, or the faded plate of a Mealie
 * recipe without a photo) at 4:3, its name on two lines at most, and how long
 * it takes. A button on a touch wall; a picture otherwise. `heart` sits on
 * the picture's corner, beside the tile's button rather than inside it.
 */
export function RecipeTile({ meal, P, onOpen, nameSize = 31, metaSize = 25, heart }: {
  meal: SavedMeal;
  P: Px;
  onOpen?: (meal: SavedMeal) => void;
  nameSize?: number;
  metaSize?: number;
  heart?: ReactNode;
}) {
  const minutes = useMealMinutes()(meal);
  const picture = meal.photoUrl
    ? <MealPicture meal={meal} photoSize="100%" size="min" style={{ width: '100%', height: 'auto', aspectRatio: '4 / 3', borderRadius: P(24) }} />
    : (
      <span style={{
        display: 'flex', width: '100%', aspectRatio: '4 / 3', borderRadius: P(24), alignItems: 'center', justifyContent: 'center',
        background: 'var(--fmp-surface)', border: '1px solid var(--fmp-border-sub)', boxSizing: 'border-box',
      }}>
        <MealPicture meal={meal} photoSize="100%" emojiStyle={{ fontSize: P(110), lineHeight: 1, opacity: isMealieMeal(meal) && !meal.emoji ? 0.35 : 1 }} />
      </span>
    );
  const body = (
    <>
      {picture}
      <span data-testid="recipe-book-tile-name" style={{
        fontSize: P(nameSize), fontWeight: 600, lineHeight: 1.22, color: 'var(--fmp-text)', marginTop: P(14),
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textAlign: 'left', overflowWrap: 'anywhere',
      }}>
        {meal.name}
      </span>
      <FamilyMealStars meal={meal} size={P(metaSize)} style={{ color: 'var(--fmp-text-2)', marginTop: P(6) }} />
      {minutes && (
        <span style={{ display: 'flex', alignItems: 'center', gap: P(8), fontSize: P(metaSize), color: 'var(--fmp-text-3)', marginTop: P(6), fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          <BookIcon name="clock" size={P(metaSize)} />
          {minutes}
        </span>
      )}
    </>
  );
  const style: CSSProperties = { display: 'flex', flexDirection: 'column', minWidth: 0 };
  const tile = !onOpen ? <div data-testid="recipe-book-tile" style={style}>{body}</div> : (
    <button
      type="button"
      {...wallPressProps}
      data-testid="recipe-book-tile"
      onClick={() => onOpen(meal)}
      style={{ ...style, width: '100%', border: 0, background: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}
    >
      {body}
    </button>
  );
  if (!heart) return tile;
  return <div data-testid="recipe-book-item" style={{ position: 'relative', minWidth: 0 }}>{tile}{heart}</div>;
}

/** Soft boxes where the tiles will be, while the first page is on its way. */
export function RecipeTileSkeletons({ count, P }: { count: number; P: Px }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: P(14) }}>
          <span style={{ width: '100%', aspectRatio: '4 / 3', borderRadius: P(24), background: 'var(--fmp-border-sub)' }} />
          <span style={{ width: '70%', height: P(28), borderRadius: P(8), background: 'var(--fmp-border-sub)' }} />
        </div>
      ))}
    </>
  );
}

// ── Search field ──

/**
 * The book's search box. The wall has no keyboard of its own, so this is a
 * button that opens the wall keyboard; it shows the words typed so far with
 * a caret while the keyboard is up, and a clear button once there are words.
 */
export function RecipeSearchField({ P, words, placeholder, typing, onOpen, onClear, height = 108, font = 36, disabled }: {
  P: Px;
  words: string;
  placeholder: string;
  typing: boolean;
  onOpen: () => void;
  onClear: () => void;
  height?: number;
  font?: number;
  disabled?: boolean;
}) {
  const t = useTranslate('modules');
  const box: CSSProperties = {
    height: P(height), borderRadius: P(height * 0.28), boxSizing: 'border-box', background: 'var(--fmp-surface)',
    border: typing ? `${P(3)}px solid var(--fmp-accent)` : `${P(2)}px solid var(--fmp-border)`,
    display: 'flex', alignItems: 'center', gap: P(font * 0.6), padding: `0 ${P(font * 0.55)}px 0 ${P(font * 0.8)}px`,
    fontSize: P(font), color: 'var(--fmp-text)', width: '100%', minWidth: 0,
  };
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        {...wallPressProps}
        data-testid="recipe-book-search"
        aria-label={t('meal-planner.recipeBook.searchAria')}
        onClick={disabled ? undefined : onOpen}
        // fontFamily, not the font shorthand: `box` already sets the size, and a later `font` would reset it.
        style={{ ...box, fontFamily: 'inherit', cursor: disabled ? 'default' : 'text', textAlign: 'left' }}
      >
        <BookIcon name="search" size={P(font * 1.1)} strokeWidth={2.4} style={{ color: 'var(--fmp-text-3)' }} />
        <span data-testid="recipe-book-words" style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: words ? 'var(--fmp-text)' : 'var(--fmp-text-3)' }}>
          {words || (typing ? '' : placeholder)}
          {typing && (
            <span aria-hidden="true" style={{
              display: 'inline-block', width: P(3), height: P(font * 1.15), background: 'var(--fmp-accent)', marginLeft: P(3),
              verticalAlign: 'middle', borderRadius: P(2), animation: 'recipeBookCaret 1s steps(1) infinite',
            }} />
          )}
        </span>
        {/* Room for the clear button drawn over the field. */}
        {words && <span aria-hidden="true" style={{ width: P(height * 0.62), flexShrink: 0 }} />}
      </button>
      {words && !disabled && (
        <button
          type="button"
          {...wallPressProps}
          data-testid="recipe-book-clear"
          aria-label={t('meal-planner.recipeBook.clearSearch')}
          onClick={onClear}
          style={{
            position: 'absolute', top: '50%', right: P(font * 0.55), transform: 'translateY(-50%)',
            width: P(height * 0.62), height: P(height * 0.62), borderRadius: '50%', border: 0, background: 'var(--fmp-border-sub)',
            color: 'var(--fmp-text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
          }}
        >
          <BookIcon name="x" size={P(font * 0.9)} strokeWidth={2.6} />
        </button>
      )}
      <style>{'@keyframes recipeBookCaret { 50% { opacity: 0; } }'}</style>
    </div>
  );
}

// ── Chips ──

/** What a chip says. */
export function useChipLabel(): (chip: RecipeBookChip) => string {
  const t = useTranslate('modules');
  return (chip) => {
    switch (chip.kind) {
      case 'mealie': return t(`meal-planner.recipeBook.shortcuts.${chip.filter}`);
      case 'local': return t(`meal-planner.recipeBook.filters.${chip.filter}`);
      default: return chip.name;
    }
  };
}

function chipIcon(chip: RecipeBookChip): keyof typeof ICONS | null {
  if (chip.kind === 'cookbook') return 'book';
  if (chip.kind === 'mealie') return chip.filter === 'favorites' ? 'heart' : chip.filter === 'recent' ? 'history' : 'grid';
  if (chip.kind === 'local') return chip.filter === 'favorites' ? 'heart' : chip.filter === 'all' ? 'grid' : null;
  return null;
}

/**
 * The smallest a control on a touch wall is drawn, in CSS pixels, whatever the
 * module's text size: a small module's chips at its default text were 25 px
 * tall, and a tap just below one missed.
 */
export const WALL_TOUCH_MIN_PX = 44;

function Chip({ label, icon, on, size, P, onClick, testId, minHeight = 0 }: {
  label: string;
  icon: keyof typeof ICONS | null;
  on: boolean;
  size: number;
  P: Px;
  /** In CSS pixels: a floor on the height, for a small module's chips (`WALL_TOUCH_MIN_PX`). */
  minHeight?: number;
  onClick?: () => void;
  testId?: string;
}) {
  const color = on ? 'var(--fmp-accent)' : 'var(--fmp-text-2)';
  return (
    <button
      type="button"
      {...(onClick ? wallPressProps : {})}
      data-testid={testId}
      data-on={on ? '' : undefined}
      aria-pressed={onClick ? on : undefined}
      onClick={onClick}
      tabIndex={onClick ? undefined : -1}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: P(size * 0.38), height: Math.max(P(size * 2.3), minHeight), padding: `0 ${P(size * 0.85)}px`,
        borderRadius: 999, boxSizing: 'border-box', whiteSpace: 'nowrap', flexShrink: 0,
        border: `${P(2)}px solid ${on ? 'color-mix(in srgb, var(--fmp-accent) 55%, transparent)' : 'var(--fmp-border)'}`,
        background: on ? 'color-mix(in srgb, var(--fmp-accent) 14%, var(--fmp-surface))' : 'var(--fmp-surface)',
        color, font: 'inherit', fontSize: P(size), fontWeight: 600, cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {icon && <BookIcon name={icon} size={P(size * 1.05)} />}
      {label}
    </button>
  );
}

/**
 * The chips across the top of the book, in at most two rows (`chipsThatFit`):
 * what does not fit goes behind a "+ N more" chip that opens all of them as a
 * sheet. Never a sideways-scrolling row, since a sideways flick on a wall
 * changes screens. The lit chip always shows.
 */
export function RecipeBookChips({ chips, active, onChoose, P, size = 30, maxRows = 2, sheetHost, onMore, minHeight = 0 }: {
  chips: RecipeBookChip[];
  active: RecipeBookChip;
  /** In CSS pixels: the shortest a chip is drawn (a small module's chips on a touch wall). */
  minHeight?: number;
  /** Null when the chips are only drawn (taps off). */
  onChoose: ((chip: RecipeBookChip) => void) | null;
  P: Px;
  size?: number;
  maxRows?: number;
  /**
   * The book's own box, which the "+ N more" sheet opens over. The wall canvas
   * may be scaled, so the sheet stays inside the book rather than fixed to
   * the window.
   */
  sheetHost: HTMLElement | null;
  /** "+ N more" does this instead of opening the chip sheet (the small module opens the whole book). */
  onMore?: () => void;
}) {
  const t = useTranslate('modules');
  const label = useChipLabel();
  const activeId = recipeBookChipId(active);
  const [boxRef, box] = useElementBox('content');
  const measureRef = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState<{ key: string; chips: number[]; more: number } | null>(null);
  const gap = P(14);
  // The words as well as the ids: a change of language changes every width.
  const words = chips.map((c) => `${recipeBookChipId(c)}=${label(c)}`).join('|');
  const measureKey = `${words}|${t('meal-planner.recipeBook.moreChips', { count: 99 })}|${P(100)}|${size}`;

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el || widths?.key === measureKey) return;
    const kids = Array.from(el.children) as HTMLElement[];
    const more = kids.pop();
    setWidths({ key: measureKey, chips: kids.map((k) => k.offsetWidth), more: more?.offsetWidth ?? 0 });
  }, [measureKey, widths?.key]);

  const shown = useMemo(() => {
    if (!widths || widths.key !== measureKey || !box.width) return chips.map((_, i) => i).slice(0, 3);
    const keep = chips.findIndex((c) => recipeBookChipId(c) === activeId);
    return chipsThatFit(widths.chips, box.width, gap, widths.more, maxRows, keep);
  }, [widths, measureKey, box.width, chips, activeId, gap, maxRows]);
  const hidden = chips.length - shown.length;
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div ref={boxRef} data-testid="recipe-book-chips" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap }}>
        {shown.map((i) => {
          const chip = chips[i];
          const id = recipeBookChipId(chip);
          return (
            <Chip
              key={id}
              testId={`recipe-book-chip-${id}`}
              label={label(chip)}
              icon={chipIcon(chip)}
              on={id === activeId}
              size={size}
              P={P}
              minHeight={minHeight}
              onClick={onChoose ? () => onChoose(chip) : undefined}
            />
          );
        })}
        {hidden > 0 && (
          <Chip
            testId="recipe-book-chip-more"
            label={t('meal-planner.recipeBook.moreChips', { count: hidden })}
            icon={null}
            on={false}
            size={size}
            P={P}
            minHeight={minHeight}
            onClick={onChoose ? (onMore ?? (() => setSheetOpen(true))) : undefined}
          />
        )}
      </div>
      {/* Every chip in one line, measured once, so the visible rows can be worked out without a layout loop.
          The line is wider than the screen, so it sits in a zero-size clipped box: unclipped, it made every
          box around the book overflow sideways, and the full-screen fit loop shrank the book to its floor. */}
      <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, overflow: 'hidden' }}>
        <div ref={measureRef} inert style={{ visibility: 'hidden', display: 'flex', width: 'max-content', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {chips.map((chip) => <Chip key={recipeBookChipId(chip)} label={label(chip)} icon={chipIcon(chip)} on={false} size={size} P={P} />)}
          <Chip label={t('meal-planner.recipeBook.moreChips', { count: 99 })} icon={null} on={false} size={size} P={P} />
        </div>
      </div>
      {sheetOpen && onChoose && sheetHost && createPortal(
        <ChipSheet
          chips={chips}
          activeId={activeId}
          P={P}
          size={size}
          onChoose={(chip) => { setSheetOpen(false); onChoose(chip); }}
          onClose={() => setSheetOpen(false)}
        />,
        sheetHost,
      )}
    </div>
  );
}

/** Every chip, as a sheet over the book, for the ones behind "+ N more". */
function ChipSheet({ chips, activeId, P, size, onChoose, onClose }: {
  chips: RecipeBookChip[];
  activeId: string;
  P: Px;
  size: number;
  onChoose: (chip: RecipeBookChip) => void;
  onClose: () => void;
}) {
  const t = useTranslate('modules');
  const label = useChipLabel();
  useInteractionHold();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [touchedAt, setTouchedAt] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => closeRef.current(), CHIP_SHEET_AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [touchedAt]);
  return (
    <div
      data-testid="recipe-book-chip-sheet"
      onClick={onClose}
      style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={() => setTouchedAt(Date.now())}
        style={{
          width: '100%', maxHeight: '80%', overflowY: 'auto', scrollbarWidth: 'none', background: 'var(--fmp-bg)',
          borderRadius: `${P(36)}px ${P(36)}px 0 0`, boxShadow: '0 -16px 60px rgba(0,0,0,0.3)', padding: `${P(22)}px ${P(48)}px ${P(48)}px`,
        }}
      >
        <div style={{ width: P(96), height: P(10), borderRadius: P(5), background: 'var(--fmp-border)', margin: `0 auto ${P(28)}px` }} />
        <div style={{ ...LABEL, fontSize: P(22), marginBottom: P(22) }}>{t('meal-planner.recipeBook.allChips')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: P(14) }}>
          {chips.map((chip) => {
            const id = recipeBookChipId(chip);
            return (
              <Chip
                key={id}
                testId={`recipe-book-sheet-chip-${id}`}
                label={label(chip)}
                icon={chipIcon(chip)}
                on={id === activeId}
                size={size}
                P={P}
                onClick={() => onChoose(chip)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Messages ──

/** A centred message in the book's place: nothing found, Mealie not answering, no recipes yet. */
export function BookMessage({ P, glyph, icon, title, hint, action, testId }: {
  P: Px;
  glyph?: string;
  icon?: keyof typeof ICONS;
  title: string;
  hint?: string;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: P(22), padding: `${P(90)}px ${P(70)}px` }}>
      {icon && (
        <span style={{ width: P(130), height: P(130), borderRadius: '50%', background: 'var(--fmp-border-sub)', color: 'var(--fmp-text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BookIcon name={icon} size={P(58)} strokeWidth={2.1} />
        </span>
      )}
      {glyph && <span style={{ fontSize: P(150), lineHeight: 1, opacity: 0.3 }}>{glyph}</span>}
      <span style={{ fontFamily: "var(--font-dm-serif), 'DM Serif Display', Georgia, serif", fontSize: P(56), lineHeight: 1.1, color: 'var(--fmp-text)' }}>{title}</span>
      {hint && <span style={{ fontSize: P(32), lineHeight: 1.4, color: 'var(--fmp-text-2)', maxWidth: P(820) }}>{hint}</span>}
      {action}
    </div>
  );
}

export const SECTION_LABEL = LABEL;
