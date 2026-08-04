'use client';

import { Info } from 'lucide-react';
import Link from 'next/link';
import { useTranslate } from '@/i18n';
import { settingsHref } from '@/lib/settings-route';
import DisplayCanvasCard from './DisplayCanvasCard';
import DisplayOverrideFields from './DisplayOverrideFields';
import type { DisplayNode, ScreenConfiguration } from '@/types/config';

interface DisplaySubtabProps {
  config: ScreenConfiguration;
  display: DisplayNode;
}

const DEFAULTS_HREF = settingsHref({ kind: 'defaults', page: 'screen' });

/**
 * Display detail "Display" — the per-display equivalent of the
 * `Defaults → Display` page. Two sections:
 *
 *   1. **Canvas** (`DisplayCanvasCard`) — `displayWidth`, `displayHeight`,
 *      `displayTransform`, which live directly on the `DisplayNode`.
 *
 *   2. **Rotation & transitions / Appearance** (`DisplayOverrideFields`) —
 *      every inheritable field, wrapped in `OverrideRow`.
 *
 * Both cards write straight to the store and flush themselves; the parent
 * settings page has no top-level Save button for per-display drill-downs.
 */
export default function DisplaySubtab({ config, display }: DisplaySubtabProps) {
  const t = useTranslate('editor');

  // Resolve once per render — the banner and every OverrideRow share this label.
  const DEFAULTS_LABEL = t('settings.perDisplayPage.display.defaultsLabel');

  return (
    <>
      {/* Top status banner */}
      <div className="mb-4 rounded-lg border border-hs-accent/20 bg-hs-accent/[0.07] px-4 py-3 flex items-start gap-3">
        <Info className="w-4 h-4 text-hs-accent-hover shrink-0 mt-0.5" />
        <div className="text-xs text-hs-accent-hover leading-relaxed">
          {t('settings.perDisplayPage.display.bannerPart1')}
          <strong className="text-hs-text-primary">
            {t('settings.perDisplayPage.display.bannerEmphasisDefault')}
          </strong>
          {t('settings.perDisplayPage.display.bannerPart2')}
          <Link
            href={DEFAULTS_HREF}
            className="text-hs-accent hover:text-hs-accent-hover underline decoration-dashed underline-offset-2"
          >
            {DEFAULTS_LABEL}
          </Link>
          {t('settings.perDisplayPage.display.bannerPart3')}
          <strong className="text-hs-text-primary">
            {t('settings.perDisplayPage.display.bannerEmphasisOverride')}
          </strong>
          {t('settings.perDisplayPage.display.bannerPart4', { name: display.name })}
        </div>
      </div>

      <DisplayCanvasCard config={config} display={display} />

      <DisplayOverrideFields config={config} display={display} />
    </>
  );
}
