import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { BuiltinModuleType, ModuleType } from '@/types/config';
import { usePluginStore } from '@/stores/plugin-store';

// Module components have heterogeneous props (each module has its own config
// type). We assert the record type because ComponentType is contravariant in
// props, preventing direct assignment of specific component types.
const builtinComponents = {
  clock: dynamic(() => import('@/components/modules/clock/ClockModule')),
  calendar: dynamic(() => import('@/components/modules/CalendarModule')),
  weather: dynamic(() => import('@/components/modules/weather/WeatherModule')),
  countdown: dynamic(() => import('@/components/modules/countdown/CountdownModule')),
  'dad-joke': dynamic(() => import('@/components/modules/DadJokeModule')),
  text: dynamic(() => import('@/components/modules/TextModule')),
  image: dynamic(() => import('@/components/modules/ImageModule')),
  quote: dynamic(() => import('@/components/modules/QuoteModule')),
  todo: dynamic(() => import('@/components/modules/TodoModule')),
  'sticky-note': dynamic(() => import('@/components/modules/StickyNoteModule')),
  greeting: dynamic(() => import('@/components/modules/GreetingModule')),
  news: dynamic(() => import('@/components/modules/NewsModule')),
  'stock-ticker': dynamic(() => import('@/components/modules/StockTickerModule')),
  crypto: dynamic(() => import('@/components/modules/CryptoModule')),
  'word-of-day': dynamic(() => import('@/components/modules/WordOfDayModule')),
  history: dynamic(() => import('@/components/modules/HistoryModule')),
  'moon-phase': dynamic(() => import('@/components/modules/MoonPhaseModule')),
  'sunrise-sunset': dynamic(() => import('@/components/modules/SunriseSunsetModule')),
  'photo-slideshow': dynamic(() => import('@/components/modules/PhotoSlideshowModule')),
  'qr-code': dynamic(() => import('@/components/modules/QRCodeModule')),
  'year-progress': dynamic(() => import('@/components/modules/YearProgressModule')),
  traffic: dynamic(() => import('@/components/modules/TrafficModule')),
  sports: dynamic(() => import('@/components/modules/sports/SportsModule')),
  'air-quality': dynamic(() => import('@/components/modules/AirQualityModule')),
  todoist: dynamic(() => import('@/components/modules/TodoistModule')),
  'rain-map': dynamic(() => import('@/components/modules/RainMapModule')),
  'multi-month': dynamic(() => import('@/components/modules/MultiMonthModule')),
  'garbage-day': dynamic(() => import('@/components/modules/GarbageDayModule')),
  standings: dynamic(() => import('@/components/modules/standings/StandingsModule')),
  affirmations: dynamic(() => import('@/components/modules/AffirmationsModule')),
  date: dynamic(() => import('@/components/modules/date/DateModule')),
  'meal-planner': dynamic(() => import('@/components/modules/meal-planner/MealPlannerModule')),
  iframe: dynamic(() => import('@/components/modules/IframeModule')),
  'chore-chart': dynamic(() => import('@/components/modules/chore-chart/ChoreChartModule')),
  'fullscreen-calendar': dynamic(() => import('@/components/modules/fullscreen-calendar/FullscreenCalendarModule')),
  'fullscreen-chore-chart': dynamic(() => import('@/components/modules/fullscreen-chore-chart/FullscreenChoreChartModule')),
} as unknown as Record<BuiltinModuleType, ComponentType<Record<string, unknown>>>;

/** Resolve a module type to its React component. Checks built-in first, then plugins. */
export function getModuleComponent(type: ModuleType): ComponentType<Record<string, unknown>> | undefined {
  if (type in builtinComponents) {
    return builtinComponents[type as BuiltinModuleType];
  }
  // Check plugin store for plugin:* types
  if (type.startsWith('plugin:')) {
    return usePluginStore.getState().plugins.get(type)?.component;
  }
  return undefined;
}

