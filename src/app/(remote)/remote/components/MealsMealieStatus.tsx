'use client';

import { useState, type CSSProperties } from 'react';
import { CloudOff, CookingPot, RotateCw } from 'lucide-react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { formatDateInTZ, formatTimeInTZ, isoDateInTZ } from '@/lib/timezone';
import type { MealieProblem, MealieStatus } from '@/lib/meal-sources';
import { useHouseholdClockFormat, useHouseholdTimezone } from '../household-clock';

/**
 * When Mealie last answered, said in home time: "3:10 PM", or "Thursday
 * 3:10 PM" for a copy from another day (the hub keeps one for a day).
 */
function useCopyTime(updatedAt: number | null | undefined, todayISO: string): string | null {
  const locale = useFormattingLocale();
  const home = useHouseholdTimezone();
  const hour12 = useHouseholdClockFormat() === '12h';
  if (!updatedAt) return null;
  const at = new Date(updatedAt);
  const time = formatTimeInTZ(at, { timezone: home, locale, hour12 });
  if (isoDateInTZ(at, home) === todayISO) return time;
  return `${formatDateInTZ(at, home, { weekday: 'long' }, locale)} ${time}`;
}

/**
 * "From Mealie" under the Meals heading: the one place the tab says where its
 * plan comes from, shared by all four sub-tabs. While Mealie is not answering
 * it also says how old the copy is. A label, not a link: anyone not signed in
 * to Mealie (a child on the family phone) would land on Mealie's sign-in. The
 * Library and Grocery tabs keep their Open Mealie buttons for parents.
 */
export function MealsSourcePill({ status, todayISO }: { status: MealieStatus; todayISO: string }) {
  const t = useTranslate('remote');
  const updatedAt = status.state === 'stale' ? status.updatedAt : null;
  const copyTime = useCopyTime(updatedAt, todayISO);
  if (status.state !== 'ok' && status.state !== 'stale') return null;
  const stale = status.state === 'stale';
  return (
    <div
      data-testid="meals-source-pill"
      style={{
        marginTop: 8,
        display: 'flex',
        width: 'fit-content',
        maxWidth: '100%',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        lineHeight: '19.5px',
        color: 'var(--hs-text-body)',
        background: 'var(--hs-bg-card)',
        border: '1px solid var(--hs-border)',
        borderRadius: 99,
        padding: '5px 12px 5px 6px',
        minHeight: 32,
        boxSizing: 'border-box',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 20,
          height: 20,
          borderRadius: 99,
          background: 'rgba(245,158,11,0.14)',
          color: '#f59e0b',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 'none',
        }}
      >
        <CookingPot size={12} strokeWidth={2.4} />
      </span>
      <span style={{ whiteSpace: 'nowrap' }}>{t('mealie.pill.label')}</span>
      {stale && copyTime && (
        <span style={{ color: 'var(--hs-text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          {t('mealie.pill.updated', { time: copyTime })}
        </span>
      )}
    </div>
  );
}

/** Try again, with the wait shown on the button while the hub asks. */
export function RetryButton({ onRetry, style }: { onRetry: () => Promise<void> | void; style?: CSSProperties }) {
  const t = useTranslate('remote');
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="press-btn"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onRetry();
        } finally {
          setBusy(false);
        }
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minHeight: 44,
        borderRadius: 12,
        border: 'none',
        background: 'var(--hs-bg-hover)',
        color: 'var(--hs-text-primary)',
        fontSize: 14,
        fontWeight: 600,
        cursor: busy ? 'wait' : 'pointer',
        fontFamily: 'inherit',
        opacity: busy ? 0.7 : 1,
        ...style,
      }}
    >
      <RotateCw size={15} strokeWidth={2} aria-hidden className={busy ? 'animate-spin' : undefined} />
      {t('mealsTab.retry')}
    </button>
  );
}

