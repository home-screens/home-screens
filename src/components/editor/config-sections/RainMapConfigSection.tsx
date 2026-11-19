'use client';

import { CloudRain } from 'lucide-react';
import { useTranslate } from '@/i18n';
import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import Button from '@/components/ui/Button';
import RefreshIntervalSlider from './RefreshIntervalSlider';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useEditorStore } from '@/stores/editor-store';
import { getLocation } from '@/lib/location';
import { hasRainLikelyCondition, withRainLikelyCondition, RAIN_LIKELY_THRESHOLD } from '@/lib/rain-map-visibility';
import { PANEL_SECTION_CONDITIONS, revealPanelSection } from '@/components/editor/panel-section-reveal';
import type { ModuleInstance } from '@/types/config';

/**
 * The one-click way to hide the radar on dry days. It writes an ordinary
 * visibility condition on the household's rain chance (`rain-map-visibility.ts`)
 * and opens the Conditions section so the household sees where it went and
 * can tune the number there. The bus only carries the rain chance once a
 * household location is set, so without one the card says that instead of
 * adding a condition that would hide the map for good.
 */
function RainLikelyShortcut({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const updateModule = useEditorStore((s) => s.updateModule);
  const hasLocation = useEditorStore((s) => getLocation(s.config?.settings) !== null);
  const active = hasRainLikelyCondition(mod.visibility);

  const openConditions = () => revealPanelSection(PANEL_SECTION_CONDITIONS);
  const add = () => {
    updateModule(screenId, mod.id, { visibility: withRainLikelyCondition(mod.visibility) });
    openConditions();
  };

  return (
    <div className="rounded-md border border-hs-border bg-hs-card/60 px-3 py-2 text-xs" data-testid="rain-likely-shortcut">
      <p className="flex items-center gap-1.5 font-medium text-hs-text-body">
        <CloudRain className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        {t('configSections.rain-map.rainLikely.title')}
      </p>
      {active ? (
        <>
          <p className="mt-1 text-hs-text-muted">{t('configSections.rain-map.rainLikely.active')}</p>
          <button type="button" onClick={openConditions} className="mt-1 font-medium text-hs-accent hover:underline">
            {t('configSections.rain-map.rainLikely.edit')}
          </button>
        </>
      ) : hasLocation ? (
        <>
          <p className="mt-1 text-hs-text-muted">{t('configSections.rain-map.rainLikely.help', { percent: RAIN_LIKELY_THRESHOLD })}</p>
          <Button variant="primary" size="sm" className="mt-2" onClick={add}>
            {t('configSections.rain-map.rainLikely.button')}
          </Button>
        </>
      ) : (
        <p className="mt-1 text-hs-text-muted">{t('configSections.rain-map.rainLikely.needsLocation')}</p>
      )}
    </div>
  );
}

export function RainMapConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<{
    latitude?: number;
    longitude?: number;
    zoom?: number;
    animationSpeedMs?: number;
    extraDelayLastFrameMs?: number;
    smooth?: boolean;
    showSnow?: boolean;
    opacity?: number;
    showTimestamp?: boolean;
    showTimeline?: boolean;
    refreshIntervalMs?: number;
    mapStyle?: string;
    animate?: boolean;
  }>(mod, screenId);
  const animate = c.animate !== false;

  const MAP_STYLE_OPTIONS = [
    { value: 'dark', label: t('configSections.rain-map.styleDark') },
    { value: 'standard', label: t('configSections.rain-map.styleStandard') },
    // The same faded map, and the same words for it, as the Full-Screen
    // Weather map card.
    { value: 'light', label: t('configSections.fullscreen-weather.mapStyleLight') },
  ] as const;

  return (
    <>
      <RainLikelyShortcut mod={mod} screenId={screenId} />
      <LabeledInput
        label={t('configSections.rain-map.latitude')}
        type="number"
        step="0.01"
        value={c.latitude ?? 0}
        onChange={(v) => set({ latitude: Number(v) })}
      />
      <LabeledInput
        label={t('configSections.rain-map.longitude')}
        type="number"
        step="0.01"
        value={c.longitude ?? 0}
        onChange={(v) => set({ longitude: Number(v) })}
      />
      <Slider label={t('configSections.rain-map.zoom')} value={c.zoom ?? 6} min={1} max={12} step={1} onChange={(v) => set({ zoom: v })} />
      <Toggle label={t('configSections.fullscreen-weather.mapAnimate')} checked={animate} onChange={(v) => set({ animate: v })} />
      {/* A still map has no loop to time and no timeline to draw. */}
      {animate && (
        <>
          <Slider label={t('configSections.rain-map.animationSpeed')} value={c.animationSpeedMs ?? 500} min={200} max={2000} step={100} onChange={(v) => set({ animationSpeedMs: v })} />
          <Slider label={t('configSections.rain-map.endPause')} value={c.extraDelayLastFrameMs ?? 2000} min={0} max={5000} step={500} onChange={(v) => set({ extraDelayLastFrameMs: v })} />
        </>
      )}
      <Slider label={t('configSections.rain-map.radarOpacity')} value={Math.round((c.opacity ?? 0.7) * 100)} min={10} max={100} step={5} onChange={(v) => set({ opacity: v / 100 })} />
      <Toggle label={t('configSections.rain-map.smoothRadar')} checked={c.smooth !== false} onChange={(v) => set({ smooth: v })} />
      <Toggle label={t('configSections.rain-map.showSnow')} checked={c.showSnow !== false} onChange={(v) => set({ showSnow: v })} />
      <Toggle label={t('configSections.rain-map.showTimestamp')} checked={c.showTimestamp !== false} onChange={(v) => set({ showTimestamp: v })} />
      {animate && (
        <Toggle label={t('configSections.rain-map.showTimeline')} checked={c.showTimeline !== false} onChange={(v) => set({ showTimeline: v })} />
      )}
      <LabeledSelect
        label={t('configSections.rain-map.mapStyle')}
        value={c.mapStyle ?? 'dark'}
        onChange={(v) => set({ mapStyle: v })}
        options={MAP_STYLE_OPTIONS}
      />
      <RefreshIntervalSlider value={c.refreshIntervalMs} onChange={(ms) => set({ refreshIntervalMs: ms })} fetchKey="rain-map" fallbackMs={600_000} unit="minutes" min={5} max={30} step={5} />
      <p className="text-xs text-hs-text-faint">{t('configSections.rain-map.locationHelp')}</p>
    </>
  );
}
