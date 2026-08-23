'use client';

import type { ReactNode } from 'react';
import AccordionSection from '@/components/editor/AccordionSection';
import SectionHeading from '@/components/ui/SectionHeading';
import { useTranslate } from '@/i18n';
import type { CalendarDayRule, CalendarEventRule } from '@/types/config';

/**
 * Shared grouping shell for the two calendar config sections. Both modules
 * render the same six groups in the same order — view picker (ungrouped),
 * What shows, <current view>, Event rows, Look, Advanced looks, Touch — so
 * learning one panel teaches the other. Headings are `SectionHeading` (the
 * same primitive `TextConfigSection` uses) and the rules live behind a
 * collapsed `AccordionSection`, because they are the tallest and least-often
 * touched block.
 */

const KEY = 'configSections.calendarGroups';

/** Heading for a group; renders nothing when the group has no visible rows,
 *  so a view whose group is entirely conditional never shows a bare label. */
export function CalendarGroup({ label, when = true, children }: {
  label: string;
  when?: boolean;
  children: ReactNode;
}) {
  if (!when) return null;
  return (
    <>
      <SectionHeading>{label}</SectionHeading>
      {children}
    </>
  );
}

export function useCalendarGroupLabels() {
  const t = useTranslate('editor');
  return {
    whatShows: t(`${KEY}.whatShows`),
    eventRows: t(`${KEY}.eventRows`),
    look: t(`${KEY}.look`),
    touch: t(`${KEY}.touch`),
    // advancedLooks is deliberately absent: CalendarRulesGroup owns that
    // heading and translates the key itself.
  };
}

/**
 * Collapsed home for the two rule lists. The badge reports how many rules
 * exist so collapsing never hides configured state — an empty list says so
 * rather than showing nothing, which would read the same as "not loaded".
 */
export function CalendarRulesGroup({ eventRules, dayRules, children }: {
  eventRules: CalendarEventRule[] | undefined;
  dayRules: CalendarDayRule[] | undefined;
  children: ReactNode;
}) {
  const t = useTranslate('editor');
  const count = (eventRules?.length ?? 0) + (dayRules?.length ?? 0);
  const badge = count === 0
    ? t(`${KEY}.ruleCountNone`)
    : count === 1
      ? t(`${KEY}.ruleCountOne`)
      : t(`${KEY}.ruleCountOther`, { count });
  return (
    <AccordionSection title={t(`${KEY}.advancedLooks`)} defaultOpen={false} badge={badge}>
      {children}
    </AccordionSection>
  );
}
