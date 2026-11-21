import type { TranslateFn } from '@/i18n/types';

/**
 * "1 ticket", "5 tickets", in the words of the tab asking: the Chores tab
 * and the Rewards pages each keep their own pair in the `remote` dictionary.
 */
export function ticketWords(t: TranslateFn, n: number, tab: 'choresTab' | 'rewardsView'): string {
  return n === 1 ? t(`${tab}.ticketCountSingular`, { n }) : t(`${tab}.ticketCountPlural`, { n });
}
