'use client';

import { useState, useEffect, useId, type ComponentType } from 'react';
import type { CountdownConfig, CountdownView, ModuleStyle } from '@/types/config';
import { usePageBackground } from '@/contexts/PageBackgroundContext';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import ModuleWrapper from '../ModuleWrapper';
import { ModuleEmptyState } from '../ModuleStates';
import { processEvents } from './countdown-utils';
import CountdownAllView from './CountdownAllView';
import CountdownNextView from './CountdownNextView';
import type { CountdownViewProps } from './types';

const VIEW_COMPONENTS: Record<CountdownView, ComponentType<CountdownViewProps>> = {
  all: CountdownAllView,
  next: CountdownNextView,
};

interface CountdownModuleProps {
  config: CountdownConfig;
  style: ModuleStyle;
  timezone?: string;
}

export default function CountdownModule({ config, style, timezone }: CountdownModuleProps) {
  const [now, setNow] = useState(Date.now());
  const moduleId = useId();
  const scale = config.scale ?? 1;
  const basePx = 28 * scale;
  const view = config.view ?? 'all';
  const { register, unregister } = usePageBackground();

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const events = processEvents(
    config.events,
    config.showPastEvents ?? false,
    timezone,
    config.stayUntilEndOfDay ?? false,
  );

  void now;

  // Register this module's background with the page context.
  // Split into two effects: mount/unmount handles Map key lifetime,
  // update handles value changes in place (preserving insertion order).
  const activeBackground = events[0]?.backgroundImage || null;
  useEffect(() => {
    register(moduleId, null);
    return () => unregister(moduleId);
  }, [moduleId, register, unregister]);
  useEffect(() => {
    register(moduleId, activeBackground);
  }, [moduleId, activeBackground, register]);

  const ViewComponent = VIEW_COMPONENTS[view] ?? CountdownAllView;
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.06);

  if (events.length === 0) {
    return <ModuleEmptyState style={style} message="No countdowns set" />;
  }

  return (
    <ModuleWrapper style={style}>
      <div ref={containerRef} className="flex flex-col h-full overflow-hidden" style={{ fontSize: `${scaledFontSize}px`, gap: `${1.2 * scale}em` }}>
        <ViewComponent events={events} config={config} scale={scale} basePx={basePx} />
      </div>
    </ModuleWrapper>
  );
}
