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
      <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/[0.07] px-4 py-3 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-300 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-200 leading-relaxed">{infoCopy}</div>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40">
        <div className="px-4 py-3.5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-neutral-200">{label}</div>
            {isForked ? (
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md text-blue-300 bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset to default
              </button>
            ) : (
              <button
                type="button"
                onClick={onFork}
                className="text-[11px] font-medium px-2.5 py-1 rounded-md text-neutral-300 bg-neutral-800 border border-neutral-700 hover:text-neutral-100 hover:bg-neutral-700 transition-colors"
              >
                Override for {displayName}
              </button>
            )}
          </div>
          {children}
          {!isForked && (
            <p className="text-[11px] text-neutral-500 mt-3">
              Using the default from{' '}
              <Link
                href={defaultsHref}
                className="text-blue-400 hover:text-blue-300 underline decoration-dashed underline-offset-2"
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
