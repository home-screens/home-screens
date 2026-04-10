'use client';

import { Monitor, ChevronDown } from 'lucide-react';
import { useEditorStore, orientDimensions } from '@/stores/editor-store';

/**
 * Display picker for the editor toolbar. Shows which display the editor is
 * currently laying out, and lets the user switch to any registered display
 * without leaving the editor.
 *
 * Hidden entirely when `config.displays` is empty (legacy single-display
 * install) so the editor looks exactly like it used to for users who don't
 * care about multi-display.
 */
export default function DisplaySwitcher() {
  const { config, selectedDisplayId, setSelectedDisplay } = useEditorStore();

  const displays = config?.displays ?? [];
  if (displays.length === 0) return null;

  const active = displays.find((d) => d.id === selectedDisplayId) ?? displays[0];
  // Show orientation-corrected dimensions so the pill matches whatever the
  // canvas is actually rendering, even if the stored values are in the
  // "wrong" order relative to the rotation.
  const oriented = active.displayWidth && active.displayHeight
    ? orientDimensions(active.displayWidth, active.displayHeight, active.displayTransform)
    : null;
  const dimensions = oriented ? `${oriented.width}×${oriented.height}` : null;

  return (
    <div className="relative shrink-0" title="Which display is this canvas editing? (Settings overrides live in Settings → Per display.)">
      <label className="sr-only" htmlFor="editor-display-switcher">
        Which display is this canvas editing?
      </label>
      <div className="flex items-center gap-2 rounded-md border border-hs-border-strong bg-hs-card/70 px-2.5 py-1.5 text-xs text-hs-text-body hover:bg-hs-hover transition-colors">
        <Monitor className="w-3.5 h-3.5 text-hs-text-faint shrink-0" />
        <div className="flex flex-col leading-tight">
          <span className="font-medium text-hs-text-body">{active.name}</span>
          {dimensions && (
            <span className="text-[10px] text-hs-text-faint tabular-nums">
              {dimensions}
              {active.displayTransform && active.displayTransform !== 'normal'
                ? ` · ${active.displayTransform}°`
                : ''}
            </span>
          )}
        </div>
        <ChevronDown className="w-3 h-3 text-hs-text-faint shrink-0" />
        <select
          id="editor-display-switcher"
          value={active.id}
          onChange={(e) => setSelectedDisplay(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
          aria-label="Which display is this canvas editing?"
        >
          {displays.map((d) => {
            // Apply the same orientation normalization as the pill so the
            // dropdown label never shows a portrait-shape pair next to a
            // landscape rotation (or vice versa) on legacy data that got
            // stored in the "wrong" order.
            const optDims = d.displayWidth && d.displayHeight
              ? orientDimensions(d.displayWidth, d.displayHeight, d.displayTransform)
              : null;
            return (
              <option key={d.id} value={d.id}>
                {d.name}
                {optDims ? ` (${optDims.width}×${optDims.height})` : ''}
              </option>
            );
          })}
        </select>
      </div>
    </div>
  );
}
