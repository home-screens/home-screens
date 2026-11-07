'use client';

import { useMemo, useEffect } from 'react';
import type { Screen, ModuleInstance } from '@/types/config';
import type { DisplayDescriptor } from '@/lib/display-filter';
import { getModuleComponent } from '@/lib/module-components';
import ModuleErrorBoundary from '@/components/ModuleErrorBoundary';
import { OpenButtonSlot } from '@/components/modules/shared/OpenScreenButton';
import OpenedScreenBackChip, { CHIP_CLEAR_PX } from './OpenedScreenBackChip';
import { buildModuleProps, toDisplaySource, type SharedDisplayData } from '@/lib/module-props';
import { passesModuleGates, collectConditionSourceKeys, type ScheduleClock } from '@/lib/schedule';
import { DISPLAY_BACKGROUND } from '@/lib/constants';
import type { SharedStateEntry } from '@/lib/shared-state-types';
import { useSharedStateKeys } from '@/hooks/useSharedStateKeys';
import { useWallClock } from '@/hooks/useTZClock';
import type { DisplaySettings } from './useLiveConfig';
import { useTranslate } from '@/i18n';

/**
 * Single source of truth for the renderer's module-visibility predicate.
 * Exported so `__tests__/ScreenRenderer.test.tsx` can verify the exact
 * contract used in production — the test cannot mirror a stale copy of
 * the filter expression.
 *
 * `backgroundProvider` instances are unconditionally excluded here: they are
 * background-ONLY and render solely inside BackgroundProviderLayer. So are
 * `showOnEveryScreen` instances, which PinnedModuleLayer draws once above
 * the rotating canvas; drawing them here too would double them on their home
 * screen and remount them on every rotation.
 */
export const isModuleRenderable = (
  mod: ModuleInstance,
  now: ScheduleClock,
  states: ReadonlyMap<string, SharedStateEntry>,
): boolean =>
  !mod.backgroundProvider &&
  !mod.showOnEveryScreen &&
  passesModuleGates(mod, now, states);
import PluginPlaceholder from '@/components/modules/PluginPlaceholder';
import { PageBackgroundProvider, usePageBackground } from '@/contexts/PageBackgroundContext';
import { eventBus } from '@/lib/event-bus';
import { getLocation } from '@/lib/location';
import { getModuleDefinition } from '@/lib/module-registry';
import { resolveModuleStyle } from '@/lib/module-style';
import BackgroundMediaLayer from '@/components/BackgroundMediaLayer';
import { screenBackgroundSrc, type RotationAnswer } from '@/lib/screen-background';
import { displaySizedUrl } from '@/lib/media-paths';

interface ScreenRendererProps {
  screen: Screen;
  settings: DisplaySettings;
  rotatingBackground?: RotationAnswer;
  sharedData: SharedDisplayData;
  displayW: number;
  displayH: number;
  scale: number;
  /** Registered displays for display-control module target picker. Empty = legacy mode. */
  availableDisplays?: DisplayDescriptor[];
  /** Display id this page is rendering as — needed because the legacy /display route
   *  renders its main display inline rather than redirecting, so the URL doesn't carry
   *  the id. The display-control module uses this to resolve `defaultTarget: 'self'`. */
  displayId?: string;
  /**
   * Set while this screen was opened by a button, a dock tile or a command
   * and will go back: the way back, drawn inside the frame so it scales with
   * the wall. `hidden` while an overlay holds the display.
   */
  openedBack?: { name: string | null; onBack: () => void; hidden: boolean; goesBackAt: number | null };
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

function ScreenRendererInner({ screen, settings, rotatingBackground, sharedData, displayW, displayH, scale, availableDisplays = [], displayId, openedBack }: ScreenRendererProps) {
  const { overrideBackground } = usePageBackground();
  // The `modules` namespace is preloaded by the display layout's I18nProvider,
  // which wraps this component — same path PluginPlaceholder already uses.
  const tModules = useTranslate('modules');

  // Minute-resolution wall clock for module scheduling. The zone is the one
  // the host settings hand plugins too, so the hour and the zone named in the
  // event below always describe the same clock.
  const timezone = settings.timezone;
  const now = useWallClock(timezone);

  // Publish time period transitions to the event bus (fires at most 4x/day)
  const hour = Math.floor(now.minuteOfDay / 60);
  const timePeriod = getTimePeriod(hour);
  useEffect(() => {
    eventBus.publish('time.period', {
      period: timePeriod,
      hour,
      timezone,
    });
    // `hour` is intentionally excluded — we only want to fire on period transitions,
    // not every hour. The closure captures the correct hour at each transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timePeriod, timezone]);

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

  const canvas = { w: displayW, h: displayH };
  // Module-requested override takes priority over screen background. A
  // library picture is asked for at the canvas size (see displaySizedUrl).
  const rawBackground = overrideBackground
    ? displaySizedUrl(overrideBackground, canvas)
    : screenBackgroundSrc(screen, rotatingBackground, canvas);

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
        backgroundColor: DISPLAY_BACKGROUND,
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
      {/* Keyed by screen: a screen switch paints the new wall in its first frame
          under the View Transition; the crossfade is for a new picture on the
          same screen. */}
      <BackgroundMediaLayer key={screen.id} src={rawBackground} shade={screen.shade} effects={screen.effects} authenticate />

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
        const style = resolveModuleStyle(mod.style, getModuleDefinition(mod.type));
        // While the back chip is drawn, a module that reaches the frame's
        // bottom gives up the strip the chip sits on, so a full-screen book
        // ends above the chip instead of under it.
        const clearBottom = openedBack ? displayH - CHIP_CLEAR_PX : displayH;
        const height = mod.position.y + mod.size.h > clearBottom
          ? Math.max(0, clearBottom - mod.position.y)
          : mod.size.h;

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
              height,
              zIndex: mod.zIndex,
            }}
          >
            <OpenButtonSlot mod={mod} style={style}>
              <ModuleErrorBoundary moduleType={mod.type} fallbackText={tModules('common.moduleFailed')}>
                <Component config={mod.config} style={style} {...extraProps} />
              </ModuleErrorBoundary>
            </OpenButtonSlot>
          </div>
        );
      })}
      {openedBack && (
        // The strip stays while an overlay is up (no black band under a
        // recipe card); only the chip steps aside.
        <OpenedScreenBackChip
          screen={screen}
          returnName={openedBack.name}
          settings={settings}
          onBack={openedBack.onBack}
          chipHidden={openedBack.hidden}
          goesBackAt={openedBack.goesBackAt}
        />
      )}
    </div>
  );
}
