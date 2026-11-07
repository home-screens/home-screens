'use client';

import { useEffect, useRef, useState } from 'react';

import { useEditorStore } from '@/stores/editor-store';
import { getActiveScreens } from '@/lib/editor-multi-display';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
import { useEditorSharedState } from '@/hooks/useEditorSharedState';
import { moduleReadsLiveValues } from '@/lib/module-status';
import { useWallClock } from '@/hooks/useTZClock';
import ModuleStatusChips from './ModuleStatusChips';
import { useConfirmStore } from '@/stores/confirm-store';
import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
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
import { describeScreenContents } from '@/lib/screen-dock';
import { DEFAULT_GO_BACK_AFTER_MS, openedScreenTheme, screenHasOpener, showsOnlyWhenOpened } from '@/lib/on-demand-screen';
import { FULLSCREEN_THEMES, getThemeTokens } from '@/lib/fullscreen-themes';
import { openButtonHidden } from '@/components/modules/shared/OpenScreenButton';
import { PANEL_SECTION_OPEN_BUTTON, PANEL_SECTION_SCREEN_SETTINGS, revealPanelSection } from './panel-section-reveal';
import { describeSchedule } from '@/lib/schedule-summary';
import { GoBackAfterField } from './GoBackAfterField';
import { isRotationOff, resolveScreenDuration } from '@/lib/resolve-screen-duration';
import type { BuiltinModuleType, ModuleInstance, Screen } from '@/types/config';
import { usePluginStore } from '@/stores/plugin-store';
import { getModuleDefinition, resolveModuleDescription, resolveModuleLabel, styleReachesModule, ownedStyleFields } from '@/lib/module-registry';
import { buildModuleDeleteConfirm } from '@/lib/delete-confirmations';
import { moduleDocsUrl } from '@/lib/module-docs';
import { useFormattingLocale, useTranslate, type TranslateFn } from '@/i18n';
import PluginConfigRenderer from './PluginConfigRenderer';
import ModuleErrorBoundary from '@/components/ModuleErrorBoundary';
import PluginSettingsSections from './PluginSettingsSections';
import { MousePointerClick, ChevronLeft, HelpCircle, Monitor, PanelRight, PanelRightClose, Sliders } from 'lucide-react';
import AccordionSection from './AccordionSection';
import { PANEL_SECTION_CONDITIONS } from './panel-section-reveal';
import FontFamilyPicker from '@/components/ui/FontFamilyPicker';
import LabeledField from '@/components/ui/LabeledField';
import { resolveTitleFontSize, displayTextPercent, moduleBaseFontSize, textSizeDefinitionFor, TEXT_SCALE_MIN, TEXT_SCALE_MAX } from '@/lib/module-style';

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
  NotesConfigSection,
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
  TimetableConfigSection,
} from '@/components/editor/config-sections';

// Shared input classes — single source of truth lives in ui/input-classes.ts
import { INPUT_CLASS, NESTED_INPUT_CLASS } from '@/components/ui/input-classes';
export { INPUT_CLASS, NESTED_INPUT_CLASS };

/**
 * One of the X / Y / W / H boxes. The box shows what is being typed while it
 * has focus, and the module follows every value that is a number. Without the
 * draft the box showed the module's value instead: clearing it read as 0,
 * which the size rules turn into 1, so the box said "1" and typing 300 after
 * it made 1300. An empty box changes nothing; leaving it puts the module's
 * value back.
 */
function GeometryField({ label, value, onCommit }: { label: string; value: number; onCommit: (next: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-hs-text-muted">{label}</span>
      <input
        type="number"
        value={draft ?? value}
        onFocus={(e) => setDraft(e.target.value)}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          const next = Number(text);
          if (text.trim() !== '' && Number.isFinite(next)) onCommit(next);
        }}
        onBlur={() => setDraft(null)}
        className={INPUT_CLASS}
      />
    </label>
  );
}

