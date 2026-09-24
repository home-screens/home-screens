'use client';

import { useTZClock } from '@/hooks/useTZClock';
import type { GreetingConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import { hasAccentColor } from '@/lib/constants';
import { useEventBus } from '@/hooks/useEventBus';
import type { WeatherCondition } from '@/lib/event-bus';
import { useTranslate } from '@/i18n';
import type { TranslateFn } from '@/i18n';

interface GreetingModuleProps {
  config: GreetingConfig;
  style: ModuleStyle;
  timezone?: string;
}

type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

function getDayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

const TIME_ACCENTS: Record<DayPart, string> = {
  morning: '#fbbf24',
  afternoon: '#f9fafb',
  evening: '#f97316',
  night: '#93c5fd',
};

/** Morning and afternoon talk about the day ahead; evening and night about the evening and the night. */
const WEATHER_KEYS: Record<DayPart, string> = {
  morning: 'greeting.weather',
  afternoon: 'greeting.weather',
  evening: 'greeting.weatherEvening',
  night: 'greeting.weatherNight',
};

function getWeatherSuffix(condition: WeatherCondition, part: DayPart, t: TranslateFn): string | null {
  const base = WEATHER_KEYS[part];
  switch (condition) {
    case 'rain':
    case 'drizzle': return t(`${base}.rain`);
    case 'snow': return t(`${base}.snow`);
    case 'thunderstorm': return t(`${base}.thunderstorm`);
    case 'clear': return t(`${base}.clear`);
    default: return null;
  }
}

export default function GreetingModule({ config, style, timezone }: GreetingModuleProps) {
  const t = useTranslate('modules');
  const now = useTZClock(timezone);
  const weather = useEventBus('weather.conditions');
  const { containerRef, scaledFontSize } = useScaledFontSize(style, 0.12);

  const name = config.name ?? t('greeting.defaultName');
  const part = getDayPart(now.getHours());
  const greeting = t(`greeting.${part}`);
  const accent = hasAccentColor(config.accentColor) ? config.accentColor : TIME_ACCENTS[part];
  const weatherAware = config.weatherAware ?? true;
  const suffix = weatherAware && weather ? getWeatherSuffix(weather.condition, part, t) : null;

  return (
    <ModuleWrapper style={style}>
      <div
        ref={containerRef}
        className="flex flex-col items-center justify-center h-full"
        style={{ fontSize: `${scaledFontSize}px` }}
      >
        <p className="text-center font-light" style={{ fontSize: '2em', color: accent }}>
          {greeting}, {name}
        </p>
        {suffix && (
          <p className="text-center font-light mt-1" style={{ fontSize: '0.8em', opacity: 0.5 }}>
            {suffix}
          </p>
        )}
      </div>
    </ModuleWrapper>
  );
}
