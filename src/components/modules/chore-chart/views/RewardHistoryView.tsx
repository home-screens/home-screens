'use client';

import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { FamilyMember } from '@/types/family';
import type { ChoreChartConfig } from '@/types/config';
import type { RewardRedemption } from '@/lib/reward-data';
import { formatTimeAgoLocalized } from '@/lib/chore-constants';
import { sortRedemptionsNewestFirst } from '@/lib/reward-rules';
import { TEXT_OPACITY, DIVIDER, ink } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import { useRealClock } from '@/hooks/useTZClock';
import { CHORE_ROW_ATTR, FitRows } from '../FitRows';
import { resolveHistoryLimit } from '../layout';

interface RewardHistoryViewProps {
  config: ChoreChartConfig;
  data: {
    members: FamilyMember[];
    allRedemptions: RewardRedemption[];
  };
  width: number;
  fontSize: number;
  /** Set when the history was opened from the store rather than configured. */
  onBack?: () => void;
  backLabel?: string;
}

/** Who, what, cost, when. The last two take what their widest row needs. */
const LIST_WITH_COST = 'grid gap-x-[0.7em] [grid-template-columns:minmax(0,1.5fr)_minmax(0,2fr)_auto_auto]';
const LIST_WITHOUT_COST = 'grid gap-x-[0.7em] [grid-template-columns:minmax(0,1.5fr)_minmax(0,2fr)_auto]';

export function RewardHistoryView({
  config,
  data,
  fontSize,
  onBack,
  backLabel,
}: RewardHistoryViewProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  // The "how long ago" column goes stale on a quiet wall: nothing else
  // re-renders this card until a chore or a reward changes.
  const now = useRealClock();

  const historyLimit = resolveHistoryLimit(config.historyLimit);

  const redemptions = useMemo(
    () =>
      sortRedemptionsNewestFirst(data.allRedemptions).slice(0, historyLimit),
    [data.allRedemptions, historyLimit],
  );

  const memberMap = useMemo(
    () => new Map(data.members.map((member) => [member.id, member])),
    [data.members],
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ fontSize: `${fontSize}px` }}
    >
      {/* The rule belongs to the title: with the title off, or nothing to
          list, it would be a stray line above the card's content. */}
      {(config.showTitle !== false || onBack) && (
        <div
          className="flex shrink-0 items-center justify-between font-semibold"
          style={{
            fontSize: '0.8em',
            paddingBottom: '0.5em',
            marginBottom: '0.3em',
            borderBottom: redemptions.length > 0 ? `1px solid ${DIVIDER.visible}` : undefined,
          }}
        >
          <span style={{ opacity: TEXT_OPACITY.secondary }}>{t('chore-chart.rewardHistory')}</span>
          {onBack && (
            <button
              type="button"
              data-testid="history-back"
              onClick={onBack}
              className="inline-flex items-center rounded-full"
              style={{ gap: '0.3em', fontSize: '0.85em', fontWeight: 600, padding: '0.15em 0.7em', border: `1px solid ${ink(0.22)}`, background: 'none', color: 'inherit', fontFamily: 'inherit', cursor: 'pointer' }}
            >
              <ArrowLeft size="0.95em" strokeWidth={2.4} aria-hidden="true" />
              {backLabel}
            </button>
          )}
        </div>
      )}

      {redemptions.length === 0 ? (
        <div
          className="flex min-h-0 flex-1 items-center justify-center text-center"
          style={{
            fontSize: '0.75em',
            opacity: TEXT_OPACITY.tertiary,
          }}
        >
          {t('chore-chart.noRewardHistory')}
        </div>
      ) : (
        // One grid for the whole list, with each row a subgrid of it: rows that
        // sized their own columns put "12 tickets" and "6 tickets" at different
        // widths, and the reward names wandered from row to row.
        <FitRows className={config.showPoints !== false ? LIST_WITH_COST : LIST_WITHOUT_COST}>
          {redemptions.map((redemption) => {
            const member = memberMap.get(redemption.memberId);
            const memberName = member?.name ?? redemption.memberName;

            return (
              <div
                key={redemption.id}
                {...{ [CHORE_ROW_ATTR]: '' }}
                className="col-span-full grid grid-cols-subgrid items-center border-b last:border-b-0"
                style={{
                  // All in em, and a fixed line height, so a row is exactly the
                  // height `fitChoreFontSize` budgets for it (PLAIN_ROW_EM).
                  padding: '0.35em 0.4em',
                  lineHeight: 1.3,
                  borderColor: DIVIDER.visible,
                }}
              >
                {/* The person's colour goes on a dot, never on the name: a navy
                    or pale yellow name is unreadable on the wrong card. */}
                <div className="flex min-w-0 items-center font-semibold" style={{ gap: '0.4em' }}>
                  {member?.color && (
                    <span
                      className="shrink-0 rounded-full"
                      style={{ width: '0.55em', height: '0.55em', backgroundColor: member.color }}
                    />
                  )}
                  <span className="truncate">{memberName}</span>
                </div>

                <div className="truncate font-medium">
                  {redemption.rewardName}
                </div>

                {config.showPoints !== false && (
                  <div
                    className="whitespace-nowrap text-right"
                    style={{
                      fontSize: '0.85em',
                      opacity: TEXT_OPACITY.secondary,
                    }}
                  >
                    {t(
                      'fullscreen-chore-chart.rewardsStore.redemptionCost',
                      { count: redemption.cost },
                    )}
                  </div>
                )}

                <div
                  className="whitespace-nowrap text-right"
                  style={{
                    fontSize: '0.8em',
                    opacity: TEXT_OPACITY.tertiary,
                  }}
                >
                  {formatTimeAgoLocalized(redemption.redeemedAt, tCore, now)}
                </div>
              </div>
            );
          })}
        </FitRows>
      )}
    </div>
  );
}
