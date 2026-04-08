'use client';

import { Monitor } from 'lucide-react';
import { useEditorStore, orientDimensions } from '@/stores/editor-store';

/**
 * Sticky "Editing: <display>" header for per-display settings tabs (Display,
 * Sleep, Alerts). Makes it unmistakable which display the form fields will
 * affect when the user saves, and offers a switch-display dropdown that
 * mirrors the editor toolbar's `<DisplaySwitcher>`.
 *
 * Hidden entirely in single-display mode (`config.displays` empty / undefined)
 * so legacy installs see zero UI change.
 */
export default function DisplayContextHeader() {
  const { config, selectedDisplayId, setSelectedDisplay } = useEditorStore();
  const displays = config?.displays ?? [];
  if (displays.length === 0) return null;

  const active = displays.find((d) => d.id === selectedDisplayId) ?? displays[0];
  // Show orientation-corrected dims so the label can't contradict the
  // rotation the user picked elsewhere in the app.
  const oriented = active.displayWidth && active.displayHeight
    ? orientDimensions(active.displayWidth, active.displayHeight, active.displayTransform)
    : null;
  const dimensions = oriented ? `${oriented.width}×${oriented.height}` : null;
  const rotation = active.displayTransform && active.displayTransform !== 'normal'
    ? `${active.displayTransform}°`
    : null;

  return (
    <div className="mb-5 rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-3 flex items-center gap-3">
      <Monitor className="w-5 h-5 text-neutral-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wider text-neutral-500">Editing</span>
          <span className="text-sm font-medium text-neutral-100">{active.name}</span>
          {dimensions && (
            <span className="text-[11px] text-neutral-500 tabular-nums">
              {dimensions}
              {rotation ? ` · ${rotation}` : ''}
            </span>
          )}
        </div>
        <p className="text-[11px] text-neutral-500 mt-0.5">
          Changes here only apply to this display.
        </p>
      </div>
      {displays.length > 1 && (
        <div className="relative shrink-0">
          <label htmlFor="display-context-switch" className="sr-only">
            Switch display
          </label>
          <select
            id="display-context-switch"
            value={active.id}
            onChange={(e) => setSelectedDisplay(e.target.value)}
            className="rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700 transition-colors cursor-pointer"
            aria-label="Switch display"
          >
            {displays.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
