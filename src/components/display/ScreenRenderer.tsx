'use client';

import { useMemo, useEffect } from 'react';
import type { Screen, GlobalSettings, ModuleType, ModuleInstance } from '@/types/config';
import { getModuleComponent } from '@/lib/module-components';
import { getModuleDefinition } from '@/lib/module-registry';
import { isModuleEnabled, isModuleVisible, evaluateVisibility, collectConditionSourceKeys } from '@/lib/schedule';
import type { SharedStateEntry } from '@/lib/shared-state-types';
import { useSharedStateKeys } from '@/hooks/useSharedStateKeys';
import { useTZClock } from '@/hooks/useTZClock';

/**
 * Single source of truth for the renderer's module-visibility predicate.
 * Exported so `__tests__/ScreenRenderer.test.tsx` can verify the exact
 * contract used in production — the test cannot mirror a stale copy of
 * the filter expression.
 *
 * `backgroundProvider` instances are unconditionally excluded here: they are
 * background-ONLY and render solely inside BackgroundProviderLayer.
 */
export const isModuleRenderable = (
  mod: ModuleInstance,
  now: Date,
  states: ReadonlyMap<string, SharedStateEntry>,
): boolean =>
  !mod.backgroundProvider &&
  isModuleEnabled(mod) &&
  isModuleVisible(mod.schedule, now) &&
  evaluateVisibility(mod.visibility, states);
import PluginPlaceholder from '@/components/modules/PluginPlaceholder';
import { PageBackgroundProvider, usePageBackground } from '@/contexts/PageBackgroundContext';
import { useAuthImage } from './useAuthImage';
import { eventBus } from '@/lib/event-bus';
import { getLocation } from '@/lib/location';

export interface SharedDisplayData {
  owmData: unknown;
  wapiData: unknown;
  pirateData: unknown;
  noaaData: unknown;
  openMeteoData: unknown;
  yrData: unknown;
  smhiData: unknown;
  metofficeData: unknown;
  envcanadaData: unknown;
  calendarData: unknown;
}

interface ScreenRendererProps {
  screen: Screen;
  settings: GlobalSettings;
  rotatingBackground?: string;
  sharedData: SharedDisplayData;
  displayW: number;
  displayH: number;
  scale: number;
  /** Registered displays for display-control module target picker. Empty = legacy mode. */
  availableDisplays?: Array<{ id: string; name: string }>;
  /** Display id this page is rendering as — needed because the legacy /display route
   *  renders its main display inline rather than redirecting, so the URL doesn't carry
   *  the id. The display-control module uses this to resolve `defaultTarget: 'self'`. */
  displayId?: string;
}

export function resolveProvider(mod: { type: string; config: Record<string, unknown> }, globalProvider: string): string {
  if (mod.type === 'weather') {
    const p = mod.config.provider as string | undefined;
    return (p && p !== 'global') ? p : globalProvider;
  }
  return globalProvider;
}

const PROVIDER_KEY: Record<string, keyof SharedDisplayData> = {
  openweathermap: 'owmData',
  weatherapi: 'wapiData',
  pirateweather: 'pirateData',
  noaa: 'noaaData',
  'open-meteo': 'openMeteoData',
  yr: 'yrData',
  smhi: 'smhiData',
  metoffice: 'metofficeData',
  envcanada: 'envcanadaData',
};

