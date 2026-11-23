'use client';

import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';

export interface SegmentedTab<T extends string> {
  id: T;
  label: string;
  /** A small icon before the words (16 px). */
  icon?: ReactNode;
  /** A number after the words: how many are on that page. */
  count?: number;
  testId?: string;
}

/**
 * The switch between the pages of one phone tab (Today, Manage and Rewards;
 * Week, Plan, Library and Grocery; Board and Calendar): pills in a tray, the
 * page on now lit. Each pill is 44 px tall with press feedback, and the row is
 * a real tab list, so a screen reader hears which page is on and the arrow
 * keys move along it.
 *
 * `fit` sizes the tray to its words instead of the full width (the kids'
 * Yesterday and Today).
 */
export default function SegmentedTabs<T extends string>({ tabs, value, onChange, ariaLabel, fit = false, style }: {
  tabs: readonly SegmentedTab<T>[];
  value: T;
  onChange: (id: T) => void;
  /** The list's name for a screen reader: the page or tab it switches. */
  ariaLabel: string;
  fit?: boolean;
  style?: CSSProperties;
}) {
  const row = useRef<HTMLDivElement>(null);

  // Arrow keys, Home and End pick the next page and move the focus with it.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = tabs.findIndex((tab) => tab.id === value);
    const next = e.key === 'ArrowRight' ? (at + 1) % tabs.length
      : e.key === 'ArrowLeft' ? (at - 1 + tabs.length) % tabs.length
        : e.key === 'Home' ? 0
          : e.key === 'End' ? tabs.length - 1
            : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    row.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div
      ref={row}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      style={{
        display: fit ? 'inline-flex' : 'flex',
        gap: 2,
        padding: 3,
        background: 'var(--hs-bg-panel)',
        borderRadius: 10,
        maxWidth: '100%',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {tabs.map((tab) => {
        const on = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            data-testid={tab.testId}
            onClick={() => onChange(tab.id)}
            className="press-scale"
            style={{
              flex: fit ? 'none' : 1,
              minWidth: 44,
              minHeight: 44,
              padding: fit ? '6px 14px' : '6px',
              borderRadius: 8,
              border: 'none',
              background: on ? 'var(--hs-border)' : 'transparent',
              color: on ? 'var(--hs-text-primary)' : 'var(--hs-text-faint)',
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.2,
              fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {tab.icon && <span aria-hidden="true" style={{ display: 'flex', flex: 'none' }}>{tab.icon}</span>}
            {tab.label}
            {tab.count !== undefined && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 20,
                  height: 20,
                  padding: '0 6px',
                  borderRadius: 999,
                  background: on ? 'var(--hs-bg-panel)' : 'var(--hs-bg-hover)',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
