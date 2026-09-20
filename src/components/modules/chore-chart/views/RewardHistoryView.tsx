'use client';

import { useMemo } from 'react';
import type { FamilyMember } from '@/types/family';
import type { ChoreChartConfig } from '@/types/config';
import type { RewardRedemption } from '@/lib/reward-data';
import { formatTimeAgoLocalized } from '@/lib/chore-constants';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import { CHORE_ROW_ATTR, FitRows } from '../FitRows';

interface RewardHistoryViewProps {
  config: ChoreChartConfig;
  data: {
    members: FamilyMember[];
    allRedemptions: RewardRedemption[];
  };
  width: number;
  fontSize: number;
}

export function sortRewardRedemptions(
  redemptions: RewardRedemption[],
): RewardRedemption[] {
  return [...redemptions].sort(
    (a, b) =>
      new Date(b.redeemedAt).getTime()
      - new Date(a.redeemedAt).getTime(),
  );
}

export function RewardHistoryView({
  config,
  data,
  fontSize,
}: RewardHistoryViewProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');

  const historyLimit = Math.max(
    1,
    Math.min(50, config.historyLimit ?? 5),
  );

  const redemptions = useMemo(
    () =>
      sortRewardRedemptions(data.allRedemptions).slice(0, historyLimit),
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
      {config.showTitle !== false && (
        <div
          className="mb-2 shrink-0 font-semibold"
          style={{ fontSize: '0.8em', opacity: TEXT_OPACITY.secondary }}
        >
          {t('chore-chart.rewardHistory')}
        </div>
      )}

      <div
        className="shrink-0"
        style={{
          borderBottom: `1px solid ${DIVIDER.visible}`,
          marginBottom: '0.3em',
        }}
      />

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
                className="grid items-center gap-x-4 border-b px-2 py-2 last:border-b-0"
                style={{
                  gridTemplateColumns:
                    config.showPoints !== false
                      ? 'minmax(0, 1fr) minmax(0, 2fr) auto auto'
                      : 'minmax(0, 1fr) minmax(0, 2fr) auto',
                  borderColor: DIVIDER.visible,
                }}
              >
                <div
                  className="truncate font-semibold"
                  style={{
                    color: member?.color,
                  }}
                >
                  {memberName}
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
