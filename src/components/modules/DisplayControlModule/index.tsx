'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DisplayControlConfig } from '@/types/config';
import { dispatchDisplayCommand } from '@/lib/display-dispatch';
import { useDisplayId } from '@/hooks/useDisplayId';
import { resolveInitialTarget } from './resolveInitialTarget';
import { BarLayout } from './BarLayout';
import { PadLayout } from './PadLayout';
import { PanelLayout } from './PanelLayout';
import type { LayoutProps } from './types';

export interface DisplayControlModuleProps {
  config: DisplayControlConfig;
  /** Optional injection for tests; normal usage reads from config. */
  availableDisplays?: Array<{ id: string; name: string }>;
  /** Authoritative render-as display id, threaded down from ScreenRenderer.
   *  Preferred over the URL-based useDisplayId() because the legacy /display
   *  route renders multi-display main inline without redirecting, so
   *  usePathname() returns "/display" rather than "/display/<id>" for that case. */
  renderDisplayId?: string;
}

export default function DisplayControlModule({
  config,
  availableDisplays = [],
  renderDisplayId: renderDisplayIdProp,
}: DisplayControlModuleProps) {
  const urlDisplayId = useDisplayId();
  const renderDisplayId = renderDisplayIdProp ?? urlDisplayId;
  const isLegacyMode = availableDisplays.length === 0;

  const [currentTarget, setCurrentTarget] = useState<string | undefined>(() =>
    resolveInitialTarget(config.defaultTarget, renderDisplayId, availableDisplays),
  );

  // Re-resolve when the currently-targeted display is removed from the registry
  // mid-session; otherwise the picker silently falls back to "All" in dropdown
  // mode while commands continue dispatching to the removed slug.
  useEffect(() => {
    if (
      currentTarget !== undefined &&
      currentTarget !== 'all' &&
      !availableDisplays.some((d) => d.id === currentTarget)
    ) {
      setCurrentTarget(resolveInitialTarget(config.defaultTarget, renderDisplayId, availableDisplays));
    }
  }, [availableDisplays, currentTarget, config.defaultTarget, renderDisplayId]);

  // 200ms trailing-edge debounce on rapid prev/next taps (spec edge case E6).
  // Collapses button-mashing into a single command so the queue doesn't flood.
  const debounceRef = useRef<{ type: 'prev-screen' | 'next-screen' | null; timer: ReturnType<typeof setTimeout> | null }>({ type: null, timer: null });

  const dispatchDebounced = useCallback(
    (type: 'prev-screen' | 'next-screen') => {
      const state = debounceRef.current;
      if (state.timer) clearTimeout(state.timer);
      state.type = type;
      state.timer = setTimeout(() => {
        void dispatchDisplayCommand(currentTarget, type);
        state.type = null;
        state.timer = null;
      }, 200);
    },
    [currentTarget],
  );

  const onPrev = useCallback(() => dispatchDebounced('prev-screen'), [dispatchDebounced]);
  const onNext = useCallback(() => dispatchDebounced('next-screen'), [dispatchDebounced]);

  const onSleep = useCallback(() => {
    void dispatchDisplayCommand(currentTarget, 'sleep');
  }, [currentTarget]);

  const onBrightness = useCallback((pct: number) => {
    void dispatchDisplayCommand(currentTarget, 'brightness', { value: pct });
  }, [currentTarget]);

  const layoutProps: LayoutProps = {
    currentTarget,
    setCurrentTarget,
    allowRetargeting: config.allowRetargeting,
    availableDisplays,
    isLegacyMode,
    onPrev,
    onNext,
    onSleep,
    onBrightness,
  };

  switch (config.layout) {
    case 'bar':
      return <BarLayout {...layoutProps} />;
    case 'pad':
      return <PadLayout {...layoutProps} />;
    case 'panel':
    default:
      return <PanelLayout {...layoutProps} />;
  }
}
