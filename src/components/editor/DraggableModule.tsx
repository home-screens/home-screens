'use client';

import { memo, useMemo, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { usePluginStore } from '@/stores/plugin-store';
import { resolveModuleLabel } from '@/lib/module-registry';
import { getModuleComponent } from '@/lib/module-components';
import ModuleErrorBoundary from '@/components/ModuleErrorBoundary';
import { ModuleSurfaceProvider } from '@/components/modules/module-surface';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { useEditorStore } from '@/stores/editor-store';
import { isModuleEnabled } from '@/lib/schedule';
import { describeModuleStatus, STATUS_BADGE_CLASS } from '@/lib/module-status';
import PluginPlaceholder from '@/components/modules/PluginPlaceholder';
import { buildModuleProps, type ModuleDataSource } from '@/lib/module-props';
import type { SharedStateEntry } from '@/lib/shared-state-types';
import type { SharedStateSource } from '@/hooks/useEditorSharedState';
import type { ModuleInstance } from '@/types/config';
import { buildModuleShadow } from '@/lib/module-style';

// Memoized: this renders the real module component (animations, canvases,
// videos), and the canvas re-renders on every shared-state poll and clock
// tick — none of which may reset module-internal state.
const ModulePreview = memo(function ModulePreview({ mod, source }: { mod: ModuleInstance; source: ModuleDataSource }) {
  // `modules`, not `editor`: the crash fallback is the same string the display
  // shows, and it belongs beside `common.pluginNotAvailable`.
  const tModules = useTranslate('modules');
  // Plugin components resolve through the reactive store, not the static
  // getModuleComponent lookup: the memo pins this render, so a plugin reload
  // swapping the registration under the same type must trigger it directly.
  const plugins = usePluginStore((s) => s.plugins);
  const Component = mod.type.startsWith('plugin:')
    ? plugins.get(mod.type)?.component
    : getModuleComponent(mod.type);
  if (!Component) {
    if (mod.type.startsWith('plugin:')) {
      return <PluginPlaceholder moduleType={mod.type} />;
    }
    return null;
  }

  // Same builder the kiosk display uses, so a prop wired up for one surface can
  // never go missing on the other. Editor-vs-display differences (where weather
  // payloads come from, the global-provider fallback) live in `toEditorSource`.
  const extraProps = buildModuleProps(mod, source);

  // A plugin that throws while rendering must not take the editor down with it
  // and discard unsaved config edits.
  return (
    <ModuleSurfaceProvider value="editor">
      <ModuleErrorBoundary moduleType={mod.type} fallbackText={tModules('common.moduleFailed')}>
        <Component config={mod.config} style={mod.style} {...extraProps} />
      </ModuleErrorBoundary>
    </ModuleSurfaceProvider>
  );
});

export default function DraggableModule({
  mod,
  scale,
  onSelect,
  onContextMenu,
  dataSource,
  now,
  verdictStates,
  source,
}: {
  mod: ModuleInstance;
  scale: number;
  /** `movedSinceDown` is true when the click is the tail of a drag, so the
   *  canvas selects the dragged module instead of cycling the overlap stack. */
  onSelect: (e: React.MouseEvent, movedSinceDown: boolean) => void;
  /** Right-click: the canvas opens the module menu at the pointer. */
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Normalized preview data for the module component (see `toEditorSource`). */
  dataSource: ModuleDataSource;
  now: Date;
  /** Fresh shared-state snapshot from the selected display, or null when the
   *  display hasn't reported recently — the condition badge stays neutral. */
  verdictStates?: ReadonlyMap<string, SharedStateEntry> | null;
  /** Where the live values came from — an 'editor' source drops the "on the
   *  display" claim from the met/unmet badge tooltip. */
  source?: SharedStateSource | null;
}) {
  const t = useTranslate('editor');
  const formattingLocale = useFormattingLocale();
  const timeFormat = useEditorStore((s) => s.config?.settings.timeFormat);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `module-${mod.id}`,
    data: { source: 'canvas', moduleId: mod.id },
  });

  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const labelText = resolveModuleLabel(mod.type, t);

  // Status badges stack right-to-left in the top-right corner; each entry
  // occupies one fixed-width slot so any combination lines up. The wording
  // comes from the shared describer, so the corner icon, the chip below and
  // the property panel can never disagree about the same module.
  const iconSize = Math.max(8, 10 * scale);
  const badgeStep = Math.max(12, 14 * scale) + 2;
  // date-fns-backed; the canvas re-renders every module on every clock tick
  // and shared-state poll, so this must not redo the formatting work when
  // nothing about THIS module's status actually changed.
  const statuses = useMemo(
    () => describeModuleStatus(mod, { t, now, formattingLocale, timeFormat, verdictStates, source }),
    [mod, t, now, formattingLocale, timeFormat, verdictStates, source],
  );

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      data-module-id={mod.id}
      data-module-type={mod.type}
      onPointerDownCapture={(e) => {
        pointerDownPos.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={(e) => {
        e.stopPropagation();
        const down = pointerDownPos.current;
        const moved = down ? Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 : false;
        onSelect(e, moved);
      }}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e);
      }}
      className={`absolute ${isDragging ? 'opacity-60' : ''}`}
      style={{
        left: mod.position.x * scale,
        top: mod.position.y * scale,
        width: mod.size.w * scale,
        height: mod.size.h * scale,
        zIndex: mod.zIndex,
        borderRadius: mod.style.borderRadius * scale,
        boxShadow: (mod.style.shadowSize ?? 0) > 0
          ? buildModuleShadow(mod.style.shadowSize ?? 0, scale)
          : undefined,
      }}
    >
      {/* Live preview: render module at native size, scale down with CSS */}
      <div
        {...listeners}
        className={`w-full h-full overflow-hidden transition-shadow cursor-grab ${
          !isModuleEnabled(mod) ? 'opacity-40 grayscale' : mod.backgroundProvider ? 'opacity-40' : ''
        }`}
        style={{
          borderRadius: mod.style.borderRadius * scale,
        }}
      >
        <div
          style={{
            width: mod.size.w,
            height: mod.size.h,
            // Use zoom instead of transform: scale() so that backdrop-filter
            // works in Firefox (FF Bug 1782876).
            zoom: scale,
            pointerEvents: 'none',
          }}
        >
          <ModulePreview mod={mod} source={dataSource} />
        </div>
      </div>
      {/* Type label overlay */}
      <div
        className="absolute top-0 left-0 px-1.5 py-0.5 bg-black/50 rounded-br text-white"
        style={{ fontSize: Math.max(7, 9 * scale), borderTopLeftRadius: mod.style.borderRadius * scale }}
      >
        {labelText}
      </div>
      {/* Status badges (disabled / schedule / condition / background provider) */}
      {statuses.map((status, i) => (
        <div
          key={status.key}
          {...(status.key === 'condition'
            ? { 'data-condition-badge': status.tone === 'active' ? 'met' : status.tone === 'waiting' ? 'unmet' : 'neutral' }
            : {})}
          className={`absolute top-0 p-0.5 rounded-bl ${STATUS_BADGE_CLASS[status.tone]}`}
          style={{
            right: i * badgeStep,
            // The badge in the corner slot hugs the module's rounded corner.
            borderTopRightRadius: i === 0 ? mod.style.borderRadius * scale : undefined,
          }}
          title={status.detail}
        >
          <status.icon style={{ width: iconSize, height: iconSize }} />
        </div>
      ))}
    </div>
  );
}
