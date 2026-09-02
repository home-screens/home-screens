'use client';

import { Images, ListChecks, UtensilsCrossed } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { useOrigin } from '@/hooks/useOrigin';

/** The three tabs that depend on a module existing somewhere in the config. */
export type GatedTab = 'chores' | 'meals' | 'photos';

const ICONS = {
  chores: ListChecks,
  meals: UtensilsCrossed,
  photos: Images,
} as const;

/**
 * What a family tab shows before the matching module exists anywhere.
 *
 * The tabs used to disappear instead. A parent who installed Home Screens for
 * the chore chart then opened `/remote` on their phone, found only Control and
 * Timers, and read the silence as "chores are not included". Keeping the tab
 * and explaining the gap costs one screen and answers the question.
 */
export default function TabNotSetUp({ kind }: { kind: GatedTab }) {
  const t = useTranslate('remote');
  const origin = useOrigin();
  const Icon = ICONS[kind];
  // Scheme stripped: this is an address someone types on another device, and
  // "http://" is noise in front of the part that matters.
  const editorUrl = `${origin.replace(/^https?:\/\//, '')}/editor`;

  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <Icon size={44} className="mb-4 text-hs-border-strong" aria-hidden="true" />
      <p className="text-base font-medium text-hs-text-body">{t(`tabNotSetUp.${kind}.title`)}</p>
      <p className="mt-2 max-w-xs text-sm text-hs-text-faint">{t(`tabNotSetUp.${kind}.body`)}</p>
      <p className="mt-4 max-w-xs text-sm text-hs-text-faint">
        {(() => {
          const [before, after] = t('tabNotSetUp.howTo').split('{url}');
          return (
            <>
              {before}
              <span className="font-semibold text-hs-text-muted whitespace-nowrap">{editorUrl}</span>
              {after}
            </>
          );
        })()}
      </p>
    </div>
  );
}
