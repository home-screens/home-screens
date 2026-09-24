'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslate } from '@/i18n';
import { grabRulesSummary } from '@/components/modules/chore-chart/chore-form-presentation';
import { GrabHoldChoice, GrabLimitChoice, useGrabRulesSave } from './settings/GrabRuleChoices';
import type { ChoreSettings } from '@/types/config';

/**
 * The household's grab rules above the bonus chores in the chore window:
 * what they are now in one line, and Change to open the two choices in place.
 * Each pick saves at once, as on Settings > Family.
 */
export default function GrabRulesLine({ settings: initial, onSaved }: {
  settings: ChoreSettings;
  /** The rules as saved, so the rest of the window reads the new ones. */
  onSaved: (next: ChoreSettings) => void;
}) {
  const t = useTranslate('editor');
  const tModules = useTranslate('modules');
  const [open, setOpen] = useState(false);
  // Opening near the bottom of the list, the choices would start below the
  // window: bring them into view.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [open]);
  const { settings, save, failed, savedAt } = useGrabRulesSave(initial, onSaved);
  const shown = settings ?? initial;

  return (
    <div data-testid="grab-rules" className="rounded-md border border-hs-border-strong/60 bg-hs-card/60 px-2.5 py-2 text-xs">
      <div className="flex items-center gap-2.5">
        <span className="flex-1 min-w-0 text-hs-text-muted">
          <strong className="font-semibold text-hs-text-body">{grabRulesSummary(shown, tModules).limit}</strong>
          {'\u00a0· '}{grabRulesSummary(shown, tModules).hold}
          {/* On the same line, so nothing under the pointer moves when it comes or goes. */}
          {savedAt > 0 && <span role="status" className="ml-2 text-hs-success">{t('settings.familyPage.chores.saved')}</span>}
          {failed && <span role="alert" className="ml-2 text-hs-danger">{t('settings.familyPage.chores.saveFailed')}</span>}
        </span>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 font-semibold text-hs-accent hover:underline"
        >
          {open ? tModules('chore-chart.settings.close') : tModules('chore-chart.settings.change')}
        </button>
      </div>
      {open && (
        <div
          ref={panelRef}
          className="mt-2.5 space-y-3"
          // Escape among the choices closes them, not the whole chore window.
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } }}
        >
          <GrabLimitChoice settings={shown} onPick={(next) => void save(next)} />
          <GrabHoldChoice settings={shown} onPick={(next) => void save(next)} />
        </div>
      )}
    </div>
  );
}
