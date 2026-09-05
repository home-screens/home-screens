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

function getGreeting(hour: number, t: TranslateFn): string {
  if (hour >= 5 && hour < 12) return t('greeting.morning');
  if (hour >= 12 && hour < 17) return t('greeting.afternoon');
  if (hour >= 17 && hour < 21) return t('greeting.evening');
  return t('greeting.night');
}

function getTimeAccent(hour: number, accentColor?: string): string {
  if (hasAccentColor(accentColor)) return accentColor;
  if (hour >= 5 && hour < 12) return '#fbbf24';
  if (hour >= 12 && hour < 17) return '#f9fafb';
  if (hour >= 17 && hour < 21) return '#f97316';
  return '#93c5fd';
}

function getWeatherSuffix(condition: WeatherCondition, t: TranslateFn): string | null {
  switch (condition) {
    case 'rain':
    case 'drizzle': return t('greeting.weather.rain');
    case 'snow': return t('greeting.weather.snow');
    case 'thunderstorm': return t('greeting.weather.thunderstorm');
    case 'clear': return t('greeting.weather.clear');
    default: return null;
  }
}

export default function GreetingModule({ config, style, timezone }: GreetingModuleProps) {
  const t = useTranslate('modules');
  const now = useTZClock(timezone);
  const weather = useEventBus('weather.conditions');
  const { containerRef, scaledFontSize } = useScaledFontSize(style, 0.12);

  const name = config.name ?? t('greeting.defaultName');
  const greeting = getGreeting(now.getHours(), t);
  const accent = getTimeAccent(now.getHours(), config.accentColor);
  const weatherAware = config.weatherAware ?? true;
  const suffix = weatherAware && weather ? getWeatherSuffix(weather.condition, t) : null;

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
