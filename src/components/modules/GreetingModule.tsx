'use client';

import { useTZClock } from '@/hooks/useTZClock';
import type { GreetingConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';

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

export default function GreetingModule({ config, style, timezone }: GreetingModuleProps) {
  const now = useTZClock(timezone);
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.12);

  const name = config.name ?? 'Friend';
  const greeting = getGreeting(now.getHours());

  return (
    <ModuleWrapper style={style}>
      <div ref={containerRef} className="flex items-center justify-center h-full" style={{ fontSize: `${scaledFontSize}px` }}>
        <p className="text-center font-light" style={{ fontSize: '2em' }}>
          {greeting}, {name}
        </p>
      </div>
    </ModuleWrapper>
  );
}
