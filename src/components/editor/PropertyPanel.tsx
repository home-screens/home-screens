'use client';

import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import Button from '@/components/ui/Button';
import BackgroundPicker from '@/components/editor/BackgroundPicker';
import ScreenSettingsSection from './ScreenSettingsSection';
import SectionDivider from './SectionDivider';
import PropertyGroup from './PropertyGroup';
import { ScheduleSection } from '@/components/editor/ScheduleSection';
import VisibilityConditionsSection from '@/components/editor/VisibilityConditionsSection';
import { isStateProducerType } from '@/lib/provided-state-keys';
import type { BuiltinModuleType, ModuleInstance } from '@/types/config';
import { usePluginStore } from '@/stores/plugin-store';
import { getModuleDefinition } from '@/lib/module-registry';
import { useTranslate, type TranslateFn } from '@/i18n';
import PluginConfigRenderer from './PluginConfigRenderer';
import PluginSecretsSection from './PluginSecretsSection';
import { MousePointerClick } from 'lucide-react';
import AccordionSection from './AccordionSection';
import FontFamilyPicker from '@/components/ui/FontFamilyPicker';

import {
  ClockConfigSection,
  CalendarConfigSection,
  WeatherConfigSection,
  CountdownConfigSection,
  DadJokeConfigSection,
  TextConfigSection,
  ImageConfigSection,
  VideoConfigSection,
  QuoteConfigSection,
  TodoConfigSection,
  StickyNoteConfigSection,
  GreetingConfigSection,
  NewsConfigSection,
  StockTickerConfigSection,
  CryptoConfigSection,
  HistoryConfigSection,
  MoonPhaseConfigSection,
  SunriseSunsetConfigSection,
  PhotoSlideshowConfigSection,
  QRCodeConfigSection,
  YearProgressConfigSection,
  TrafficConfigSection,
  SportsConfigSection,
  AirQualityConfigSection,
  TodoistConfigSection,
  RainMapConfigSection,
  GarbageDayConfigSection,
  MultiMonthConfigSection,
  StandingsConfigSection,
  AffirmationsConfigSection,
  DateConfigSection,
  MealPlannerConfigSection,
  IframeConfigSection,
  IconConfigSection,
  ShapeConfigSection,
  ChoreChartConfigSection,
  FullscreenCalendarConfigSection,
  FullscreenChoreChartConfigSection,
  FullscreenMealPlannerConfigSection,
  FullscreenPhotoConfigSection,
  WordOfDayConfigSection,
  DisplayControlConfigSection,
} from '@/components/editor/config-sections';

// Shared input classes — single source of truth lives in ui/input-classes.ts
import { INPUT_CLASS, NESTED_INPUT_CLASS } from '@/components/ui/input-classes';
export { INPUT_CLASS, NESTED_INPUT_CLASS };

function PositionSection({ mod, screenId, t }: { mod: ModuleInstance; screenId: string; t: TranslateFn }) {
  const { moveModule, resizeModule } = useEditorStore();
  return (
    <>
      <PropertyGroup title={t('propertyPanel.sections.position')} accent={1}>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: t('propertyPanel.fields.x'), value: mod.position.x, key: 'x' as const },
            { label: t('propertyPanel.fields.y'), value: mod.position.y, key: 'y' as const },
          ].map(({ label, value, key }) => (
            <label key={key} className="flex flex-col gap-0.5">
              <span className="text-xs text-hs-text-muted">{label}</span>
              <input
                type="number"
                value={value}
                onChange={(e) =>
                  moveModule(screenId, mod.id, {
                    ...mod.position,
                    [key]: Number(e.target.value),
                  })
                }
                className={INPUT_CLASS}
              />
            </label>
          ))}
        </div>
      </PropertyGroup>
      <PropertyGroup title={t('propertyPanel.sections.size')} accent={2}>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: t('propertyPanel.fields.w'), value: mod.size.w, key: 'w' as const },
            { label: t('propertyPanel.fields.h'), value: mod.size.h, key: 'h' as const },
          ].map(({ label, value, key }) => (
            <label key={key} className="flex flex-col gap-0.5">
              <span className="text-xs text-hs-text-muted">{label}</span>
              <input
                type="number"
                value={value}
                onChange={(e) =>
                  resizeModule(screenId, mod.id, {
                    ...mod.size,
                    [key]: Number(e.target.value),
                  })
                }
                className={INPUT_CLASS}
              />
            </label>
          ))}
        </div>
      </PropertyGroup>
    </>
  );
}

