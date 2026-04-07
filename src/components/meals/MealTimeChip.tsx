'use client';

import { useState, useRef, useEffect } from 'react';
import type { MealSlotType } from '@/types/config';
import { formatMealTime, getSlotTimePresets } from '@/lib/meal-constants';

/**
 * Inline time picker chip for a single planned meal.
 *
 * The chip itself is always rendered. When clicked, a popover opens as a
 * sibling overlay anchored relative to the chip — so the chip's layout slot
 * never collapses while editing, and the popover position is predictable.
 *
 * Three visual states:
 *   1. empty   — ghost chip "+ Set time" (no time set)
 *   2. set     — filled chip showing the formatted time
 *   3. editing — popover overlay below the chip with native time input,
 *                slot-aware presets, and clear button
 *
 * Used in:
 *   - Editor MealPlannerModal WeekGrid (when assigning meals)
 *   - /remote MealsPlanView and MealsWeekView (when planning from phone)
 *
 * Visual: inline styles only — works inside both Tailwind and non-Tailwind contexts.
 */

export interface MealTimeChipProps {
  /** Current "HH:MM" 24-hour value, or undefined when no time set */
  value: string | undefined;
  /** Called with the new value, or undefined when cleared */
  onChange: (value: string | undefined) => void;
  /** Slot context — drives the quick presets */
  slot: MealSlotType;
  /** Display format for the chip face (24h or 12h) */
  timeFormat?: '12h' | '24h';
  /** Visual variant — "dark" for editor (dark background), "darker" for /remote */
  variant?: 'dark' | 'darker';
  /** Additional accent color for highlights (defaults to amber) */
  accentColor?: string;
  /** Optional aria-label override */
  ariaLabel?: string;
  /** Compact mode shrinks the chip for tight grids */
  compact?: boolean;
  /**
   * Which side of the chip the popover anchors to.
   * - 'left'  (default): popover's left edge aligns with chip's left edge, grows rightward
   * - 'right': popover's right edge aligns with chip's right edge, grows leftward
   *
   * Use 'right' when the chip is on the right edge of a layout (e.g. /remote meal rows)
   * to keep the popover within the viewport.
   */
  align?: 'left' | 'right';
  /**
   * z-index for the popover overlay. Defaults to 60. Lift this when nesting the
   * chip inside a higher-stacking surface (e.g. MealsSettingsSheet at z-index 200)
   * so the popover renders above its container.
   */
  popoverZIndex?: number;
}

const VARIANT_COLORS = {
  dark: {
    chipBg: 'rgba(38, 38, 38, 0.6)',
    chipBgHover: 'rgba(64, 64, 64, 0.8)',
    chipBorder: 'rgba(82, 82, 82, 0.5)',
    chipText: '#d4d4d4',
    ghostText: '#737373',
    popoverBg: '#0a0a0a',
    popoverBorder: '#262626',
    presetBg: 'rgba(38, 38, 38, 0.8)',
    presetBgHover: 'rgba(64, 64, 64, 1)',
    presetText: '#d4d4d4',
    inputBg: '#171717',
    inputBorder: '#262626',
    inputText: '#fafafa',
  },
  darker: {
    chipBg: 'rgba(23, 23, 23, 0.8)',
    chipBgHover: 'rgba(38, 38, 38, 1)',
    chipBorder: 'rgba(64, 64, 64, 0.6)',
    chipText: '#e5e5e5',
    ghostText: '#525252',
    popoverBg: '#171717',
    popoverBorder: '#262626',
    presetBg: 'rgba(38, 38, 38, 0.8)',
    presetBgHover: 'rgba(64, 64, 64, 1)',
    presetText: '#e5e5e5',
    inputBg: '#0a0a0a',
    inputBorder: '#262626',
    inputText: '#fafafa',
  },
} as const;

