'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Info, RotateCcw } from 'lucide-react';

interface WholeBlockOverrideCardProps {
  /** Header label inside the rounded card (e.g. "Sleep schedule"). */
  label: string;
  /** Display name used in the "Override for {X}" CTA. */
  displayName: string;
  /** Querystring link to the matching Defaults page. */
  defaultsHref: string;
  /** Human label for the Defaults page (e.g. "Defaults → Sleep"). */
  defaultsLabel: string;
  /** Banner copy — section-specific (Sleep mentions dim-time exception). */
  infoCopy: ReactNode;
  /** Whether this display has forked the settings block. */
  isForked: boolean;
  /** Seed the override from current defaults. */
  onFork: () => void;
  /** Clear the override and return to inheriting. */
  onReset: () => void;
  /** Form body — dimmed via `disabled` when not forked. */
  children: ReactNode;
}

/**
 * Shared "whole-block override" card UI used by SleepSubtab and
 * AlertsSubtab. Both subtabs fork nested settings objects (sleep /
 * screensaver / alerts) that are never deep-merged in display-filter.ts,
 * so the fork/reset affordance is identical: single rounded card, header
 * row with Override or Reset button, dimmed form body below, "Using the
 * default from …" footer link when inheriting.
 *
 * Mirrors the pattern that OverrideRow established for per-field
 * overrides — extracting this prevents Sleep and Alerts from drifting
 * apart when Tailwind classes or copy evolve.
 */
export default function WholeBlockOverrideCard({
  label,
  displayName,
  defaultsHref,
  defaultsLabel,
  infoCopy,
  isForked,
  onFork,
  onReset,
  children,
}: WholeBlockOverrideCardProps) {
  return (
    <>
      <div className="mb-4 rounded-lg border border-hs-accent/20 bg-hs-accent/[0.07] px-4 py-3 flex items-start gap-3">
        <Info className="w-4 h-4 text-hs-accent-hover shrink-0 mt-0.5" />
        <div className="text-xs text-hs-accent-hover leading-relaxed">{infoCopy}</div>
      </div>

      <div className="rounded-lg border border-hs-border bg-hs-panel/40">
        <div className="px-4 py-3.5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-hs-text-body">{label}</div>
            {isForked ? (
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md text-hs-accent-hover bg-hs-accent-soft border border-hs-accent/30 hover:bg-hs-accent/20 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset to default
              </button>
            ) : (
              <button
                type="button"
                onClick={onFork}
                className="text-[11px] font-medium px-2.5 py-1 rounded-md text-hs-text-secondary bg-hs-card border border-hs-border-strong hover:text-hs-text-primary hover:bg-hs-hover transition-colors"
              >
                Override for {displayName}
              </button>
            )}
          </div>
          {children}
          {!isForked && (
            <p className="text-[11px] text-hs-text-faint mt-3">
              Using the default from{' '}
              <Link
                href={defaultsHref}
                className="text-hs-accent hover:text-hs-accent-hover underline decoration-dashed underline-offset-2"
              >
                {defaultsLabel}
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </>
  );
}