function PositionSection({ mod, screenId, t }: { mod: ModuleInstance; screenId: string; t: TranslateFn }) {
  const { moveModule, resizeModule } = useEditorStore();
  return (
    <>
      <PropertyGroup title={t('propertyPanel.sections.position')} accent={1}>
        <div className="grid grid-cols-2 gap-2">
          {(['x', 'y'] as const).map((key) => (
            <GeometryField
              key={key}
              label={t(`propertyPanel.fields.${key}`)}
              value={mod.position[key]}
              onCommit={(next) => moveModule(screenId, mod.id, { ...mod.position, [key]: next })}
            />
          ))}
        </div>
      </PropertyGroup>
      <PropertyGroup title={t('propertyPanel.sections.size')} accent={2}>
        <div className="grid grid-cols-2 gap-2">
          {(['w', 'h'] as const).map((key) => (
            <GeometryField
              key={key}
              label={t(`propertyPanel.fields.${key}`)}
              value={mod.size[key]}
              onCommit={(next) => resizeModule(screenId, mod.id, { ...mod.size, [key]: next })}
            />
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

/**
 * The size a fitting module shows on its own, read off the canvas preview,
 * which publishes it on its measuring element (useScaledFontSize). The panel
 * needs it to show an old pixel floor as a percent of the fit. Polled rather
 * than observed: it changes only when the card is resized, and a quarter
 * second is below what anyone dragging a handle can see.
 */
function useFittedPx(moduleId: string, enabled: boolean): number | undefined {
  const [fitted, setFitted] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!enabled) { setFitted(undefined); return; }
    const read = () => {
      const el = document.querySelector(`[data-module-id="${moduleId}"] [data-fitted-px]`);
      const px = el ? parseFloat(el.getAttribute('data-fitted-px') ?? '') : Number.NaN;
      setFitted(Number.isFinite(px) && px > 0 ? px : undefined);
    };
    read();
    const id = window.setInterval(read, 250);
    return () => window.clearInterval(id);
  }, [moduleId, enabled]);
  return fitted;
}

function StyleSection({ mod, screenId, t }: { mod: ModuleInstance; screenId: string; t: TranslateFn }) {
  const { updateModuleStyle } = useEditorStore();
  const s = mod.style;
  const set = (updates: Partial<typeof s>) => updateModuleStyle(screenId, mod.id, updates);
  // Plugin components render raw (never inside ModuleWrapper), so the
  // class-based font weight override cannot reach them — hide the control
  // rather than show a slider that does nothing.
  const isPlugin = mod.type.startsWith('plugin:');
  // One text-size control for every module, in percent of its normal size
  // (see resolveModuleStyle / displayTextPercent in module-style.ts). A
  // module that still carries only the old pixel value reads it as a percent
  // of its base, so the slider says what the wall shows; the first edit
  // writes the percent and resets the pixel field to the base.
  // Per instance: a module that can fit its text but has the fit switched off
  // on this one sizes from its base, and the slider must say so.
  const def = getModuleDefinition(mod.type);
  const textDef = textSizeDefinitionFor(def, mod.config);
  const basePx = moduleBaseFontSize(textDef);
  const fittedPx = useFittedPx(mod.id, !!textDef?.autoSizesText);
  const textPercent = displayTextPercent(s, textDef, fittedPx);
  const owned = ownedStyleFields(def, mod.config);

  return (
    <>
      <PropertyGroup title={t('propertyPanel.sections.shape')} accent={1}>
        <div className="space-y-3">
          <Slider label={t('propertyPanel.fields.borderRadius')} value={s.borderRadius} min={0} max={50} onChange={(v) => set({ borderRadius: v })} />
          <Slider label={t('propertyPanel.fields.padding')} value={s.padding} min={0} max={64} onChange={(v) => set({ padding: v })} />
          {!owned.has('borderWidth') && (
            <Slider label={t('propertyPanel.fields.borderWidth')} value={s.borderWidth ?? 0} min={0} max={4} onChange={(v) => set({ borderWidth: v })} />
          )}
        </div>
      </PropertyGroup>

      <PropertyGroup title={t('propertyPanel.sections.effects')} accent={2}>
        <div className="space-y-3">
          <Slider label={t('propertyPanel.fields.opacity')} value={s.opacity} min={0} max={1} step={0.05} onChange={(v) => set({ opacity: v })} />
          {!owned.has('backdropBlur') && (
            <Slider label={t('propertyPanel.fields.backdropBlur')} value={s.backdropBlur} min={0} max={40} step={0.5} onChange={(v) => set({ backdropBlur: v })} />
          )}
          <Slider label={t('propertyPanel.fields.shadowSize')} value={s.shadowSize ?? 0} min={0} max={48} onChange={(v) => set({ shadowSize: v })} />
        </div>
      </PropertyGroup>

      {!(owned.has('backgroundColor') && owned.has('borderColor') && owned.has('textColor')) && (
      <PropertyGroup title={t('fields.color')} accent={3}>
        <div className="space-y-3">
          {!owned.has('backgroundColor') && (
            <ColorPicker label={t('propertyPanel.fields.background')} value={s.backgroundColor} onChange={(v) => set({ backgroundColor: v })} showAlpha alphaLabel={t('propertyPanel.fields.colorAlpha')} />
          )}
          {!owned.has('borderColor') && (
            <ColorPicker label={t('propertyPanel.fields.borderColor')} value={s.borderColor ?? 'rgba(255, 255, 255, 0.15)'} onChange={(v) => set({ borderColor: v })} showAlpha alphaLabel={t('propertyPanel.fields.colorAlpha')} />
          )}
          {!owned.has('textColor') && (
            <ColorPicker label={t('propertyPanel.fields.textColor')} value={s.textColor} onChange={(v) => set({ textColor: v })} />
          )}
        </div>
      </PropertyGroup>
      )}

      <PropertyGroup title={t('propertyPanel.sections.text')} accent={4}>
        <div className="space-y-3">
          {/* The title lives in Module settings, next to the module's own
              "show my title" option, so the two can't be set to fight. */}
          <div>
            <Slider
              label={t('propertyPanel.fields.textScale')}
              value={textPercent}
              min={TEXT_SCALE_MIN}
              max={TEXT_SCALE_MAX}
              // Step 1, so a percent derived from an old pixel value (31px on a
              // 16px base is 194%) is representable exactly: a range input
              // snaps its value to the step.
              step={1}
              displayValue={`${textPercent}%`}
              // 100 is stored as absent. The pixel field goes back to the base
              // in the same edit, so the percent is the one number that matters.
              onChange={(v) => set({ textScale: v === 100 ? undefined : v, fontSize: basePx })}
            />
            <p data-testid="font-size-hint" className="text-[11px] text-hs-text-dim mt-1">
              {t('propertyPanel.fields.textScaleHint')}
            </p>
          </div>
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
          {!owned.has('fontFamily') && (
            <FontFamilyPicker value={s.fontFamily} onChange={(v) => set({ fontFamily: v })} />
          )}
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
  notes: NotesConfigSection,
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
  timetable: TimetableConfigSection,
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
  const tCore = useTranslate('core');
  const { config, selectedDisplayId, selectedScreenId, selectedModuleId, selectModule, selectScreen, removeModule, duplicateModule, updateModule, updateScreen, reorderModule, addScreenOpenedFrom } = useEditorStore();
  const formattingLocale = useFormattingLocale();
  // The one-click screen just added from a module's Open button section, for
  // its confirmation line, and a screen left with nothing to open it.
  const [twinAdded, setTwinAdded] = useState<{ moduleId: string; screenId: string; name: string } | null>(null);
  // The confirmation is a moment, not a state of the module: it goes after a
  // few seconds, and with another selection.
  useEffect(() => {
    if (!twinAdded) return;
    const timer = setTimeout(() => setTwinAdded(null), 8_000);
    return () => clearTimeout(timer);
  }, [twinAdded]);
  useEffect(() => { setTwinAdded(null); setOrphaned(null); }, [selectedModuleId, selectedScreenId]);
  // A new selection starts at the top of its panel, not at the scroll the
  // last one was left at (a link that reveals a section scrolls on from there).
  const panelScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (panelScrollRef.current) panelScrollRef.current.scrollTop = 0; }, [selectedModuleId, selectedScreenId]);
  const [orphaned, setOrphaned] = useState<{ moduleId: string; screenId: string; name: string } | null>(null);
  const pluginMap = usePluginStore((s) => s.plugins);
  // Same clock and live values the canvas badges use, so the chip here and the
  // badge over there always agree. The poll is armed only while the selected
  // module actually has conditions: the shared-state GET also switches the
  // display into fast re-reporting, so an idle panel must not hold it open.

  const activeScreens = config ? getActiveScreens(config, selectedDisplayId) : [];
  const currentScreen = activeScreens.find((s) => s.id === selectedScreenId);
  const selectedModule = currentScreen?.modules.find((m) => m.id === selectedModuleId);
  const conditioned = selectedModule ? moduleReadsLiveValues(selectedModule) : false;
  // Only ticks the panel's clock while the selected module actually has
  // something time-dependent to show — an idle panel shouldn't re-render
  // every 60s for a module with no schedule or conditions.
  const householdTimezone = useEditorHouseholdTimezone();
  const now = useWallClock(householdTimezone, 60_000, !!selectedModule?.schedule || conditioned);
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
      <div ref={panelScrollRef} className="w-72 flex-shrink-0 bg-hs-panel border-l border-hs-border-strong p-4 overflow-y-auto">
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
  // The full-screen planner's one-line description names its week; its
  // Recipe Book view is a different thing and says so.
  const moduleDescription = selectedModule.type === 'fullscreen-meal-planner' && selectedModule.config.view === 'recipes'
    ? t('registry.viewDescriptions.fullscreen-meal-planner.recipes')
    : resolveModuleDescription(selectedModule.type, t);
  const docsUrl = moduleDocsUrl(selectedModule.type);

  return (
    <div ref={panelScrollRef} className="w-72 flex-shrink-0 bg-hs-panel border-l border-hs-border-strong p-4 overflow-y-auto">
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

        {isPlugin && loadedPlugin && <PluginSettingsSections manifest={loadedPlugin.manifest} />}

        {(() => {
          // The button's own section: where it goes, and for a screen that
          // shows only when opened, that screen's quiet time, edited here in
          // place. Its badge names the target, so a module with a button says
          // so while the section is closed. Only screens the button can open
          // are listed: never the module's own, never a switched-off one
          // (a target switched off after being picked stays, marked off).
          const target = selectedModule.openButtonScreen
            ? activeScreens.find((s) => s.id === selectedModule.openButtonScreen) ?? null
            : null;
          const targetOff = !!target && target.enabled === false;
          const openable = activeScreens.filter((s) => s.id !== selectedScreenId && (s.enabled !== false || s.id === target?.id));
          const opened = !!target && showsOnlyWhenOpened(target);
          const badge = target
            ? (targetOff ? t('propertyPanel.openButton.offShort') : target.name)
            : t('propertyPanel.openButton.none');
          const displayNode = selectedDisplayId ? config?.displays?.find((d) => d.id === selectedDisplayId) : undefined;
          const displayRules = displayNode?.rules ?? config?.rules;
          const turnSeconds = target && !opened && config
            ? (isRotationOff(config.settings, displayNode) ? 0 : Math.round(resolveScreenDuration(target, config.settings) / 1000))
            : 0;
          const minutesId = `module-open-button-go-back-${selectedModule.id}`;
          const openedGroup = openable.filter((s) => showsOnlyWhenOpened(s));
          const rotatingGroup = openable.filter((s) => !showsOnlyWhenOpened(s));
          const optionLabel = (screen: Screen) => (screen.enabled === false ? t('propertyPanel.openButton.offBadge', { name: screen.name }) : screen.name);
          const bothGroups = openedGroup.length > 0 && rotatingGroup.length > 0;
          // The module's full-screen twin, offered as a one-click screen while
          // no screen of this display holds it yet. The screen is named after
          // what it shows, not after the module type.
          const twin = moduleDef?.fullscreenTwin;
          const twinName = twin ? t(`propertyPanel.openButton.twinScreenName.${twin.type}`) : '';
          const twinExists = !!twin && activeScreens.some((s) => s.id !== selectedScreenId && s.modules.some((m) => m.type === twin.type));
          const offerTwin = !!twin && !twinExists && !target;
          const added = twinAdded?.moduleId === selectedModule.id && twinAdded.screenId === target?.id ? twinAdded : null;
          const contents = target ? describeScreenContents(target, t, formattingLocale) : '';
          const targetTheme = target && target.modules.some((m) => getModuleDefinition(m.type)?.category === 'Full Screen') && config
            ? getThemeTokens(openedScreenTheme(target, config.settings.fullscreenTheme))
            : null;
          const targetThemeName = target && config
            ? FULLSCREEN_THEMES.find((th) => th.id === (openedScreenTheme(target, config.settings.fullscreenTheme) ?? 'linen'))?.name ?? ''
            : '';
          const tapOff = openButtonHidden(selectedModule.config);
          const gatedBySchedule = opened && !!target?.schedule;
          const gatedByConditions = opened && (target?.visibility?.conditions.length ?? 0) > 0;
          const goToTarget = (screenId: string) => {
            selectScreen(screenId);
            // The panel starts at the top for the new selection; bring the
            // Rotation group into view and mark it.
            setTimeout(() => revealPanelSection(PANEL_SECTION_SCREEN_SETTINGS), 60);
          };
          const actionClass = 'text-[11px] font-medium px-2.5 py-1 rounded-md text-hs-accent-hover bg-hs-accent-soft border border-hs-accent/35 hover:bg-hs-accent/20 transition-colors';
          const helpClass = 'text-[11px] text-hs-text-faint leading-relaxed';
          return (
            <AccordionSection id={PANEL_SECTION_OPEN_BUTTON} title={t('propertyPanel.openButton.sectionTitle')} defaultOpen={!!selectedModule.openButtonScreen} badge={badge}>
              <div className="space-y-2">
                <label htmlFor={`module-open-button-${selectedModule.id}`} className="block text-xs text-hs-text-muted">
                  {t('propertyPanel.openButton.label')}
                </label>
                <select
                  id={`module-open-button-${selectedModule.id}`}
                  data-field-id="openButtonScreen"
                  value={selectedModule.openButtonScreen ?? ''}
                  aria-describedby={`module-open-button-help-${selectedModule.id}`}
                  onChange={(e) => {
                    const next = e.target.value || undefined;
                    // Any change can strand the screen the button opened, if
                    // it showed only when opened and nothing else opens it:
                    // say so where the choice was made.
                    const previous = target;
                    const stranded = !!previous && previous.id !== next && showsOnlyWhenOpened(previous)
                      && !screenHasOpener(
                        activeScreens.map((s) => s.id === selectedScreenId ? { ...s, modules: s.modules.filter((m) => m.id !== selectedModule.id) } : s),
                        displayRules,
                        previous.id,
                      );
                    setOrphaned(stranded && previous ? { moduleId: selectedModule.id, screenId: previous.id, name: previous.name } : null);
                    setTwinAdded(null);
                    updateModule(selectedScreenId, selectedModule.id, {
                      // Omit the field entirely for "Nothing" so configs stay clean.
                      openButtonScreen: next,
                    });
                  }}
                  className="w-full px-2 py-1.5 text-sm bg-hs-input border border-hs-border-strong rounded text-hs-text-body"
                >
                  <option value="">{t('propertyPanel.openButton.none')}</option>
                  {bothGroups ? (
                    <>
                      <optgroup label={t('propertyPanel.openButton.groupOpened')}>
                        {openedGroup.map((screen) => <option key={screen.id} value={screen.id}>{optionLabel(screen)}</option>)}
                      </optgroup>
                      <optgroup label={t('propertyPanel.openButton.groupRotation')}>
                        {rotatingGroup.map((screen) => <option key={screen.id} value={screen.id}>{optionLabel(screen)}</option>)}
                      </optgroup>
                    </>
                  ) : (
                    [...openedGroup, ...rotatingGroup].map((screen) => <option key={screen.id} value={screen.id}>{optionLabel(screen)}</option>)
                  )}
                </select>
                <p id={`module-open-button-help-${selectedModule.id}`} className={helpClass}>
                  {t('propertyPanel.openButton.help')}
                </p>
                {orphaned?.moduleId === selectedModule.id && orphaned.screenId !== target?.id && (
                  <div className="space-y-1.5" data-testid="open-button-orphaned">
                    <p className="text-xs text-hs-warning">{t('propertyPanel.openButton.orphaned', { name: orphaned.name })}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className={actionClass}
                        onClick={() => {
                          updateModule(selectedScreenId, selectedModule.id, { openButtonScreen: orphaned.screenId });
                          setOrphaned(null);
                        }}
                      >
                        {t('propertyPanel.openButton.pickAgain')}
                      </button>
                      <button
                        type="button"
                        className={actionClass}
                        onClick={() => {
                          updateScreen(orphaned.screenId, { rotation: undefined });
                          setOrphaned(null);
                        }}
                      >
                        {t('propertyPanel.openButton.letItTakeTurn')}
                      </button>
                    </div>
                  </div>
                )}
                {offerTwin && twin && (
                  <div className="pt-1 space-y-1.5" data-testid="open-button-add-twin">
                    <button
                      type="button"
                      onClick={() => {
                        const screenId = addScreenOpenedFrom(selectedScreenId, selectedModule.id, twin, twinName);
                        setTwinAdded(screenId ? { moduleId: selectedModule.id, screenId, name: twinName } : null);
                        setOrphaned(null);
                      }}
                      className={actionClass}
                    >
                      {t('propertyPanel.openButton.addTwinScreen', { name: twinName })}
                    </button>
                    <p className={helpClass}>{t('propertyPanel.openButton.addTwinHelp', { name: twinName })}</p>
                  </div>
                )}
                {added && target && (
                  <p className="text-xs text-hs-success" data-testid="open-button-twin-added">
                    {t('propertyPanel.openButton.twinAdded', { name: added.name })}
                  </p>
                )}
                {contents && target && (
                  <p className="text-xs text-hs-text-muted" data-testid="open-button-target-holds">
                    {t('propertyPanel.openButton.holds', { what: contents })}
                  </p>
                )}
                {targetTheme && target && (
                  <p className="text-xs text-hs-text-muted flex items-center gap-2" data-testid="open-button-target-theme">
                    <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-full border border-hs-border-strong" style={{ background: `linear-gradient(135deg, ${targetTheme.bg} 50%, ${targetTheme.text} 50%)` }} />
                    <span>{t('propertyPanel.openButton.theme', { theme: targetThemeName })}</span>
                  </p>
                )}
                {tapOff && target && (
                  <div className="space-y-1.5" data-testid="open-button-tap-off">
                    <p className="text-xs text-hs-warning">{t('propertyPanel.openButton.tapOff')}</p>
                    <button
                      type="button"
                      className={actionClass}
                      onClick={() => updateModule(selectedScreenId, selectedModule.id, { config: { ...selectedModule.config, interactive: true } })}
                    >
                      {t('propertyPanel.openButton.turnOnTap')}
                    </button>
                  </div>
                )}
                {targetOff && target && (
                  <div className="space-y-1.5" data-testid="open-button-target-off">
                    <p className="text-xs text-hs-warning">{t('propertyPanel.openButton.targetOff')}</p>
                    <button type="button" className={actionClass} onClick={() => updateScreen(target.id, { enabled: undefined })}>
                      {t('propertyPanel.openButton.switchOn')}
                    </button>
                  </div>
                )}
                {(gatedBySchedule || gatedByConditions) && target && config && (
                  <p className="text-xs text-hs-text-muted" data-testid="open-button-gated">
                    {gatedBySchedule
                      ? t('propertyPanel.openButton.onlyWhen', { when: describeSchedule(target.schedule, t, formattingLocale, config.settings.timeFormat).short })
                      : t('propertyPanel.openButton.onlyConditions')}
                  </p>
                )}
                {target && opened && (
                  <div className="pt-1 space-y-3">
                    <Toggle
                      label={t('propertyPanel.openButton.keepOut')}
                      checked
                      onChange={() => updateScreen(target.id, { rotation: undefined })}
                    />
                    <div>
                      <label htmlFor={minutesId} className="block text-xs text-hs-text-muted mb-1.5">
                        {t('propertyPanel.openButton.goBackAfterLabel')}
                      </label>
                      <GoBackAfterField
                        id={minutesId}
                        screen={target}
                        t={t}
                        onChange={(ms) => updateScreen(target.id, { goBackAfterMs: ms === DEFAULT_GO_BACK_AFTER_MS ? undefined : ms })}
                      />
                    </div>
                  </div>
                )}
                {target && !opened && (
                  <div className="pt-1 space-y-2" data-testid="open-button-in-rotation-hint">
                    <p className={helpClass}>
                      {turnSeconds > 0
                        ? t('propertyPanel.openButton.inRotationHint', { name: target.name, seconds: turnSeconds, home: currentScreen.name })
                        : t('propertyPanel.openButton.inRotationStaysHint', { name: target.name, home: currentScreen.name })}
                    </p>
                    {/* The screen's rotation choice, flipped from here so the
                        whole setup lives in one section; the screen's own
                        Rotation group mirrors it. */}
                    <Toggle
                      label={t('propertyPanel.openButton.keepOut')}
                      checked={false}
                      onChange={() => updateScreen(target.id, { rotation: 'opened' })}
                    />
                  </div>
                )}
                {target && (
                  <button type="button" onClick={() => goToTarget(target.id)} className={actionClass}>
                    {t('propertyPanel.openButton.openScreenSettings')}
                  </button>
                )}
              </div>
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
            {/* Drawn once above the rotating canvas, so it cannot also be a
                hidden background copy: the two switches are exclusive. Turning
                one on clears the other, and a switch hides only while the
                other is on and its own flag is off, so a config carrying both
                (hand-edited) still shows both and either can be cleared. */}
            {(selectedModule.backgroundProvider !== true || selectedModule.showOnEveryScreen === true) && (
              <>
                <label htmlFor={`module-every-screen-toggle-${selectedModule.id}`} className="flex items-start gap-2 cursor-pointer text-sm mt-3">
                  <input
                    id={`module-every-screen-toggle-${selectedModule.id}`}
                    type="checkbox"
                    className="mt-0.5"
                    checked={selectedModule.showOnEveryScreen === true}
                    aria-describedby={`module-every-screen-help-${selectedModule.id}`}
                    onChange={(e) =>
                      updateModule(selectedScreenId, selectedModule.id, {
                        // Omit the field entirely when off so configs stay clean.
                        showOnEveryScreen: e.target.checked ? true : undefined,
                        ...(e.target.checked ? { backgroundProvider: undefined } : {}),
                      })
                    }
                  />
                  <span className="block">{t('propertyPanel.visibility.everyScreenLabel')}</span>
                </label>
                <p id={`module-every-screen-help-${selectedModule.id}`} className="text-xs text-hs-text-dim mt-1 ml-6">
                  {t('propertyPanel.visibility.everyScreenHelp')}
                </p>
              </>
            )}
            {(() => {
              // Plugins that export a stateProvider publish automatically —
              // the background flag is meaningless for them, so hide the
              // toggle. Instances still flagged (from before the plugin
              // adopted stateProvider) get a hint that they can be deleted,
              // plus the toggle so the flag can be switched off.
              const hasStateProvider = Boolean(loadedPlugin?.manifest.exports?.stateProvider);
              const isFlagged = selectedModule.backgroundProvider === true;
              // A set flag always gets its switch, whatever the module type,
              // so a hand-edited config can be put right from here.
              if (!isFlagged) {
                if (selectedModule.showOnEveryScreen === true) return null;
                if (hasStateProvider) return null;
                if (!isStateProducerType(selectedModule.type)) return null;
              }
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
                          ...(e.target.checked ? { showOnEveryScreen: undefined } : {}),
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

        <AccordionSection title={t('propertyPanel.sections.conditions')} defaultOpen={false} id={PANEL_SECTION_CONDITIONS}>
          <VisibilityConditionsSection mod={selectedModule} screenId={selectedScreenId} />
        </AccordionSection>

        <div className="pt-3 border-t border-hs-border-strong space-y-2">
          <div className="grid grid-cols-2 gap-2 [&>button]:min-w-0 [&>button]:whitespace-normal">
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
                if (await useConfirmStore.getState().confirm(
                  buildModuleDeleteConfirm(moduleLabel, t, tCore),
                )) {
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
