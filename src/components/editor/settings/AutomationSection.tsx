'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate, type TranslateFn } from '@/i18n';
import ProfilesSection from './ProfilesSection';
import RulesSection from './RulesSection';
import SharedStateSection from './SharedStateSection';

/**
 * The "Defaults → Automation" page — merged from the former Profiles,
 * Rules, and shared-state pages. All three follow the editor's
 * `selectedDisplayId` and previously rendered identical display pickers;
 * here one picker at the top serves the whole page and the sections
 * render with `embedded` so they skip their own copies (and their own
 * headings — the active tab already names the section).
 *
 * The three sections render as tabs, not a stacked scroll: each is a
 * full card-list surface in its own right, and the tab bar mirrors the
 * per-display page's subtab pattern so the two tabbed settings surfaces
 * feel the same. The active tab lives in the URL (`?panel=…`) so deep
 * links, browser back/forward, and E2E specs can address a specific tab;
 * an unknown or missing value falls back to `profiles`. Keeping the
 * shared-state inspector unmounted until its tab is active also keeps
 * its poll from arming the display's fast re-reporting when nobody is
 * looking.
 */

const AUTOMATION_PANELS = ['profiles', 'rules', 'live'] as const;
type AutomationPanel = (typeof AUTOMATION_PANELS)[number];

function panelLabel(panel: AutomationPanel, t: TranslateFn): string {
  switch (panel) {
    case 'profiles':
      return t('settings.profilesPage.heading');
    case 'rules':
      return t('settings.rulesPage.heading');
    case 'live':
      return t('settings.sharedStatePage.heading');
  }
}

export default function AutomationSection() {
  const t = useTranslate('editor');
  const router = useRouter();
  const searchParams = useSearchParams();
  const config = useEditorStore((s) => s.config);
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  const setSelectedDisplay = useEditorStore((s) => s.setSelectedDisplay);

  const rawPanel = searchParams?.get('panel') ?? 'profiles';
  const panel: AutomationPanel = (AUTOMATION_PANELS as readonly string[]).includes(rawPanel)
    ? (rawPanel as AutomationPanel)
    : 'profiles';

  const navigateToPanel = useCallback(
    (next: AutomationPanel) => {
      // Push (not replace) so the back button walks tabs, matching
      // PerDisplayPage's subtab navigation.
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('section', 'defaults');
      params.set('page', 'automation');
      params.set('panel', next);
      router.push(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  if (!config) return null;

  const allDisplays = config.displays ?? [];
  const isMultiDisplay = allDisplays.length > 0;

  return (
    <>
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-1">
          {t('settings.automationPage.breadcrumb')}
        </div>
        <h1 className="text-xl font-semibold text-hs-text-primary">
          {t('settings.automationPage.heading')}
        </h1>
        <p className="text-sm text-hs-text-faint mt-1">
          {t('settings.automationPage.description')}
        </p>
      </div>

      {/* One display picker for the whole page. Profiles, rules, and the
          shared-state inspector are all per-display (they reference the
          owning display's screens and bus), so a single "which display am
          I editing?" control above the tabs replaces the three per-section
          copies the standalone pages used to render. */}
      {isMultiDisplay && (
        <div className="mb-5 rounded-lg border border-hs-accent/20 bg-hs-accent/[0.07] px-3 py-2.5">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-hs-accent-hover font-medium">
              {t('settings.automationPage.displayPicker.label')}
            </span>
            <select
              value={selectedDisplayId ?? allDisplays[0]?.id ?? ''}
              onChange={(e) => setSelectedDisplay(e.target.value || null)}
              className="mt-1 block w-full rounded-md bg-hs-panel border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
            >
              {allDisplays.map((d) => (
                <option key={d.id} value={d.id}>
                  {t('settings.automationPage.displayPicker.optionLabel', { name: d.name, id: d.id })}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-hs-text-faint mt-1.5">
              {t('settings.automationPage.displayPicker.help')}
            </p>
          </label>
        </div>
      )}

      {/* Tab bar — same visual pattern as PerDisplayPage's subtab bar. */}
      <div className="flex items-center border-b border-hs-border mb-5">
        {AUTOMATION_PANELS.map((p) => (
          <button
            key={p}
            type="button"
            data-testid={`automation-tab-${p}`}
            onClick={() => navigateToPanel(p)}
            className={`px-1 py-2.5 mr-6 text-sm transition-colors border-b-2 ${
              panel === p
                ? 'text-hs-text-primary border-hs-accent'
                : 'text-hs-text-faint border-transparent hover:text-hs-text-secondary'
            }`}
          >
            {panelLabel(p, t)}
          </button>
        ))}
      </div>

      {panel === 'profiles' && <ProfilesSection embedded />}
      {panel === 'rules' && <RulesSection embedded />}
      {panel === 'live' && <SharedStateSection embedded />}
    </>
  );
}
