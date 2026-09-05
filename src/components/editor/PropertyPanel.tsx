'use client';

import { useState } from 'react';

import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { useEditorSharedState } from '@/hooks/useEditorSharedState';
import { useTZClock } from '@/hooks/useTZClock';
import ModuleStatusChips from './ModuleStatusChips';
import { useConfirmStore } from '@/stores/confirm-store';
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import Button from '@/components/ui/Button';
import BackgroundPicker from '@/components/editor/BackgroundPicker';
import ScreenSettingsSection from './ScreenSettingsSection';
import SectionDivider from './SectionDivider';
import FirstRunChecklist from './FirstRunChecklist';
import { LocationStatusRow } from './config-sections/LocationStatusRow';
import PropertyGroup from './PropertyGroup';
import { ScheduleSection } from '@/components/editor/ScheduleSection';
import VisibilityConditionsSection from '@/components/editor/VisibilityConditionsSection';
import { isStateProducerType } from '@/lib/provided-state-keys';
import { stackExtremes } from '@/lib/module-utils';
import type { BuiltinModuleType, ModuleInstance } from '@/types/config';
import { usePluginStore } from '@/stores/plugin-store';
import { getModuleDefinition, resolveModuleDescription, resolveModuleLabel, styleReachesModule } from '@/lib/module-registry';
import { moduleDocsUrl } from '@/lib/module-docs';
import { useTranslate, type TranslateFn } from '@/i18n';
import PluginConfigRenderer from './PluginConfigRenderer';
import ModuleErrorBoundary from '@/components/ModuleErrorBoundary';
import PluginSecretsSection from './PluginSecretsSection';
import PluginAuthSection from './PluginAuthSection';
import { MousePointerClick, ChevronLeft, HelpCircle, Monitor, PanelRight, PanelRightClose, Sliders } from 'lucide-react';
import AccordionSection from './AccordionSection';
import FontFamilyPicker from '@/components/ui/FontFamilyPicker';
import LabeledField from '@/components/ui/LabeledField';
import { resolveTitleFontSize } from '@/lib/module-style';

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
  FullscreenNewsConfigSection,
  FullscreenWeatherConfigSection,
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

/**
 * Card Title input. Commits the TRIMMED value on every keystroke — so a tab
 * closed mid-edit can never persist padding or a whitespace-only title, and
 * no blur-time write lands outside the undo coalesce window — while a local
 * draft keeps the raw text in the input, so typing the space between two
 * words isn't eaten mid-entry. Rendered with key={mod.id} so the draft resets
 * when the selection changes.
 */
function CardTitleField({ label, value, onCommit }: { label: string; value: string; onCommit: (title: string | undefined) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <LabeledField label={label}>
      <input
        type="text"
        value={draft ?? value}
        onChange={(e) => {
          setDraft(e.target.value);
          onCommit(e.target.value.trim() || undefined);
        }}
        onBlur={() => setDraft(null)}
        className={INPUT_CLASS}
      />
    </LabeledField>
  );
}

/**
 * The one title control, at the top of Module settings.
 *
 * A card title (`style.title`) and a module's own heading (`config.showTitle`)
 * used to be separate switches three sections apart, so setting both showed
 * two headings and the panel apologised for it in prose. One picker makes the
 * pair a single choice; the underlying fields are unchanged, so no layout
 * needs migrating.
 */
type TitleMode = 'own' | 'custom' | 'none';

function deriveTitleMode(mod: ModuleInstance, hasOwnTitle: boolean): TitleMode {
  if (mod.style.title?.trim()) return 'custom';
  if (hasOwnTitle && mod.config.showTitle !== false) return 'own';
  return 'none';
}

// Some module types render `config.showTitle` only in certain views — the
// per-section Toggles this control replaced each gated on exactly these
// views, so the picker must too, or "The module's own title" becomes an
// option that silently does nothing.
const VIEWS_WITHOUT_OWN_TITLE: Partial<Record<BuiltinModuleType, string[]>> = {
  weather: ['current', 'combined', 'compact', 'precipitation', 'alerts'],
  news: ['ticker', 'compact'],
  'meal-planner': ['week', 'next-meal', 'compact', 'list'],
};

