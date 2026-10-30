'use client';

import { memo, useMemo, type CSSProperties } from 'react';
import type { Screen } from '@/types/config';
import type { DisplaySettings } from './useLiveConfig';
import { getModuleComponent } from '@/lib/module-components';
import { getLocation } from '@/lib/location';
import { buildModuleProps, toDisplaySource, type SharedDisplayData } from '@/lib/module-props';
import { getModuleDefinition } from '@/lib/module-registry';
import { resolveModuleStyle } from '@/lib/module-style';
import { collectConditionSourceKeys, passesModuleGates, type ScheduleClock } from '@/lib/schedule';
import { collectPinnedModules } from '@/lib/pinned-modules';
import { useSharedStateKeys } from '@/hooks/useSharedStateKeys';
import ModuleErrorBoundary from '@/components/ModuleErrorBoundary';
import PluginPlaceholder from '@/components/modules/PluginPlaceholder';
import { useTranslate } from '@/i18n';
import { usePluginStore } from '@/stores/plugin-store';
interface PinnedModuleLayerProps {
  /** The display's screens; the layer picks the flagged modules itself. */
  screens: Screen[];
  settings: DisplaySettings;
  sharedData: SharedDisplayData;
  now: ScheduleClock;
  displayW: number;
  displayH: number;
  scale: number;
  /** The canvas's centring offsets, so a pinned module lands where its home screen would draw it. */
  offsetTop: number;
  offsetLeft: number;
  /** The urgent-alert push the canvas carries (`'none'` when no bar is up). */
  transform: string;
  /** True while the wall is asleep: keep the layout, stop drawing (see canvasAsleep in ScreenRotator). */
  hidden?: boolean;
  availableDisplays?: Array<{ id: string; name: string }>;
  displayId?: string;
}

/**
 * Draws the modules flagged "Show on every screen" once, in a layer above
 * the rotating canvas, so they neither remount when the screen changes nor
 * move with the screen transition. Mirrors the canvas's geometry exactly
 * (same offsets, same zoom, same alert push); the container passes the
 * pointer through so swipes and taps between pinned modules still reach the
 * screen, and only the module boxes themselves take it.
 *
 * Page background requests from a pinned module are ignored on purpose: no
 * PageBackgroundProvider wraps this layer, so the no-op default context
 * swallows them. The screen underneath owns its background.
 *
 * Memoized like BackgroundProviderLayer: the rotator re-renders at least
 * once a minute and on every shared-state publish it subscribes to.
 */
const PinnedModuleLayer = memo(function PinnedModuleLayer({
  screens, settings, sharedData, now, displayW, displayH, scale, offsetTop, offsetLeft, transform, hidden = false, availableDisplays = [], displayId,
}: PinnedModuleLayerProps) {
  const tModules = useTranslate('modules');
  // A pinned plugin module resolves through getModuleComponent, which only
  // knows a plugin once its bundle has registered. The memo would otherwise
  // leave the placeholder up until something else re-rendered the layer.
  usePluginStore((s) => s.plugins.size);
  const pinned = useMemo(() => collectPinnedModules(screens), [screens]);
  const conditionKeys = useMemo(() => collectConditionSourceKeys(pinned.map((p) => p.mod)), [pinned]);
  const states = useSharedStateKeys(conditionKeys);
  const showing = useMemo(
    () => pinned.filter((p) => passesModuleGates(p.mod, now, states)),
    [pinned, now, states],
  );
  const location = getLocation(settings);

  if (showing.length === 0) return null;

  const outer: CSSProperties = {
    position: 'absolute',
    inset: 0,
    paddingTop: offsetTop,
    paddingLeft: offsetLeft,
    boxSizing: 'border-box',
    transform,
    transformOrigin: 'top center',
    transition: 'transform 300ms ease',
    pointerEvents: 'none',
    contentVisibility: hidden ? 'hidden' : undefined,
  };

  return (
    <div data-testid="pinned-layer" data-asleep={hidden ? '' : undefined} style={outer}>
      <div
        style={{
          width: displayW,
          height: displayH,
          position: 'relative',
          // zoom, not transform: scale(), for the same Firefox backdrop-filter
          // reason as ScreenRenderer.
          zoom: scale,
          isolation: 'isolate',
          // Captured apart from `root` by the View Transitions API, so the
          // screen transition's fade or slide runs under this layer while
          // it holds still.
          viewTransitionName: 'pinned-modules',
        }}
      >
        {showing.map(({ mod, screenId }) => {
          const Component = getModuleComponent(mod.type);
          const box: CSSProperties = {
            position: 'absolute',
            left: mod.position.x,
            top: mod.position.y,
            width: mod.size.w,
            height: mod.size.h,
            zIndex: mod.zIndex,
            pointerEvents: 'auto',
          };
          if (!Component) {
            if (!mod.type.startsWith('plugin:')) return null;
            return (
              <div key={mod.id} data-module-id={mod.id} data-module-type={mod.type} data-pinned="true" style={{ ...box, overflow: 'hidden' }}>
                <PluginPlaceholder moduleType={mod.type} />
              </div>
            );
          }
          const source = toDisplaySource(settings, location, sharedData, availableDisplays, {
            renderDisplayId: displayId,
            screenId,
          });
          const extraProps = buildModuleProps(mod, source);
          return (
            <div key={mod.id} data-module-id={mod.id} data-module-type={mod.type} data-pinned="true" style={box}>
              <ModuleErrorBoundary moduleType={mod.type} fallbackText={tModules('common.moduleFailed')}>
                <Component config={mod.config} style={resolveModuleStyle(mod.style, getModuleDefinition(mod.type))} {...extraProps} />
              </ModuleErrorBoundary>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default PinnedModuleLayer;