export default function MealTimeChip({
  value,
  onChange,
  slot,
  timeFormat = '12h',
  variant = 'dark',
  accentColor = '#f59e0b',
  ariaLabel,
  compact = false,
  align = 'left',
  popoverZIndex = 60,
}: MealTimeChipProps) {
  const [isEditing, setIsEditing] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const colors = VARIANT_COLORS[variant];

  // Close popover on outside click
  useEffect(() => {
    if (!isEditing) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsEditing(false);
      }
    };
    // Defer attaching listener so the click that opened the popover doesn't immediately close it
    const id = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditing]);

  // Close on escape, focus input on open
  useEffect(() => {
    if (!isEditing) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsEditing(false);
    };
    document.addEventListener('keydown', handleEsc);
    inputRef.current?.focus();
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isEditing]);

  const presets = getSlotTimePresets(slot);
  const formattedValue = value ? formatMealTime(value, timeFormat) : '';
  const padding = compact ? '2px 6px' : '3px 8px';
  const fontSize = compact ? 10 : 11;

  // ── Chip face (rendered in all three states; popover overlays it when editing) ──
  const chipButton = value ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing((v) => !v);
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding,
        minHeight: compact ? 22 : 26,
        borderRadius: 5,
        border: `1px solid ${isEditing ? accentColor : colors.chipBorder}`,
        background: isEditing
          ? `color-mix(in srgb, ${accentColor} 12%, transparent)`
          : colors.chipBg,
        color: colors.chipText,
        fontSize,
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.15s, border-color 0.15s',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        if (!isEditing) e.currentTarget.style.background = colors.chipBgHover;
      }}
      onMouseLeave={(e) => {
        if (!isEditing) e.currentTarget.style.background = colors.chipBg;
      }}
      aria-label={ariaLabel ?? `Serving time ${formattedValue}, click to change`}
      aria-expanded={isEditing}
      aria-haspopup="dialog"
      title={`Serving time: ${formattedValue}`}
    >
      <svg width={compact ? 9 : 10} height={compact ? 9 : 10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span>{formattedValue}</span>
    </button>
  ) : (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing((v) => !v);
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding,
        minHeight: compact ? 22 : 26,
        borderRadius: 5,
        border: `1px dashed ${isEditing ? accentColor : colors.chipBorder}`,
        background: isEditing
          ? `color-mix(in srgb, ${accentColor} 12%, transparent)`
          : 'transparent',
        color: isEditing ? colors.chipText : colors.ghostText,
        fontSize,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        if (isEditing) return;
        e.currentTarget.style.background = colors.chipBg;
        e.currentTarget.style.color = colors.chipText;
      }}
      onMouseLeave={(e) => {
        if (isEditing) return;
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = colors.ghostText;
      }}
      aria-label={ariaLabel ?? 'Set serving time'}
      aria-expanded={isEditing}
      aria-haspopup="dialog"
    >
      <svg width={compact ? 9 : 10} height={compact ? 9 : 10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span>{compact ? 'Time' : '+ Set time'}</span>
    </button>
  );

  // Anchor styles based on `align` prop — popover sits *below* the chip and
  // either grows right (left-anchored) or grows left (right-anchored)
  const popoverPositionStyle: React.CSSProperties = align === 'right'
    ? { right: 0, top: 'calc(100% + 4px)' }
    : { left: 0, top: 'calc(100% + 4px)' };

  return (
    <span
      ref={wrapperRef}
      style={{
        position: 'relative',
        display: 'inline-block',
        // Ensure stacking context so the popover sits above adjacent rows
        ...(isEditing ? { zIndex: popoverZIndex } : {}),
      }}
    >
      {chipButton}

      {isEditing && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            ...popoverPositionStyle,
            zIndex: popoverZIndex,
            background: colors.popoverBg,
            border: `1px solid ${colors.popoverBorder}`,
            borderRadius: 8,
            padding: 8,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minWidth: 180,
            fontFamily: 'inherit',
          }}
          role="dialog"
          aria-label="Set meal time"
        >
          {/* Native time input */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              ref={inputRef}
              type="time"
              value={value ?? ''}
              onChange={(e) => onChange(e.target.value || undefined)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setIsEditing(false);
              }}
              style={{
                flex: 1,
                padding: '6px 8px',
                minHeight: 32,
                borderRadius: 6,
                border: `1px solid ${colors.inputBorder}`,
                background: colors.inputBg,
                color: colors.inputText,
                fontSize: 13,
                fontFamily: 'inherit',
                colorScheme: 'dark',
              }}
              aria-label="Serving time"
            />
            {value && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(undefined);
                  setIsEditing(false);
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: `1px solid ${colors.inputBorder}`,
                  background: 'transparent',
                  color: '#a3a3a3',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  fontFamily: 'inherit',
                }}
                aria-label="Clear time"
                title="Clear time"
              >
                ×
              </button>
            )}
          </div>

          {/* Quick presets */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
            {presets.map((preset) => {
              const isSelected = preset === value;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(preset);
                    setIsEditing(false);
                  }}
                  style={{
                    padding: '6px 8px',
                    minHeight: 30,
                    borderRadius: 6,
                    border: `1px solid ${isSelected ? accentColor : colors.popoverBorder}`,
                    background: isSelected
                      ? `color-mix(in srgb, ${accentColor} 15%, transparent)`
                      : colors.presetBg,
                    color: isSelected ? accentColor : colors.presetText,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontVariantNumeric: 'tabular-nums',
                    fontFamily: 'inherit',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = colors.presetBgHover;
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = colors.presetBg;
                  }}
                >
                  {formatMealTime(preset, timeFormat)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </span>
  );
}