function moduleHasOwnTitleForView(mod: ModuleInstance, hasOwnTitle: boolean): boolean {
  if (!hasOwnTitle) return false;
  const unsupportedViews = VIEWS_WITHOUT_OWN_TITLE[mod.type as BuiltinModuleType];
  if (!unsupportedViews) return true;
  const view = (mod.config as { view?: string }).view;
  return view === undefined || !unsupportedViews.includes(view);
}

function TitleControl({ mod, screenId, t }: { mod: ModuleInstance; screenId: string; t: TranslateFn }) {
  const { updateModuleStyle, updateModule } = useEditorStore();
  const def = getModuleDefinition(mod.type);
  const hasOwnTitle = moduleHasOwnTitleForView(mod, !!def?.hasOwnTitle);
  const derived = deriveTitleMode(mod, hasOwnTitle);
  // Held locally so clearing the text box mid-edit doesn't yank the box away
  // (an empty custom title derives as "none"). Reset per module — see the
  // key={mod.id} at the call site.
  const [mode, setMode] = useState<TitleMode>(derived);
  const shownMode = mode === 'custom' || derived === 'custom' ? mode : derived;

  const setStyle = (updates: Partial<ModuleInstance['style']>) => updateModuleStyle(screenId, mod.id, updates);
  const setShowTitle = (showTitle: boolean | undefined) => {
    if (!hasOwnTitle) return;
    updateModule(screenId, mod.id, { config: { ...mod.config, showTitle } });
  };

  const pick = (next: TitleMode) => {
    setMode(next);
    if (next === 'own') {
      setStyle({ title: undefined, titleFontSize: undefined });
      setShowTitle(undefined);
    } else if (next === 'none') {
      setStyle({ title: undefined, titleFontSize: undefined });
      setShowTitle(false);
    } else {
      // Seed with the module's name so the strip appears immediately and the
      // user edits words rather than facing an empty box that renders nothing.
      setStyle({ title: mod.style.title?.trim() || resolveModuleLabel(mod.type, t) });
      setShowTitle(false);
    }
  };

  return (
    <div className="space-y-2" data-testid="module-title-control">
      <LabeledField label={t('propertyPanel.fields.title')}>
        <select
          value={shownMode}
          onChange={(e) => pick(e.target.value as TitleMode)}
          className={INPUT_CLASS}
          aria-label={t('propertyPanel.fields.title')}
        >
          {hasOwnTitle && <option value="own">{t('propertyPanel.fields.titleModeOwn')}</option>}
          <option value="custom">{t('propertyPanel.fields.titleModeCustom')}</option>
          <option value="none">{t('propertyPanel.fields.titleModeNone')}</option>
        </select>
      </LabeledField>
      {shownMode === 'custom' && (
        <>
          <CardTitleField
            key={mod.id}
            label={t('propertyPanel.fields.titleWords')}
            value={mod.style.title ?? ''}
            onCommit={(title) =>
              // Clearing the words also drops the size: the strip is gone, so a
              // stale titleFontSize must not outlive it and surprise a title
              // added later.
              setStyle(title === undefined ? { title: undefined, titleFontSize: undefined } : { title })
            }
          />
          {!!mod.style.title?.trim() && (
            <div>
              {/* Rests at the module's font size (the fallback) so the
                  slider's starting position is the rendered truth. */}
              <Slider label={t('propertyPanel.fields.titleFontSize')} value={resolveTitleFontSize(mod.style)} min={8} max={72} onChange={(v) => setStyle({ titleFontSize: v })} />
              {mod.style.titleFontSize != null && (
                <button
                  type="button"
                  onClick={() => setStyle({ titleFontSize: undefined })}
                  className="mt-1 text-[11px] text-hs-text-muted hover:text-hs-text-body transition-colors"
                >
                  {t('propertyPanel.fields.fontWeightReset')}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StyleSection({ mod, screenId, t }: { mod: ModuleInstance; screenId: string; t: TranslateFn }) {
  const { updateModuleStyle } = useEditorStore();
  const s = mod.style;
  const set = (updates: Partial<typeof s>) => updateModuleStyle(screenId, mod.id, updates);
  // Plugin components render raw (never inside ModuleWrapper), so the
  // class-based font weight override cannot reach them — hide the control
  // rather than show a slider that does nothing.
  const isPlugin = mod.type.startsWith('plugin:');
  // A module that fits its text to its box gets a percent slider (textScale)
  // and no pixel slider: its pixel size is only a readability floor, and
  // offering it as "font size" is how a pixel value once got read as a
  // multiplier. Every other module gets the pixel slider, which is exactly
  // its text size. Plugins scale their own units and get the pixel slider
  // with no hint.
  const def = getModuleDefinition(mod.type);
  const autoSizesText = !!def?.autoSizesText;
  // Controls for fields the module paints from its own settings are hidden,
  // not offered inert (see ModuleDefinition.ownsStyleFields).
  const owned = new Set(def?.ownsStyleFields ?? []);

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
          {!owned.has('backgroundColor') && (
            <ColorPicker label={t('propertyPanel.fields.background')} value={s.backgroundColor} onChange={(v) => set({ backgroundColor: v })} />
          )}
          <ColorPicker label={t('propertyPanel.fields.borderColor')} value={s.borderColor ?? 'rgba(255, 255, 255, 0.15)'} onChange={(v) => set({ borderColor: v })} />
          {!owned.has('textColor') && (
            <ColorPicker label={t('propertyPanel.fields.textColor')} value={s.textColor} onChange={(v) => set({ textColor: v })} />
          )}
        </div>
      </PropertyGroup>

      <PropertyGroup title={t('propertyPanel.sections.text')} accent={4}>
        <div className="space-y-3">
          {/* The title lives in Module settings, next to the module's own
              "show my title" option, so the two can't be set to fight. */}
          {autoSizesText ? (
            <div>
              <Slider
                label={t('propertyPanel.fields.textScale')}
                value={s.textScale ?? 100}
                min={50}
                max={200}
                step={5}
                displayValue={`${s.textScale ?? 100}%`}
                // 100 is stored as absent, so an untouched module carries no key.
                onChange={(v) => set({ textScale: v === 100 ? undefined : v })}
              />
              <p data-testid="font-size-hint" className="text-[11px] text-hs-text-dim mt-1">
                {t('propertyPanel.fields.textScaleHint')}
              </p>
            </div>
          ) : (
            <div>
              <Slider label={t('propertyPanel.fields.fontSize')} value={s.fontSize} min={8} max={72} onChange={(v) => set({ fontSize: v })} />
              {!isPlugin && (
                <p data-testid="font-size-hint" className="text-[11px] text-hs-text-dim mt-1">
                  {t('propertyPanel.fields.fontSizeHint')}
                </p>
              )}
            </div>
          )}
          {!isPlugin && (
            <div
              // A range input fires no change event when released at its current
              // position, and the unset thumb parks at 400 — so explicit 400
              // (flatten to normal) would be unreachable in one gesture without
              // this pointer-up commit.
              onPointerUp={(e) => {
                if (s.fontWeight != null) return;
                const target = e.target as HTMLElement;
                if (target instanceof HTMLInputElement && target.type === 'range') {
                  set({ fontWeight: Number(target.value) });
                }
              }}
            >
              <Slider label={t('propertyPanel.fields.fontWeight')} value={s.fontWeight ?? 400} min={100} max={900} step={100} displayValue={s.fontWeight != null ? `${s.fontWeight}` : t('propertyPanel.fields.fontWeightDefault')} onChange={(v) => set({ fontWeight: v })} />
              {s.fontWeight != null && (
                <button
                  type="button"
                  onClick={() => set({ fontWeight: undefined })}
                  className="mt-1 text-[11px] text-hs-text-muted hover:text-hs-text-body transition-colors"
                >
                  {t('propertyPanel.fields.fontWeightReset')}
                </button>
              )}
            </div>
          )}
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
  'fullscreen-news': FullscreenNewsConfigSection,
  'fullscreen-weather': FullscreenWeatherConfigSection,
  'display-control': DisplayControlConfigSection,
};

/**
 * Which display these edits land on, in the panel that shows what is selected.
 * Multi-display only: with one display the answer is never in doubt, and a
 * legacy install must look exactly as it used to.
 */
function PanelCollapseButton({ onCollapse, t }: { onCollapse?: () => void; t: TranslateFn }) {
  if (!onCollapse) return null;
  return (
    <div className="mb-1 flex justify-end">
      <button
        type="button"
        onClick={onCollapse}
        title={t('propertyPanel.collapseTitle')}
        aria-label={t('propertyPanel.collapseTitle')}
        data-testid="property-panel-collapse"
        className="-mr-1 rounded p-1 text-hs-text-faint hover:bg-hs-hover hover:text-hs-text-body transition-colors"
      >
        <PanelRightClose className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function EditingDisplayRow() {
  const t = useTranslate('editor');
  const { config, selectedDisplayId } = useEditorStore();
  const displays = config?.displays ?? [];
  if (displays.length === 0) return null;
  const active = displays.find((d) => d.id === selectedDisplayId) ?? displays[0];
  return (
    <div className="mb-3 flex items-center gap-2 text-xs text-hs-text-muted" data-testid="editing-display">
      <Monitor className="h-3 w-3 shrink-0 text-hs-text-faint" aria-hidden="true" />
      <span className="min-w-0 truncate">
        {t('propertyPanel.editingDisplay')}{' '}
        <span className="font-semibold text-hs-text-body">{active.name}</span>
      </span>
    </div>
  );
}

export default function PropertyPanel({
  collapsed = false,
  onExpand,
  onCollapse,
}: {
  /** Rail mode: a 44px strip instead of the 288px panel. */
  collapsed?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
} = {}) {
  const t = useTranslate('editor');
  const { config, selectedDisplayId, selectedScreenId, selectedModuleId, selectModule, removeModule, duplicateModule, updateModule, reorderModule } = useEditorStore();
  const pluginMap = usePluginStore((s) => s.plugins);
  // Same clock and live values the canvas badges use, so the chip here and the
  // badge over there always agree. The poll is armed only while the selected
  // module actually has conditions: the shared-state GET also switches the
  // display into fast re-reporting, so an idle panel must not hold it open.

  const activeScreens = config ? getActiveScreens(config, selectedDisplayId) : [];
  const currentScreen = activeScreens.find((s) => s.id === selectedScreenId);
  const selectedModule = currentScreen?.modules.find((m) => m.id === selectedModuleId);
  const conditioned = (selectedModule?.visibility?.conditions?.length ?? 0) > 0;
  // Only ticks the panel's clock while the selected module actually has
  // something time-dependent to show — an idle panel shouldn't re-render
  // every 60s for a module with no schedule or conditions.
  const now = useTZClock(config?.settings.timezone, 60_000, !!selectedModule?.schedule || conditioned);
  const liveState = useEditorSharedState(selectedDisplayId, conditioned);

  if (collapsed) {
    return (
      <div
        className="w-11 flex-shrink-0 bg-hs-panel border-l border-hs-border-strong flex flex-col items-center gap-1.5 py-2"
        data-testid="property-panel-rail"
      >
        <button
          type="button"
          onClick={onExpand}
          title={t('propertyPanel.expandTitle')}
          aria-label={t('propertyPanel.expandTitle')}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-hs-accent/35 bg-hs-accent-soft text-hs-accent-hover hover:bg-hs-accent/20 transition-colors"
        >
          <PanelRight className="h-3.5 w-3.5" />
        </button>
        <div className="my-0.5 h-px w-6 bg-hs-border-strong" />
        <button
          type="button"
          onClick={onExpand}
          title={selectedModule ? resolveModuleLabel(selectedModule.type, t) : t('screenSettings.sectionTitle')}
          aria-label={selectedModule ? resolveModuleLabel(selectedModule.type, t) : t('screenSettings.sectionTitle')}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-hs-card text-hs-text-muted hover:bg-hs-hover hover:text-hs-text-body transition-colors"
        >
          <Sliders className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (!selectedModule || !selectedScreenId || !currentScreen) {
    // With no screen there is nothing for the screen settings or the
    // background picker to edit, and both render null — leaving the divider
    // alone in the panel as three unexplained dots.
    const hasScreen = !!currentScreen && !!selectedScreenId;
    return (
      <div className="w-72 flex-shrink-0 bg-hs-panel border-l border-hs-border-strong p-4 overflow-y-auto">
        <PanelCollapseButton onCollapse={onCollapse} t={t} />
        <EditingDisplayRow />
        <FirstRunChecklist />
        {hasScreen && (
          <div className="flex flex-col items-center gap-2 py-6 text-hs-text-faint mb-5">
            <MousePointerClick size={28} strokeWidth={1.5} className="opacity-30" />
            <p className="text-sm">{t('propertyPanel.emptyState')}</p>
          </div>
        )}
        {hasScreen && (
          <div>
            <ScreenSettingsSection />
            <SectionDivider />
            <BackgroundPicker />
          </div>
        )}
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
  // The title strip only exists inside ModuleWrapper's card: plugins, cardless
  // builtins (display-control) and full-screen modules never mount one, so
  // offering a title there would be a control with nothing to show.
  const showTitleControl = !isPlugin && !moduleDef?.cardless && !moduleDef?.fillsCanvas;
  // Style reaches a module one of two ways: ModuleWrapper's card, or the
  // module applying `style` itself. A `fillsCanvas` module has neither (it
  // paints the whole canvas from its own theme), and neither does a `cardless`
  // one — display-control does not even accept the prop, so every control in
  // the section was inert for it. Plugins DO get it: they render raw, but they
  // re-implement the card from `style` themselves, which is why only the
  // class-based weight override is hidden for them (see StyleSection).
  const showStyleControls = styleReachesModule(moduleDef);
  const { atFront, atBack } = stackExtremes(currentScreen.modules, selectedModule.id);
  const moduleLabel = resolveModuleLabel(selectedModule.type, t);
  const moduleDescription = resolveModuleDescription(selectedModule.type, t);
  const docsUrl = moduleDocsUrl(selectedModule.type);

  return (
    <div className="w-72 flex-shrink-0 bg-hs-panel border-l border-hs-border-strong p-4 overflow-y-auto">
      <PanelCollapseButton onCollapse={onCollapse} t={t} />
      <EditingDisplayRow />
      <div className="space-y-5">
        <div>
          {/* The screen's own settings live behind "nothing selected"; this
              is the way there that doesn't need an empty pixel to click. */}
          <button
            type="button"
            onClick={() => selectModule(null)}
            className="mb-2 -ml-1 flex items-center gap-0.5 rounded px-1 py-0.5 text-xs text-hs-text-muted hover:bg-hs-hover hover:text-hs-text-body"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {t('propertyPanel.screenSettingsLink')}
          </button>
          <div className="mb-2 flex items-start gap-2">
            <h3 className="text-sm font-semibold text-hs-text-body">
              {t('propertyPanel.moduleHeading', { name: moduleLabel })}
            </h3>
            {docsUrl && (
              <a
                href={docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto mt-0.5 flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-hs-accent-hover hover:underline"
              >
                <HelpCircle className="h-3 w-3" aria-hidden="true" />
                {t('propertyPanel.whatIsThis')}
              </a>
            )}
          </div>
          {/* One plain sentence saying what this module is for — the palette
              can only afford it as a tooltip, and here there is room. */}
          {moduleDescription && (
            <p className="mb-2 text-[11px] leading-relaxed text-hs-text-muted">{moduleDescription}</p>
          )}
          {/* Why this module is or isn't on the wall right now, in the one
              place with room for the reason. */}
          <div className="mb-3 empty:mb-0">
            <ModuleStatusChips
              mod={selectedModule}
              now={now}
              verdictStates={liveState.states}
              source={liveState.source}
              withDetail
            />
          </div>
          {isPlugin && !loadedPlugin && (
            <p className="text-xs text-hs-warning mb-2">{t('propertyPanel.pluginNotLoaded')}</p>
          )}
        </div>

        {!moduleDef?.fillsCanvas && (
          <AccordionSection title={t('propertyPanel.sections.positionAndSize')} defaultOpen={false}>
            <PositionSection mod={selectedModule} screenId={selectedScreenId} t={t} />
          </AccordionSection>
        )}
        {showStyleControls && (
          <AccordionSection title={t('propertyPanel.sections.style')} defaultOpen={false}>
            <StyleSection mod={selectedModule} screenId={selectedScreenId} t={t} />
          </AccordionSection>
        )}

        {/* One place, driven by the registry, so a location-bound module
            (built-in or plugin) cannot forget to say what it needs. */}
        {moduleDef?.dataRequirements?.some((r) => r === 'location' || r === 'weather') && !moduleDef.locationOptional && (
          <LocationStatusRow mod={selectedModule} />
        )}

        {(BuiltinConfigSection || showTitleControl) && (
          <AccordionSection title={t('propertyPanel.sections.config')}>
            <div className="space-y-3">
              {showTitleControl && (
                <TitleControl key={selectedModule.id} mod={selectedModule} screenId={selectedScreenId} t={t} />
              )}
              {BuiltinConfigSection && (
                <BuiltinConfigSection mod={selectedModule} screenId={selectedScreenId} />
              )}
            </div>
          </AccordionSection>
        )}
        {pluginConfigSection && (() => {
          const PluginConfig = pluginConfigSection;
          return (
            <AccordionSection title={t('propertyPanel.sections.config')}>
                <div className="space-y-3">
                  {/* A plugin ConfigSection is third-party render code running
                      inside the editor tree. Unbounded, a throw here unmounts
                      the whole editor and discards unsaved config edits. */}
                  {/* Keyed on the module id. Without it React preserves the
                      boundary instance across module selections (same element
                      position, same type), so `failed` stays true and every
                      OTHER plugin's settings render the fallback too — clearing
                      only on deselect or a switch to a built-in, which makes it
                      look intermittent and inexplicable. */}
                  <ModuleErrorBoundary
                    key={selectedModule.id}
                    moduleType={selectedModule.type}
                    fallbackText={t('propertyPanel.pluginConfigFailed')}
                  >
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
                  </ModuleErrorBoundary>
                </div>
            </AccordionSection>
          );
        })()}
        {hasSchemaFallback && (
          <AccordionSection title={t('propertyPanel.sections.config')}>
            <div className="space-y-3">
              <PluginConfigRenderer mod={selectedModule} screenId={selectedScreenId} schema={pluginDef!.configSchema!} />
            </div>
          </AccordionSection>
        )}

        {isPlugin && loadedPlugin?.manifest.auth && (() => {
          const auth = loadedPlugin.manifest.auth;
          // OAuth client credentials belong with the connect button, not the
          // general secrets list. Garmin has no such secrets.
          const authSecretKeys = auth.type === 'oauth2'
            ? [auth.secrets.clientId, auth.secrets.clientSecret].filter((k): k is string => Boolean(k))
            : [];
          const declaredSecrets = loadedPlugin.manifest.secrets ?? [];
          return (
            <AccordionSection title={t('propertyPanel.sections.connection')} defaultOpen>
              {authSecretKeys.length > 0 && (
                <PropertyGroup title={t('propertyPanel.sections.connectionSetup')} accent={2}>
                  <div className="space-y-3">
                    <PluginSecretsSection
                      pluginId={loadedPlugin.manifest.id}
                      secrets={declaredSecrets}
                      keyFilter={authSecretKeys}
                    />
                  </div>
                </PropertyGroup>
              )}
              <PropertyGroup title={t('propertyPanel.sections.settings')} accent={1}>
                <PluginAuthSection pluginId={loadedPlugin.manifest.id} auth={auth} />
              </PropertyGroup>
            </AccordionSection>
          );
        })()}

        {isPlugin && loadedPlugin?.manifest.secrets && loadedPlugin.manifest.secrets.length > 0 && (() => {
          // Exclude OAuth client credentials — they render under Connection.
          const auth = loadedPlugin.manifest.auth;
          const authSecretKeys = auth?.type === 'oauth2'
            ? [auth.secrets.clientId, auth.secrets.clientSecret].filter((k): k is string => Boolean(k))
            : [];
          const otherKeys = loadedPlugin.manifest.secrets
            .map((s) => s.key)
            .filter((k) => !authSecretKeys.includes(k));
          if (otherKeys.length === 0) return null;
          return (
            <AccordionSection title={t('propertyPanel.sections.secrets')} defaultOpen={false}>
              <PropertyGroup title={t('propertyPanel.sections.credentials')} accent={2}>
                <div className="space-y-3">
                  <PluginSecretsSection
                    pluginId={loadedPlugin.manifest.id}
                    secrets={loadedPlugin.manifest.secrets}
                    keyFilter={otherKeys}
                  />
                </div>
              </PropertyGroup>
            </AccordionSection>
          );
        })()}

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
            {(() => {
              // Plugins that export a stateProvider publish automatically —
              // the background flag is meaningless for them, so hide the
              // toggle. Instances still flagged (from before the plugin
              // adopted stateProvider) get a hint that they can be deleted,
              // plus the toggle so the flag can be switched off.
              const hasStateProvider = Boolean(loadedPlugin?.manifest.exports?.stateProvider);
              const isFlagged = selectedModule.backgroundProvider === true;
              if (hasStateProvider && !isFlagged) return null;
              if (!hasStateProvider && !isStateProducerType(selectedModule.type)) return null;
              return (
                <>
                  <label htmlFor={`module-bg-provider-toggle-${selectedModule.id}`} className="flex items-start gap-2 cursor-pointer text-sm mt-3">
                    <input
                      id={`module-bg-provider-toggle-${selectedModule.id}`}
                      type="checkbox"
                      className="mt-0.5"
                      checked={isFlagged}
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
                  {hasStateProvider && isFlagged && (
                    <p className="text-xs text-hs-warning mt-1 ml-6">
                      {t('propertyPanel.visibility.backgroundProviderObsoleteHint')}
                    </p>
                  )}
                </>
              );
            })()}
          </PropertyGroup>
        </AccordionSection>

        <AccordionSection title={t('propertyPanel.sections.schedule')} defaultOpen={false}>
          <ScheduleSection mod={selectedModule} screenId={selectedScreenId} />
        </AccordionSection>

        <AccordionSection title={t('propertyPanel.sections.conditions')} defaultOpen={false}>
          <VisibilityConditionsSection mod={selectedModule} screenId={selectedScreenId} />
        </AccordionSection>

        <div className="pt-3 border-t border-hs-border-strong space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={atFront}
              onClick={() => reorderModule(selectedScreenId, selectedModule.id, 'front')}
            >
              {t('propertyPanel.actions.bringToFront')}
            </Button>
            <Button
              disabled={atBack}
              onClick={() => reorderModule(selectedScreenId, selectedModule.id, 'back')}
            >
              {t('propertyPanel.actions.sendToBack')}
            </Button>
            <Button onClick={() => duplicateModule(selectedScreenId, selectedModule.id)}>
              {t('propertyPanel.actions.duplicate')}
            </Button>
            <Button
              variant="danger"
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
    </div>
  );
}
