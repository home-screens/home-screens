'use client';

import { useTZClock } from '@/hooks/useTZClock';
import type { GreetingConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import { hasAccentColor } from '@/lib/constants';
import { useEventBus } from '@/hooks/useEventBus';
import type { WeatherCondition } from '@/lib/event-bus';

interface GreetingModuleProps {
  config: GreetingConfig;
  style: ModuleStyle;
  timezone?: string;
}

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

function getTimeAccent(hour: number, accentColor?: string): string {
  if (hasAccentColor(accentColor)) return accentColor;
  if (hour >= 5 && hour < 12) return '#fbbf24';
  if (hour >= 12 && hour < 17) return '#f9fafb';
  if (hour >= 17 && hour < 21) return '#f97316';
  return '#93c5fd';
}

function getWeatherSuffix(condition: WeatherCondition): string | null {
  switch (condition) {
    case 'rain':
    case 'drizzle': return 'Rainy day ahead';
    case 'snow': return 'Bundle up today';
    case 'thunderstorm': return 'Storms expected';
    case 'clear': return 'Beautiful day ahead';
    default: return null;
  }
}

export default function GreetingModule({ config, style, timezone }: GreetingModuleProps) {
  const now = useTZClock(timezone);
  const weather = useEventBus('weather.conditions');
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.12);

  const name = config.name ?? 'Friend';
  const greeting = getGreeting(now.getHours());
  const accent = getTimeAccent(now.getHours(), config.accentColor);
  const suffix = weather ? getWeatherSuffix(weather.condition) : null;

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