/**
 * Planning paused: Mealie gave no answer, so a change could not be saved.
 * One plain message on the Plan tab and in the meal sheet, saying why (a
 * refused token says how to fix it; waiting will not); the copy on screen
 * stays, and the message goes by itself once Mealie answers again.
 */
export function MealiePausedNotice({
  updatedAt,
  problem,
  todayISO,
  onRetry,
  style,
}: {
  updatedAt: number | null;
  problem: MealieProblem;
  todayISO: string;
  onRetry: () => Promise<void> | void;
  style?: CSSProperties;
}) {
  const t = useTranslate('remote');
  const copyTime = useCopyTime(updatedAt, todayISO);
  const token = problem === 'token';
  return (
    <div
      role="status"
      data-testid="mealie-paused"
      style={{
        background: 'rgba(245,158,11,0.08)',
        border: '1px solid rgba(245,158,11,0.28)',
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 16,
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--hs-text-primary)', lineHeight: '20px' }}>
        <CloudOff size={18} strokeWidth={2} aria-hidden style={{ color: '#f59e0b', flex: 'none' }} />
        {t(`${mealieProblemWords(problem)}.title`)}
      </div>
      <p style={{ margin: '4px 0 10px 26px', fontSize: 13, color: 'var(--hs-text-muted)', lineHeight: '19px' }}>
        {copyTime
          ? t(token ? 'mealie.paused.tokenDescriptionWithTime' : 'mealie.paused.descriptionWithTime', { time: copyTime })
          : t(token ? 'mealie.paused.tokenDescription' : 'mealie.paused.description')}
      </p>
      <RetryButton onRetry={onRetry} style={{ marginLeft: 26, padding: '0 16px' }} />
    </div>
  );
}

/** The phone's words for why there is no answer from Mealie (`.title`, `.description` under it). */
export function mealieProblemWords(problem: MealieProblem | null): string {
  return { 'not-connected': 'mealie.notConnected', token: 'mealie.tokenRefused', unreachable: 'mealie.unreachable' }[problem ?? 'unreachable'];
}

/**
 * The phone's line for a change Mealie did not take, by why: a key under
 * `remote`, or null when Mealie was not the problem (the plain "failed to
 * save" says it then).
 */
export function mealieSaveFailedWords(problem: MealieProblem | undefined): string | null {
  return problem ? { 'not-connected': 'mealie.saveFailed.notConnected', token: 'mealie.saveFailed.token', unreachable: 'mealie.saveFailed.unreachable' }[problem] : null;
}

/**
 * No copy of Mealie's plan at all: said in place of the week, because an
 * empty week would read as "nothing planned" when something is.
 */
export function MealieUnreachable({ problem, onRetry }: { problem: MealieProblem; onRetry: () => Promise<void> | void }) {
  const t = useTranslate('remote');
  const words = mealieProblemWords(problem);
  return (
    <div data-testid="mealie-unreachable" style={{ padding: '48px 16px', textAlign: 'center' }}>
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
        <CloudOff size={24} strokeWidth={2} />
      </div>
      <p style={{ fontSize: 15, color: 'var(--hs-text-body)', fontWeight: 600, margin: '0 0 4px' }}>{t(`${words}.title`)}</p>
      <p style={{ fontSize: 13, color: 'var(--hs-text-faint)', margin: '0 0 20px', lineHeight: '19.5px' }}>
        {t(`${words}.description`)}
      </p>
      <RetryButton onRetry={onRetry} style={{ padding: '0 18px' }} />
    </div>
  );
}

/** The tab's own loading line, for a week on its way from Mealie. */
export function MealsWeekLoading() {
  const t = useTranslate('remote');
  return (
    <div data-testid="meals-week-loading" style={{ padding: '48px 0', textAlign: 'center' }}>
      <div style={{ fontSize: 14, color: 'var(--hs-text-faint)' }}>{t('mealsTab.loading')}</div>
    </div>
  );
}