function StyleSection({ mod, screenId, t }: { mod: ModuleInstance; screenId: string; t: TranslateFn }) {
  const { updateModuleStyle } = useEditorStore();
  const s = mod.style;
  const set = (updates: Partial<typeof s>) => updateModuleStyle(screenId, mod.id, updates);

  return (
    <>
      <PropertyGroup title={t('propertyPanel.sections.shape')} accent={1}>
        <div className="space-y-3">
          <Slider label={t('propertyPanel.fields.borderRadius')} value={s.borderRadius} min={0} max={50} onChange={(v) => set({ borderRadius: v })} />
          <Slider label={t('propertyPanel.fields.padding')} value={s.padding} min={0} max={64} onChange={(v) => set({ padding: v })} />
          <Slider label={t('propertyPanel.fields.borderWidth')} value={s.borderWidth ?? 0} min={0} max={4} onChange={(v) => set({ borderWidth: v })} />
        </div>
      </PropertyGroup>

      <PropertyGroup title={t('propertyPanel.sections.effects')} accent={2}>
        <div className="space-y-3">
          <Slider label={t('propertyPanel.fields.opacity')} value={s.opacity} min={0} max={1} step={0.05} onChange={(v) => set({ opacity: v })} />
          <Slider label={t('propertyPanel.fields.backdropBlur')} value={s.backdropBlur} min={0} max={40} step={0.5} onChange={(v) => set({ backdropBlur: v })} />
          <Slider label={t('propertyPanel.fields.shadowSize')} value={s.shadowSize ?? 0} min={0} max={48} onChange={(v) => set({ shadowSize: v })} />
        </div>
      </PropertyGroup>

      <PropertyGroup title={t('fields.color')} accent={3}>
        <div className="space-y-3">
          <ColorPicker label={t('propertyPanel.fields.background')} value={s.backgroundColor} onChange={(v) => set({ backgroundColor: v })} />
          <ColorPicker label={t('propertyPanel.fields.borderColor')} value={s.borderColor ?? 'rgba(255, 255, 255, 0.15)'} onChange={(v) => set({ borderColor: v })} />
          <ColorPicker label={t('propertyPanel.fields.textColor')} value={s.textColor} onChange={(v) => set({ textColor: v })} />
        </div>
      </PropertyGroup>

      <PropertyGroup title={t('propertyPanel.sections.text')} accent={4}>
        <div className="space-y-3">
          <Slider label={t('propertyPanel.fields.fontSize')} value={s.fontSize} min={8} max={72} onChange={(v) => set({ fontSize: v })} />
          <FontFamilyPicker value={s.fontFamily} onChange={(v) => set({ fontFamily: v })} />
        </div>
      </PropertyGroup>
    </>
  );
}


type ConfigSectionFC = React.FC<{ mod: ModuleInstance; screenId: string }>;

// Keyed by BuiltinModuleType so a module added without a config section is a
// compile error, not a silently empty property panel.
export const CONFIG_SECTIONS: Record<BuiltinModuleType, ConfigSectionFC> = {
  clock: ClockConfigSection,
  calendar: CalendarConfigSection,
  weather: WeatherConfigSection,
  countdown: CountdownConfigSection,
  'dad-joke': DadJokeConfigSection,
  text: TextConfigSection,
  image: ImageConfigSection,
  video: VideoConfigSection,
  quote: QuoteConfigSection,
  todo: TodoConfigSection,
  'sticky-note': StickyNoteConfigSection,
  greeting: GreetingConfigSection,
  news: NewsConfigSection,
  'stock-ticker': StockTickerConfigSection,
  crypto: CryptoConfigSection,
  history: HistoryConfigSection,
  'moon-phase': MoonPhaseConfigSection,
  'sunrise-sunset': SunriseSunsetConfigSection,
  'photo-slideshow': PhotoSlideshowConfigSection,
  'qr-code': QRCodeConfigSection,
  'year-progress': YearProgressConfigSection,
  traffic: TrafficConfigSection,
  sports: SportsConfigSection,
  'air-quality': AirQualityConfigSection,
  'word-of-day': WordOfDayConfigSection,
  todoist: TodoistConfigSection,
  'rain-map': RainMapConfigSection,
  'multi-month': MultiMonthConfigSection,
  'garbage-day': GarbageDayConfigSection,
  standings: StandingsConfigSection,
  affirmations: AffirmationsConfigSection,
  date: DateConfigSection,
  'meal-planner': MealPlannerConfigSection,
  iframe: IframeConfigSection,
  icon: IconConfigSection,
  shape: ShapeConfigSection,
  'chore-chart': ChoreChartConfigSection,
  'fullscreen-calendar': FullscreenCalendarConfigSection,
  'fullscreen-chore-chart': FullscreenChoreChartConfigSection,
  'fullscreen-meal-planner': FullscreenMealPlannerConfigSection,
  'fullscreen-photo': FullscreenPhotoConfigSection,
  'display-control': DisplayControlConfigSection,
};

