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
import type { ModuleInstance } from '@/types/config';
import { usePluginStore } from '@/stores/plugin-store';
import { getModuleDefinition } from '@/lib/module-registry';
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

function PositionSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { moveModule, resizeModule } = useEditorStore();
  return (
    <>
      <PropertyGroup title="Position" accent={1}>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'X', value: mod.position.x, key: 'x' as const },
            { label: 'Y', value: mod.position.y, key: 'y' as const },
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
      <PropertyGroup title="Size" accent={2}>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'W', value: mod.size.w, key: 'w' as const },
            { label: 'H', value: mod.size.h, key: 'h' as const },
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

function StyleSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { updateModuleStyle } = useEditorStore();
  const s = mod.style;
  const set = (updates: Partial<typeof s>) => updateModuleStyle(screenId, mod.id, updates);

  return (
    <>
      <PropertyGroup title="Shape" accent={1}>
        <div className="space-y-3">
          <Slider label="Border Radius" value={s.borderRadius} min={0} max={50} onChange={(v) => set({ borderRadius: v })} />
          <Slider label="Padding" value={s.padding} min={0} max={64} onChange={(v) => set({ padding: v })} />
          <Slider label="Border Width" value={s.borderWidth ?? 0} min={0} max={4} onChange={(v) => set({ borderWidth: v })} />
        </div>
      </PropertyGroup>

      <PropertyGroup title="Effects" accent={2}>
        <div className="space-y-3">
          <Slider label="Opacity" value={s.opacity} min={0} max={1} step={0.05} onChange={(v) => set({ opacity: v })} />
          <Slider label="Backdrop Blur" value={s.backdropBlur} min={0} max={40} step={0.5} onChange={(v) => set({ backdropBlur: v })} />
          <Slider label="Shadow Size" value={s.shadowSize ?? 0} min={0} max={48} onChange={(v) => set({ shadowSize: v })} />
        </div>
      </PropertyGroup>

      <PropertyGroup title="Color" accent={3}>
        <div className="space-y-3">
          <ColorPicker label="Background" value={s.backgroundColor} onChange={(v) => set({ backgroundColor: v })} />
          <ColorPicker label="Border Color" value={s.borderColor ?? 'rgba(255, 255, 255, 0.15)'} onChange={(v) => set({ borderColor: v })} />
          <ColorPicker label="Text Color" value={s.textColor} onChange={(v) => set({ textColor: v })} />
        </div>
      </PropertyGroup>

      <PropertyGroup title="Text" accent={4}>
        <div className="space-y-3">
          <Slider label="Font Size" value={s.fontSize} min={8} max={72} onChange={(v) => set({ fontSize: v })} />
          <FontFamilyPicker value={s.fontFamily} onChange={(v) => set({ fontFamily: v })} />
        </div>
      </PropertyGroup>
    </>
  );
}


const CONFIG_SECTIONS: Record<string, React.FC<{ mod: ModuleInstance; screenId: string }>> = {
  clock: ClockConfigSection,
  calendar: CalendarConfigSection,
  weather: WeatherConfigSection,
  countdown: CountdownConfigSection,
  'dad-joke': DadJokeConfigSection,
  text: TextConfigSection,
  image: ImageConfigSection,
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
          <p className="text-sm">Select a module to edit</p>
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
  const BuiltinConfigSection = CONFIG_SECTIONS[selectedModule.type] ?? null;
  const pluginConfigSection = !BuiltinConfigSection ? loadedPlugin?.configSection : undefined;
  const hasSchemaFallback = !BuiltinConfigSection && !pluginConfigSection && isPlugin && pluginDef?.configSchema;

  const moduleDef = getModuleDefinition(selectedModule.type);
  const moduleLabel = pluginDef?.label
    ?? (selectedModule.type.charAt(0).toUpperCase() + selectedModule.type.slice(1));

  return (
    <div className="w-72 flex-shrink-0 bg-hs-panel border-l border-hs-border-strong p-4 overflow-y-auto">
      <div className="space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-hs-text-body mb-3">
            {moduleLabel} Module
          </h3>
          {isPlugin && !loadedPlugin && (
            <p className="text-xs text-hs-warning mb-2">Plugin not installed or failed to load</p>
          )}
        </div>

        {!moduleDef?.fillsCanvas && (
          <AccordionSection title="Position & Size" defaultOpen={false}>
            <PositionSection mod={selectedModule} screenId={selectedScreenId} />
          </AccordionSection>
        )}
        {!moduleDef?.fillsCanvas && (
          <AccordionSection title="Style" defaultOpen={false}>
            <StyleSection mod={selectedModule} screenId={selectedScreenId} />
          </AccordionSection>
        )}

        {BuiltinConfigSection && (
          <AccordionSection title="Config">
            <PropertyGroup title="Settings" accent={1}>
              <div className="space-y-3">
                <BuiltinConfigSection mod={selectedModule} screenId={selectedScreenId} />
              </div>
            </PropertyGroup>
          </AccordionSection>
        )}
        {pluginConfigSection && (() => {
          const PluginConfig = pluginConfigSection;
          return (
            <AccordionSection title="Config">
              <PropertyGroup title="Settings" accent={1}>
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
          <AccordionSection title="Config">
            <PropertyGroup title="Settings" accent={1}>
              <div className="space-y-3">
                <PluginConfigRenderer mod={selectedModule} screenId={selectedScreenId} schema={pluginDef!.configSchema!} />
              </div>
            </PropertyGroup>
          </AccordionSection>
        )}

        {isPlugin && loadedPlugin?.manifest.secrets && loadedPlugin.manifest.secrets.length > 0 && (
          <AccordionSection title="Secrets" defaultOpen={false}>
            <PropertyGroup title="Credentials" accent={2}>
              <div className="space-y-3">
                <PluginSecretsSection
                  pluginId={loadedPlugin.manifest.id}
                  secrets={loadedPlugin.manifest.secrets}
                />
              </div>
            </PropertyGroup>
          </AccordionSection>
        )}

        <AccordionSection title="Schedule" defaultOpen={false}>
          <ScheduleSection mod={selectedModule} screenId={selectedScreenId} />
        </AccordionSection>

        <div className="pt-3 border-t border-hs-border-strong">
          <Button
            variant="danger"
            className="w-full"
            onClick={async () => {
              if (await useConfirmStore.getState().confirm('Delete this module?')) {
                removeModule(selectedScreenId, selectedModule.id);
              }
            }}
          >
            Delete Module
          </Button>
        </div>

      </div>
    </div>
  );
}