function getTimePeriod(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Assemble the shared/extra props a module component needs (location,
 * calendar events, weather data). Exported for BackgroundProviderLayer so
 * background-provider instances receive exactly the props an on-screen
 * instance would.
 */
export function buildModuleProps(
  mod: { type: ModuleType; config: Record<string, unknown> },
  settings: GlobalSettings,
  sharedData: SharedDisplayData,
  locationMissing: boolean,
): Record<string, unknown> {
  const props: Record<string, unknown> = {
    timezone: settings.timezone,
    fullscreenTheme: settings.fullscreenTheme,
  };

  const def = getModuleDefinition(mod.type);
  if (def?.dataRequirements?.includes('location')) {
    const location = getLocation(settings);
    if (location) {
      props.latitude = location.lat;
      props.longitude = location.lon;
    }
  }

  const needsCalendar = mod.type === 'calendar' || def?.dataRequirements?.includes('calendar');
  if (needsCalendar && sharedData.calendarData) {
    props.events = Array.isArray(sharedData.calendarData)
      ? sharedData.calendarData
      : (sharedData.calendarData as Record<string, unknown>).events ?? [];
  }

  const needsWeather = mod.type === 'weather' || def?.dataRequirements?.includes('weather');
  if (needsWeather) {
    if (locationMissing) props.locationMissing = true;
    const provider = resolveProvider(mod, settings.weather.provider);
    const weatherData = sharedData[PROVIDER_KEY[provider]] as Record<string, unknown> | null;
    if (weatherData) {
      props.hourly = weatherData.hourly ?? [];
      props.forecast = weatherData.forecast ?? [];
      props.minutely = weatherData.minutely;
      props.alerts = weatherData.alerts;
    }
    props.units = settings.weather.units;
  }

  return props;
}

export default function ScreenRenderer(props: ScreenRendererProps) {
  return (
    <PageBackgroundProvider>
      <ScreenRendererInner {...props} />
    </PageBackgroundProvider>
  );
}

function ScreenRendererInner({ screen, settings, rotatingBackground, sharedData, displayW, displayH, scale, availableDisplays = [], displayId }: ScreenRendererProps) {
  const { overrideBackground } = usePageBackground();

  // Minute-resolution timezone-aware clock for module scheduling
  const now = useTZClock(settings.timezone);

  // Publish time period transitions to the event bus (fires at most 4x/day)
  const hour = now.getHours();
  const timePeriod = getTimePeriod(hour);
  useEffect(() => {
    eventBus.publish('time.period', {
      period: timePeriod,
      hour,
      timezone: settings.timezone ?? 'UTC',
    });
    // `hour` is intentionally excluded — we only want to fire on period transitions,
    // not every hour. The closure captures the correct hour at each transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timePeriod, settings.timezone]);

  // Push-based subscription scoped to the keys this screen's conditions
  // actually reference: entity-driven visibility still flips the instant a
  // producer reports (the minute clock still drives time/day schedules), but
  // publishes to unreferenced keys no longer re-render the module tree, and
  // a screen with no visibility conditions never subscribes at all.
  const conditionKeys = useMemo(() => collectConditionSourceKeys(screen.modules), [screen.modules]);
  const states = useSharedStateKeys(conditionKeys);

  const visibleModules = useMemo(
    () => screen.modules.filter((mod) => isModuleRenderable(mod, now, states)),
    [screen.modules, now, states],
  );

  const rotation = screen.backgroundRotation;
  const screenBackground = rotation?.enabled ? (rotatingBackground || screen.backgroundImage) : screen.backgroundImage;
  // Module-requested override takes priority over screen background
  const rawBackground = overrideBackground || screenBackground;
  // Fetch API-served images through displayFetch so the Bearer token is used
  // (plain <img> tags don't carry Authorization headers)
  const backgroundImage = useAuthImage(rawBackground || undefined) || '';

  const locationMissing = getLocation(settings) == null;

  return (
    <div
      style={{
        width: displayW,
        height: displayH,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#000',
        // Use zoom instead of transform: scale() so that backdrop-filter
        // works in Firefox. transform creates an isolated compositing layer
        // that blocks backdrop-filter from sampling pixels behind it (FF Bug 1782876).
        zoom: scale,
      }}
    >
      {backgroundImage && (
        <img
          src={backgroundImage}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transition: 'opacity 1s ease-in-out',
          }}
        />
      )}

      {visibleModules.map((mod) => {
        const Component = getModuleComponent(mod.type);

        // Show placeholder for unavailable plugin modules
        if (!Component) {
          if (mod.type.startsWith('plugin:')) {
            return (
              <div
                key={mod.id}
                style={{
                  position: 'absolute',
                  left: mod.position.x,
                  top: mod.position.y,
                  width: mod.size.w,
                  height: mod.size.h,
                  zIndex: mod.zIndex,
                  overflow: 'hidden',
                }}
              >
                <PluginPlaceholder moduleType={mod.type} />
              </div>
            );
          }
          return null;
        }

        const extraProps = buildModuleProps(mod, settings, sharedData, locationMissing);

        // Type-specific extra props: thread availableDisplays + displayId into display-control only.
        // displayId is the authoritative render-as id; the URL alone is unreliable because
        // the legacy /display route renders a multi-display main inline without redirecting.
        if (mod.type === 'display-control') {
          (extraProps as Record<string, unknown>).availableDisplays = availableDisplays;
          (extraProps as Record<string, unknown>).renderDisplayId = displayId;
        }

        // Thread the module's instance address into interactive modules. The
        // todo module needs it to locate itself in the config tree when
        // POSTing a toggle; the meal planners use its presence as the "on a
        // real display" signal for tap-to-open-recipe (the editor preview
        // threads nothing and falls back to opening links in a new tab).
        if (mod.type === 'todo' || mod.type === 'meal-planner' || mod.type === 'fullscreen-meal-planner') {
          (extraProps as Record<string, unknown>).displayId = displayId;
          (extraProps as Record<string, unknown>).screenId = screen.id;
          (extraProps as Record<string, unknown>).moduleId = mod.id;
        }

        return (
          <div
            key={mod.id}
            style={{
              position: 'absolute',
              left: mod.position.x,
              top: mod.position.y,
              width: mod.size.w,
              height: mod.size.h,
              zIndex: mod.zIndex,
            }}
          >
            <Component config={mod.config} style={mod.style} {...extraProps} />
          </div>
        );
      })}
    </div>
  );
}
