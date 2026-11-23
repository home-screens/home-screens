'use client';

import { MAX_DISPLAY_DIMENSION, MIN_DISPLAY_DIMENSION, findMainDisplay } from '@/lib/display-filter';
import { useEditorStore } from '@/stores/editor-store';
import TouchAlignmentControl from '@/components/editor/settings/shared/TouchAlignmentControl';
import OrientationChangeModal from '@/components/editor/settings/OrientationChangeModal';
import { useTranslate } from '@/i18n';
import { useCanvasDimensionDrafts } from './useCanvasDimensionDrafts';
import type { DisplayNode, ScreenConfiguration } from '@/types/config';
import { SETTINGS_INPUT_CLASS } from '@/components/ui/input-classes';
import { SettingsSectionHeading } from '@/components/editor/settings/shared/SettingsPanel';
import FieldHint from '@/components/ui/FieldHint';

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
    orientation,
  } = useCanvasDimensionDrafts(display, config);
  const updateDisplay = useEditorStore((s) => s.updateDisplay);
  const saveConfig = useEditorStore((s) => s.saveConfig);
  // Touch is lined up on the machine the screen is plugged into, and the hub
  // only manages its own: the display that /display renders. A display-only
  // Pi keeps its own labwc config, so the row would promise nothing there.
  const isHubScreen = findMainDisplay(config.displays)?.id === display.id;

  return (
    <div className="mb-5">
      <SettingsSectionHeading>
        {t('settings.perDisplayPage.display.canvasHeading')}
      </SettingsSectionHeading>
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
              min={MIN_DISPLAY_DIMENSION}
              max={MAX_DISPLAY_DIMENSION}
              onChange={(e) => setWidthDraft(e.target.value)}
              onBlur={commitWidth}
              className={`w-full ${SETTINGS_INPUT_CLASS} tabular-nums`}
            />
            <input
              type="number"
              value={heightDraft}
              min={MIN_DISPLAY_DIMENSION}
              max={MAX_DISPLAY_DIMENSION}
              onChange={(e) => setHeightDraft(e.target.value)}
              onBlur={commitHeight}
              className={`w-full ${SETTINGS_INPUT_CLASS} tabular-nums`}
            />
          </div>
          <FieldHint className="mt-1.5">
            {t('settings.perDisplayPage.display.resolutionHelp')}
          </FieldHint>
        </div>
        <div className={`px-4 py-3.5${isHubScreen ? ' border-b border-hs-border' : ''}`}>
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
            className={`w-full ${SETTINGS_INPUT_CLASS}`}
          >
            <option value="normal">{t('settings.perDisplayPage.display.rotationOptionNormal')}</option>
            <option value="90">{t('settings.perDisplayPage.display.rotationOption90')}</option>
            <option value="180">{t('settings.perDisplayPage.display.rotationOption180')}</option>
            <option value="270">{t('settings.perDisplayPage.display.rotationOption270')}</option>
          </select>
        </div>
        {isHubScreen && (
          <div className="px-4 py-3.5" data-field-id="display.touchAlignment">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-hs-text-muted">
                {t('settings.touchAlignment.label')}
              </div>
              <span className="text-[10px] uppercase tracking-wider text-hs-text-faint">
                {t('settings.perDisplayPage.display.perDisplayBadge')}
              </span>
            </div>
            <TouchAlignmentControl
              value={display.touchMatrix}
              onChange={async (next) => {
                updateDisplay(display.id, { touchMatrix: next });
                await saveConfig();
              }}
            />
          </div>
        )}
      </div>

      {orientation.prompt && (
        <OrientationChangeModal
          offCanvasCount={orientation.prompt.offCanvasCount}
          totalModuleCount={orientation.prompt.totalCount}
          newWidth={orientation.prompt.newWidth}
          newHeight={orientation.prompt.newHeight}
          onCancel={orientation.dismiss}
          onSwitchAnyway={orientation.switchAnyway}
          onScaleToFit={orientation.scaleToFit}
        />
      )}
    </div>
  );
}
