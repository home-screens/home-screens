'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DisplayControlConfig } from '@/types/config';
import { dispatchDisplayCommand as dispatchToHub } from '@/lib/display-dispatch';
import { useModuleSurface } from '@/components/modules/module-surface';
import { useDisplayId } from '@/hooks/useDisplayId';
import { resolveInitialTarget } from './resolveInitialTarget';
import { useTargetBrightness } from './useTargetBrightness';
import { BarLayout } from './BarLayout';
import { PadLayout } from './PadLayout';
import { PanelLayout } from './PanelLayout';
import { NavLayout } from './NavLayout';
import { DockLayout } from './DockLayout';
import { useRotation } from '@/components/display/rotation-context';
import type { LayoutProps } from './types';

const EMPTY_SCREENS: never[] = [];

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
  // Only the kiosk itself sends commands. An editor preview window stands
  // in for the display but a tap there must not sleep the real panel.
  const surface = useModuleSurface();
  const dispatchDisplayCommand = useCallback<typeof dispatchToHub>(
    (...args) => (surface === 'display' ? dispatchToHub(...args) : Promise.resolve()),
    [surface],
  );
  const isLegacyMode = availableDisplays.length === 0;

  const [currentTarget, setCurrentTarget] = useState<string | undefined>(() =>
    resolveInitialTarget(config.defaultTarget, renderDisplayId, availableDisplays),
  );

  // Re-resolve when the currently-targeted display is removed from the registry
  // mid-session; otherwise the picker silently shows a display that no longer
  // exists while commands continue dispatching to the removed slug.
  useEffect(() => {
    if (
      currentTarget !== undefined &&
      currentTarget !== 'all' &&
      !availableDisplays.some((d) => d.id === currentTarget)
    ) {
      setCurrentTarget(resolveInitialTarget(config.defaultTarget, renderDisplayId, availableDisplays));
    }
  }, [availableDisplays, currentTarget, config.defaultTarget, renderDisplayId]);

  const { value: brightness, markSent } = useTargetBrightness({
    target: currentTarget,
    selfId: renderDisplayId,
    availableDisplays,
    live: surface === 'display',
  });

  // 200ms trailing-edge debounce on rapid prev/next taps (spec edge case E6).
  // Collapses button-mashing into a single command so the queue doesn't flood.
  const debounceRef = useRef<{ type: 'prev-screen' | 'next-screen' | null; timer: ReturnType<typeof setTimeout> | null }>({ type: null, timer: null });

  // Cancel a pending debounce on unmount so a tap made just before the
  // screen rotates away doesn't dispatch from the dead component (with a
  // possibly stale target captured when the debounce was created).
  useEffect(() => {
    const state = debounceRef.current;
    return () => {
      if (state.timer) clearTimeout(state.timer);
    };
  }, []);

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
    [currentTarget, dispatchDisplayCommand],
  );

  const onPrev = useCallback(() => dispatchDebounced('prev-screen'), [dispatchDebounced]);
  const onNext = useCallback(() => dispatchDebounced('next-screen'), [dispatchDebounced]);

  const onSleep = useCallback(() => {
    void dispatchDisplayCommand(currentTarget, 'sleep');
  }, [currentTarget, dispatchDisplayCommand]);

  const onWake = useCallback(() => {
    void dispatchDisplayCommand(currentTarget, 'wake');
  }, [currentTarget, dispatchDisplayCommand]);

  const onBrightness = useCallback((pct: number) => {
    markSent(pct);
    void dispatchDisplayCommand(currentTarget, 'brightness', { value: pct });
  }, [currentTarget, dispatchDisplayCommand, markSent]);

  // The dock lists this display's own rotation and jumps it directly when the
  // target is this display: no hub round trip, so the tap lands at once, the
  // same path a tap on the dots takes. Another display gets a `goto-screen`
  // by name, since ids differ per display and the hub refuses a broadcast
  // of it; "All displays" is this display locally plus every other one by name.
  const rotation = useRotation();
  const onGoto = useCallback((index: number) => {
    const screen = rotation?.screens[index];
    if (!screen) return;
    const targetsSelf = currentTarget === undefined || currentTarget === renderDisplayId;
    if (targetsSelf || currentTarget === 'all') rotation?.goToScreen(index);
    if (targetsSelf) return;
    const payload = { screen: screen.name.trim() || screen.id };
    const others = currentTarget === 'all'
      ? availableDisplays.filter((d) => d.id !== renderDisplayId).map((d) => d.id)
      : [currentTarget];
    for (const id of others) void dispatchDisplayCommand(id, 'goto-screen', payload);
  }, [rotation, currentTarget, renderDisplayId, availableDisplays, dispatchDisplayCommand]);

  const layoutProps: LayoutProps = {
    currentTarget,
    setCurrentTarget,
    selfId: renderDisplayId,
    allowRetargeting: config.allowRetargeting,
    compact: config.compact === true,
    availableDisplays,
    isLegacyMode,
    brightness,
    onPrev,
    onNext,
    onSleep,
    onWake,
    onBrightness,
  };

  switch (config.layout) {
    case 'bar':
      return <BarLayout {...layoutProps} />;
    case 'pad':
      return <PadLayout {...layoutProps} />;
    case 'nav':
      return <NavLayout {...layoutProps} />;
    case 'dock':
      return (
        <DockLayout
          {...layoutProps}
          screens={rotation?.screens ?? EMPTY_SCREENS}
          activeIndex={rotation?.activeIndex ?? -1}
          onGoto={onGoto}
          extras={config.dockExtras === true}
        />
      );
    case 'panel':
    default:
      return <PanelLayout {...layoutProps} />;
  }
}
