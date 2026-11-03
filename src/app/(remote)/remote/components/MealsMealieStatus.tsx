'use client';

import { useState, type CSSProperties } from 'react';
import { CloudOff, CookingPot, RotateCw } from 'lucide-react';
import { useTranslate } from '@/i18n';
import type { MealieProblem, MealieStatus } from '@/lib/meal-sources';
import { useCopyTime, type CopyClock } from '@/components/meals/useCopyTime';
import type { MealieClientProblem } from '@/lib/meal-client';
import { useHouseholdClockFormat, useHouseholdTimezone } from '../household-clock';
import { REMOTE_ACCENT } from './chore-form-styles';
import { withAlpha } from '@/lib/hex-color';

/** The household's day, zone and clock, which the phone says a copy's time in (`useCopyTime`). */
export function useHomeCopyClock(todayISO: string): CopyClock {
  return { todayISO, zone: useHouseholdTimezone(), timeFormat: useHouseholdClockFormat() };
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
  const copyTime = useCopyTime(updatedAt, useHomeCopyClock(todayISO));
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
          background: withAlpha(REMOTE_ACCENT, 0.14),
          color: REMOTE_ACCENT,
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
 * refused token or a Mealie Home Screens cannot use says how to fix it;
 * waiting will not); the copy on screen stays, and the message goes by
 * itself once Mealie answers again.
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
  const copyTime = useCopyTime(updatedAt, useHomeCopyClock(todayISO));
  const fix = problem === 'token' || problem === 'setup' ? problem : null;
  return (
    <div
      role="status"
      data-testid="mealie-paused"
      style={{
        background: withAlpha(REMOTE_ACCENT, 0.08),
        border: `1px solid ${withAlpha(REMOTE_ACCENT, 0.28)}`,
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 16,
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--hs-text-primary)', lineHeight: '20px' }}>
        <CloudOff size={18} strokeWidth={2} aria-hidden style={{ color: REMOTE_ACCENT, flex: 'none' }} />
        {t(`${mealieProblemWords(problem)}.title`)}
      </div>
      <p style={{ margin: '4px 0 10px 26px', fontSize: 13, color: 'var(--hs-text-muted)', lineHeight: '19px' }}>
        {copyTime
          ? t(fix ? `mealie.paused.${fix}DescriptionWithTime` : 'mealie.paused.descriptionWithTime', { time: copyTime })
          : t(fix ? `mealie.paused.${fix}Description` : 'mealie.paused.description')}
      </p>
      <RetryButton onRetry={onRetry} style={{ marginLeft: 26, padding: '0 16px' }} />
    </div>
  );
}

/** The phone's words for why there is no answer from Mealie (`.title`, `.description` under it). */
export function mealieProblemWords(problem: MealieClientProblem | null): string {
  return { 'not-connected': 'mealie.notConnected', token: 'mealie.tokenRefused', setup: 'mealie.setup', unreachable: 'mealie.unreachable', connection: 'mealie.connection' }[problem ?? 'unreachable'];
}

/**
 * The phone's words when a recipe search got no answer from Mealie (keys
 * under `remote`): the reason, and what to do about it. Plain silence asks
 * to check that Mealie is running and try again; a reason Mealie gave says
 * how to fix it.
 */
export function mealieSearchFailedWords(problem: MealieClientProblem | null): { title: string; description: string } {
  const words = mealieProblemWords(problem);
  return {
    title: `${words}.title`,
    description: !problem || problem === 'unreachable' ? 'mealie.search.errorDescription' : `${words}.description`,
  };
}

/**
 * The phone's line for a change Mealie did not take, by why: a key under
 * `remote`, or null when Mealie was not the problem (the plain "failed to
 * save" says it then).
 */
export function mealieSaveFailedWords(problem: MealieProblem | undefined): string | null {
  return problem ? { 'not-connected': 'mealie.saveFailed.notConnected', token: 'mealie.saveFailed.token', setup: 'mealie.saveFailed.setup', unreachable: 'mealie.saveFailed.unreachable' }[problem] : null;
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
