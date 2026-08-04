'use client';

import { MAX_DISPLAY_DIMENSION } from '@/lib/display-filter';
import { useTranslate } from '@/i18n';
import { useCanvasDimensionDrafts } from './useCanvasDimensionDrafts';
import type { DisplayNode, ScreenConfiguration } from '@/types/config';

interface DisplayCanvasCardProps {
  config: ScreenConfiguration;
  display: DisplayNode;
}

/**
 * Canvas card on the per-display Overrides subtab — `displayWidth`,
 * `displayHeight`, `displayTransform`. These live directly on the
 * `DisplayNode` and have no shared default to inherit from, so they're
 * rendered as plain inputs without an `OverrideRow` wrapper. A "Per
 * display" tag next to each label makes the visual distinction clear.
 */
export default function DisplayCanvasCard({ config, display }: DisplayCanvasCardProps) {
  const t = useTranslate('editor');
  const {
    widthDraft,
    setWidthDraft,
    commitWidth,
    heightDraft,
    setHeightDraft,
    commitHeight,
    handleTransform,
  } = useCanvasDimensionDrafts(display, config.settings);

  return (
    <div className="mb-5">
      <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-2">
        {t('settings.perDisplayPage.display.canvasHeading')}
      </div>
      <div className="rounded-lg border border-hs-border bg-hs-panel/40">
        <div className="px-4 py-3.5 border-b border-hs-border">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-hs-text-muted">
              {t('common.resolution')}
            </div>
            <span className="text-[10px] uppercase tracking-wider text-hs-text-faint">
              {t('settings.perDisplayPage.display.perDisplayBadge')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={widthDraft}
              min={1}
              max={MAX_DISPLAY_DIMENSION}
              onChange={(e) => setWidthDraft(e.target.value)}
              onBlur={commitWidth}
              className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent tabular-nums"
            />
            <input
              type="number"
              value={heightDraft}
              min={1}
              max={MAX_DISPLAY_DIMENSION}
              onChange={(e) => setHeightDraft(e.target.value)}
              onBlur={commitHeight}
              className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent tabular-nums"
            />
          </div>
          <p className="text-[11px] text-hs-text-faint mt-1.5">
            {t('settings.perDisplayPage.display.resolutionHelp')}
          </p>
        </div>
        <div className="px-4 py-3.5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-hs-text-muted">
              {t('fields.rotation')}
            </div>
            <span className="text-[10px] uppercase tracking-wider text-hs-text-faint">
              {t('settings.perDisplayPage.display.perDisplayBadge')}
            </span>
          </div>
          <select
            value={display.displayTransform ?? 'normal'}
            onChange={(e) => handleTransform(e.target.value as 'normal' | '90' | '180' | '270')}
            className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
          >
            <option value="normal">{t('settings.perDisplayPage.display.rotationOptionNormal')}</option>
            <option value="90">{t('settings.perDisplayPage.display.rotationOption90')}</option>
            <option value="180">{t('settings.perDisplayPage.display.rotationOption180')}</option>
            <option value="270">{t('settings.perDisplayPage.display.rotationOption270')}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
