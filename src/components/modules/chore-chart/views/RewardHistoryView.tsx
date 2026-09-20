'use client';

import { useMemo } from 'react';
import type { FamilyMember } from '@/types/family';
import type { ChoreChartConfig } from '@/types/config';
import type { RewardRedemption } from '@/lib/reward-data';
import { formatTimeAgoLocalized } from '@/lib/chore-constants';
import { sortRedemptionsNewestFirst } from '@/lib/reward-rules';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { useTranslate } from '@/i18n';
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
}

export function RewardHistoryView({
  config,
  data,
  fontSize,
}: RewardHistoryViewProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');

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
      {config.showTitle !== false && (
        <div
          className="shrink-0 font-semibold"
          style={{
            fontSize: '0.8em',
            opacity: TEXT_OPACITY.secondary,
            paddingBottom: '0.5em',
            marginBottom: '0.3em',
            borderBottom: redemptions.length > 0 ? `1px solid ${DIVIDER.visible}` : undefined,
          }}
        >
          {t('chore-chart.rewardHistory')}
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
        <FitRows>
          {redemptions.map((redemption) => {
            const member = memberMap.get(redemption.memberId);
            const memberName = member?.name ?? redemption.memberName;

            return (
              <div
                key={redemption.id}
                {...{ [CHORE_ROW_ATTR]: '' }}
                className="grid items-center border-b last:border-b-0"
                style={{
                  // All in em, and a fixed line height, so a row is exactly the
                  // height `fitChoreFontSize` budgets for it (PLAIN_ROW_EM).
                  padding: '0.35em 0.4em',
                  columnGap: '0.7em',
                  lineHeight: 1.3,
                  gridTemplateColumns:
                    config.showPoints !== false
                      ? 'minmax(0, 1.3fr) minmax(0, 2fr) auto auto'
                      : 'minmax(0, 1.3fr) minmax(0, 2fr) auto',
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
                  {formatTimeAgoLocalized(redemption.redeemedAt, tCore)}
                </div>
              </div>
            );
          })}
        </FitRows>
      )}
    </div>
  );
}
