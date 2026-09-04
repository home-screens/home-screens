'use client';

import { useMemo, useEffect, useRef, useState } from 'react';
import type { Screen, GlobalSettings, ModuleInstance } from '@/types/config';
import { getModuleComponent } from '@/lib/module-components';
import ModuleErrorBoundary from '@/components/ModuleErrorBoundary';
import { buildModuleProps, toDisplaySource, type SharedDisplayData } from '@/lib/module-props';
import { isModuleEnabled, isModuleVisible, evaluateVisibility, collectConditionSourceKeys } from '@/lib/schedule';
import type { SharedStateEntry } from '@/lib/shared-state-types';
import { useSharedStateKeys } from '@/hooks/useSharedStateKeys';
import { useTZClock } from '@/hooks/useTZClock';
import { useTranslate } from '@/i18n';

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
  // `now` is the same timezone-shifted minute clock the schedule check uses, so
  // a `time` visibility condition re-evaluates on the existing minute tick — no
  // extra timer needed on the display's module path.
  evaluateVisibility(mod.visibility, states, now);
import PluginPlaceholder from '@/components/modules/PluginPlaceholder';
import { PageBackgroundProvider, usePageBackground } from '@/contexts/PageBackgroundContext';
import { useAuthImage } from './useAuthImage';
import { eventBus } from '@/lib/event-bus';
import { getLocation } from '@/lib/location';

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

function getTimePeriod(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
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
  // The `modules` namespace is preloaded by the display layout's I18nProvider,
  // which wraps this component — same path PluginPlaceholder already uses.
  const tModules = useTranslate('modules');

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
  // A background file that is gone from the hub must not leave Chromium's
  // broken-image glyph in the corner of the wall: the img hides itself and
  // the solid background shows. Keyed by source so a new path gets its try.
  const [failedBackground, setFailedBackground] = useState<string | null>(null);
  const showBackgroundImage = !!backgroundImage && failedBackground !== backgroundImage;
  // The display route is server-rendered, so the img is in the HTML before
  // React hydrates and a 404 can fire its error before onError is attached.
  // After mount, an img that is complete with no pixels is probed again with
  // a listener in place; a real failure re-fires from the browser cache.
  const backgroundImgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = backgroundImgRef.current;
    if (!img || !img.complete || img.naturalWidth > 0) return;
    const probe = new Image();
    probe.onerror = () => setFailedBackground(backgroundImage);
    probe.src = backgroundImage;
    return () => { probe.onerror = null; };
  }, [backgroundImage]);

  // `renderDisplayId` is the authoritative render-as id: the URL alone is
  // unreliable, because the legacy /display route renders a multi-display main
  // inline without redirecting. Which modules receive it, and which receive the
  // instance address, is declared in the registry (`rendersAsDisplay` /
  // `needsInstanceAddress`) and applied by `buildModuleProps`.
  const source = toDisplaySource(settings, getLocation(settings), sharedData, availableDisplays, {
    renderDisplayId: displayId,
    screenId: screen.id,
  });

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
        // zoom establishes no stacking context, so without this the module
        // zIndexes would compete with sibling display chrome (pagination
        // dots z-100, network indicator z-99) in ScreenRotator.
        isolation: 'isolate',
      }}
    >
      {showBackgroundImage && (
        <img
          ref={backgroundImgRef}
          src={backgroundImage}
          alt=""
          onError={() => setFailedBackground(backgroundImage)}
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

        if (!Component) {
          if (mod.type.startsWith('plugin:')) {
            return (
              <div
                key={mod.id}
                data-module-id={mod.id}
                data-module-type={mod.type}
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

        const extraProps = buildModuleProps(mod, source);

        return (
          <div
            key={mod.id}
            data-module-id={mod.id}
            data-module-type={mod.type}
            style={{
              position: 'absolute',
              left: mod.position.x,
              top: mod.position.y,
              width: mod.size.w,
              height: mod.size.h,
              zIndex: mod.zIndex,
            }}
          >
            <ModuleErrorBoundary moduleType={mod.type} fallbackText={tModules('common.moduleFailed')}>
              <Component config={mod.config} style={mod.style} {...extraProps} />
            </ModuleErrorBoundary>
          </div>
        );
      })}
    </div>
  );
}