export default function PropertyPanel() {
  const t = useTranslate('editor');
  const { config, selectedDisplayId, selectedScreenId, selectedModuleId, removeModule, updateModule } = useEditorStore();
  const pluginMap = usePluginStore((s) => s.plugins);

  const activeScreens = config ? getActiveScreens(config, selectedDisplayId) : [];
  const currentScreen = activeScreens.find((s) => s.id === selectedScreenId);
  const selectedModule = currentScreen?.modules.find((m) => m.id === selectedModuleId);

  if (!selectedModule || !selectedScreenId) {
    return (
      <div className="w-72 flex-shrink-0 bg-hs-panel border-l border-hs-border-strong p-4 overflow-y-auto">
        <div className="flex flex-col items-center gap-2 py-6 text-hs-text-faint mb-5">
          <MousePointerClick size={28} strokeWidth={1.5} className="opacity-30" />
          <p className="text-sm">{t('propertyPanel.emptyState')}</p>
        </div>
        <div>
          <ScreenSettingsSection />
          <SectionDivider />
          <BackgroundPicker />
        </div>
      </div>
    );
  }

  const isPlugin = selectedModule.type.startsWith('plugin:');
  const pluginDef = isPlugin ? getModuleDefinition(selectedModule.type) : undefined;
  const loadedPlugin = isPlugin ? pluginMap.get(selectedModule.type) : undefined;

  // Priority: built-in section > plugin custom section > schema renderer > null
  const BuiltinConfigSection =
    (CONFIG_SECTIONS as Partial<Record<string, ConfigSectionFC>>)[selectedModule.type] ?? null;
  const pluginConfigSection = !BuiltinConfigSection ? loadedPlugin?.configSection : undefined;
  const hasSchemaFallback = !BuiltinConfigSection && !pluginConfigSection && isPlugin && pluginDef?.configSchema;

  const moduleDef = getModuleDefinition(selectedModule.type);
  const moduleLabel = isPlugin
    ? (pluginDef?.label ?? (selectedModule.type.charAt(0).toUpperCase() + selectedModule.type.slice(1)))
    : t(`registry.types.${selectedModule.type}`);

  return (
    <div className="w-72 flex-shrink-0 bg-hs-panel border-l border-hs-border-strong p-4 overflow-y-auto">
      <div className="space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-hs-text-body mb-3">
            {t('propertyPanel.moduleHeading', { name: moduleLabel })}
          </h3>
          {isPlugin && !loadedPlugin && (
            <p className="text-xs text-hs-warning mb-2">{t('propertyPanel.pluginNotLoaded')}</p>
          )}
        </div>

        {!moduleDef?.fillsCanvas && (
          <AccordionSection title={t('propertyPanel.sections.positionAndSize')} defaultOpen={false}>
            <PositionSection mod={selectedModule} screenId={selectedScreenId} t={t} />
          </AccordionSection>
        )}
        {!moduleDef?.fillsCanvas && (
          <AccordionSection title={t('propertyPanel.sections.style')} defaultOpen={false}>
            <StyleSection mod={selectedModule} screenId={selectedScreenId} t={t} />
          </AccordionSection>
        )}

        {BuiltinConfigSection && (
          <AccordionSection title={t('propertyPanel.sections.config')}>
            <PropertyGroup title={t('propertyPanel.sections.settings')} accent={1}>
              <div className="space-y-3">
                <BuiltinConfigSection mod={selectedModule} screenId={selectedScreenId} />
              </div>
            </PropertyGroup>
          </AccordionSection>
        )}
        {pluginConfigSection && (() => {
          const PluginConfig = pluginConfigSection;
          return (
            <AccordionSection title={t('propertyPanel.sections.config')}>
              <PropertyGroup title={t('propertyPanel.sections.settings')} accent={1}>
                <div className="space-y-3">
                  <PluginConfig
                    config={selectedModule.config}
                    onChange={(updates: Record<string, unknown>) =>
                      updateModule(selectedScreenId, selectedModule.id, {
                        config: { ...selectedModule.config, ...updates },
                      })
                    }
                    moduleId={selectedModule.id}
                    screenId={selectedScreenId}
                  />
                </div>
              </PropertyGroup>
            </AccordionSection>
          );
        })()}
        {hasSchemaFallback && (
          <AccordionSection title={t('propertyPanel.sections.config')}>
            <PropertyGroup title={t('propertyPanel.sections.settings')} accent={1}>
              <div className="space-y-3">
                <PluginConfigRenderer mod={selectedModule} screenId={selectedScreenId} schema={pluginDef!.configSchema!} />
              </div>
            </PropertyGroup>
          </AccordionSection>
        )}

        {isPlugin && loadedPlugin?.manifest.secrets && loadedPlugin.manifest.secrets.length > 0 && (
          <AccordionSection title={t('propertyPanel.sections.secrets')} defaultOpen={false}>
            <PropertyGroup title={t('propertyPanel.sections.credentials')} accent={2}>
              <div className="space-y-3">
                <PluginSecretsSection
                  pluginId={loadedPlugin.manifest.id}
                  secrets={loadedPlugin.manifest.secrets}
                />
              </div>
            </PropertyGroup>
          </AccordionSection>
        )}

        <AccordionSection title={t('propertyPanel.sections.visibility')} defaultOpen={false}>
          <PropertyGroup title={t('propertyPanel.sections.settings')} accent={3}>
            <label htmlFor={`module-enabled-toggle-${selectedModule.id}`} className="flex items-start gap-2 cursor-pointer text-sm">
              <input
                id={`module-enabled-toggle-${selectedModule.id}`}
                type="checkbox"
                className="mt-0.5"
                checked={selectedModule.enabled !== false}
                aria-describedby={`module-enabled-help-${selectedModule.id}`}
                onChange={(e) =>
                  updateModule(selectedScreenId, selectedModule.id, {
                    // Omit the field entirely when re-enabling so configs stay clean.
                    enabled: e.target.checked ? undefined : false,
                  })
                }
              />
              <span className="block">{t('propertyPanel.visibility.enabledLabel')}</span>
            </label>
            <p id={`module-enabled-help-${selectedModule.id}`} className="text-xs text-hs-text-dim mt-1 ml-6">
              {t('propertyPanel.visibility.enabledHelp')}
            </p>
            {isStateProducerType(selectedModule.type) && (
              <>
                <label htmlFor={`module-bg-provider-toggle-${selectedModule.id}`} className="flex items-start gap-2 cursor-pointer text-sm mt-3">
                  <input
                    id={`module-bg-provider-toggle-${selectedModule.id}`}
                    type="checkbox"
                    className="mt-0.5"
                    checked={selectedModule.backgroundProvider === true}
                    aria-describedby={`module-bg-provider-help-${selectedModule.id}`}
                    onChange={(e) =>
                      updateModule(selectedScreenId, selectedModule.id, {
                        // Omit the field entirely when off so configs stay clean.
                        backgroundProvider: e.target.checked ? true : undefined,
                      })
                    }
                  />
                  <span className="block">{t('propertyPanel.visibility.backgroundProviderLabel')}</span>
                </label>
                <p id={`module-bg-provider-help-${selectedModule.id}`} className="text-xs text-hs-text-dim mt-1 ml-6">
                  {t('propertyPanel.visibility.backgroundProviderHelp')}
                </p>
              </>
            )}
          </PropertyGroup>
        </AccordionSection>

        <AccordionSection title={t('propertyPanel.sections.schedule')} defaultOpen={false}>
          <ScheduleSection mod={selectedModule} screenId={selectedScreenId} />
        </AccordionSection>

        <AccordionSection title={t('propertyPanel.sections.conditions')} defaultOpen={false}>
          <VisibilityConditionsSection mod={selectedModule} screenId={selectedScreenId} />
        </AccordionSection>

        <div className="pt-3 border-t border-hs-border-strong">
          <Button
            variant="danger"
            className="w-full"
            onClick={async () => {
              if (await useConfirmStore.getState().confirm(t('propertyPanel.actions.confirmDelete'))) {
                removeModule(selectedScreenId, selectedModule.id);
              }
            }}
          >
            {t('propertyPanel.actions.delete')}
          </Button>
        </div>

      </div>
    </div>
  );
}
