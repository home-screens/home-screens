'use client';

import { useMemo } from 'react';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import AccordionSection from './AccordionSection';
import { INPUT_CLASS } from '@/components/ui/input-classes';

/**
 * Shown in the right property panel when a screen is selected but no module
 * is selected. Currently exposes the per-screen rotation duration override.
 *
 * Inherit → Override → numeric (seconds) input → Reset. Similar in spirit to
 * the per-display Settings > OverrideRow pattern, but without a Defaults-page
 * link: this override is per-screen against the global, not per-display
 * against a Defaults page.
 */
export default function ScreenSettingsSection() {
  const { config, selectedDisplayId, selectedScreenId, updateScreen } = useEditorStore();

  const screen = useMemo(() => {
    if (!config || !selectedScreenId) return null;
    return getActiveScreens(config, selectedDisplayId).find((s) => s.id === selectedScreenId) ?? null;
  }, [config, selectedDisplayId, selectedScreenId]);

  if (!config || !screen) return null;

  const defaultMs = config.settings.rotationIntervalMs;
  const defaultSec = Math.round(defaultMs / 1000);
  const overrideMs = screen.rotationDurationMs;
  const isOverridden = overrideMs !== undefined;
  const isSticky = isOverridden && overrideMs === 0;

  const moduleCount = screen.modules?.length ?? 0;

  const handleOverride = () => {
    // Seed the override with the current default so the input shows something
    // meaningful right away. User can then edit.
    updateScreen(screen.id, { rotationDurationMs: defaultMs });
  };

  const handleReset = () => {
    updateScreen(screen.id, { rotationDurationMs: undefined });
  };

  const handleChangeSeconds = (secondsText: string) => {
    const n = Number(secondsText);
    if (!Number.isFinite(n) || n < 0) return;
    updateScreen(screen.id, { rotationDurationMs: Math.round(n * 1000) });
  };

  return (
    <AccordionSection title="Screen settings">
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-hs-text-body">{screen.name}</span>
          <span className="text-[11px] text-hs-text-muted bg-hs-card px-1.5 py-0.5 rounded-full">
            {moduleCount} {moduleCount === 1 ? 'module' : 'modules'}
          </span>
        </div>

        <div className="border-t border-hs-border-strong pt-3">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="screen-rotation-duration" className="text-xs text-hs-text-muted">
              Rotation duration
            </label>
            {isOverridden ? (
              <button
                type="button"
                onClick={handleReset}
                className="text-[11px] font-medium px-2.5 py-1 rounded-md text-hs-accent-hover bg-hs-accent-soft border border-hs-accent/35 hover:bg-hs-accent/20 transition-colors"
              >
                Reset
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOverride}
                className="text-[11px] font-medium px-2.5 py-1 rounded-md text-hs-text-muted bg-hs-card border border-hs-border-strong hover:text-hs-text-body hover:bg-hs-hover transition-colors"
              >
                Override
              </button>
            )}
          </div>

          {isOverridden ? (
            <div>
              <div className="flex items-center gap-2">
                <input
                  id="screen-rotation-duration"
                  type="number"
                  min={0}
                  max={86400}
                  step={1}
                  value={Math.round((overrideMs ?? 0) / 1000)}
                  onChange={(e) => handleChangeSeconds(e.target.value)}
                  className={INPUT_CLASS + ' w-20 text-right'}
                />
                <span className="text-xs text-hs-text-muted">sec</span>
                {isSticky && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider bg-hs-warning/15 text-hs-warning border border-hs-warning/35 px-2 py-0.5 rounded-full">
                    Sticky
                  </span>
                )}
              </div>
              <p className="text-[11px] text-hs-text-faint mt-2">
                0 = stay on this screen (manual advance only).
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-hs-text-faint">
              Inherits the default: <strong className="text-hs-text-secondary">{defaultSec}s</strong>.
            </p>
          )}
        </div>
      </div>
    </AccordionSection>
  );
}
