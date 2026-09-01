'use client';

import { memo, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Clock, PowerOff, Eye, EyeOff } from 'lucide-react';
import { usePluginStore } from '@/stores/plugin-store';
import { getModuleDefinition } from '@/lib/module-registry';
import { getModuleComponent } from '@/lib/module-components';
import ModuleErrorBoundary from '@/components/ModuleErrorBoundary';
import { ModuleSurfaceProvider } from '@/components/modules/module-surface';
import { useTranslate } from '@/i18n';
import { evaluateVisibility, isModuleEnabled, isModuleVisible } from '@/lib/schedule';
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
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `module-${mod.id}`,
    data: { source: 'canvas', moduleId: mod.id },
  });

  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const isPluginModule = mod.type.startsWith('plugin:');
  const definition = getModuleDefinition(mod.type);
  const labelText = isPluginModule
    ? (definition?.label || mod.type)
    : t(`registry.types.${mod.type}`);

  // Status badges stack right-to-left in the top-right corner; each entry
  // occupies one fixed-width slot so any combination lines up.
  const iconSize = Math.max(8, 10 * scale);
  const badgeStep = Math.max(12, 14 * scale) + 2;
  const badges: { key: string; className: string; title: string; icon: typeof Clock; data?: Record<string, string> }[] = [];
  if (!isModuleEnabled(mod)) {
    badges.push({
      key: 'disabled',
      className: 'bg-red-700/70 text-red-100',
      title: t('draggableModule.disabledTitle'),
      icon: PowerOff,
    });
  } else {
    if (mod.schedule) {
      badges.push({
        key: 'schedule',
        className: isModuleVisible(mod.schedule, now)
          ? 'bg-hs-accent/70 text-white'
          : 'bg-amber-600/70 text-amber-200',
        title: isModuleVisible(mod.schedule, now)
          ? t('draggableModule.scheduledActiveTitle')
          : t('draggableModule.scheduledInactiveTitle'),
        icon: Clock,
      });
    }
    // Live pass/fail tint from the display's last-reported snapshot (the
    // same evaluateVisibility the display runs). Neutral when no fresh
    // snapshot exists — display offline must never read as a stale verdict.
    if ((mod.visibility?.conditions?.length ?? 0) > 0) {
      // `now` is the TZ-shifted clock already used for the schedule badge above.
      // Omitting it made evaluateVisibility fall back to `new Date()` in the
      // browser's zone, so a `time` condition could disagree with both the
      // property panel and the display whenever the editor's zone differs from
      // the configured display timezone.
      const verdict = verdictStates
        ? (evaluateVisibility(mod.visibility, verdictStates, now) ? 'met' : 'unmet')
        : null;
      badges.push({
        key: 'condition',
        data: { 'data-condition-badge': verdict ?? 'neutral' },
        className:
          verdict === 'met'
            ? 'bg-hs-accent/70 text-white'
            : verdict === 'unmet'
              ? 'bg-amber-600/70 text-amber-200'
              : 'bg-slate-600/70 text-slate-200',
        title:
          verdict === 'met'
            ? t(source === 'editor' ? 'draggableModule.conditionMetTitleEditor' : 'draggableModule.conditionMetTitle')
            : verdict === 'unmet'
              ? t(source === 'editor' ? 'draggableModule.conditionUnmetTitleEditor' : 'draggableModule.conditionUnmetTitle')
              : t('draggableModule.conditionGatedTitle'),
        icon: verdict === 'unmet' ? EyeOff : Eye,
      });
    }
  }
  if (mod.backgroundProvider) {
    badges.push({
      key: 'backgroundProvider',
      className: 'bg-amber-600/70 text-amber-100',
      title: t('draggableModule.backgroundProviderTitle'),
      icon: EyeOff,
    });
  }

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
      {/* Full-screen modules get a tinted frame and a centred name — their
          unconfigured preview is often a plain dark card, and without this a
          fillsCanvas drop looks like nothing happened while the real wall
          now shows only this module. */}
      {definition?.fillsCanvas && (
        <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-white/25 bg-white/[0.04] flex items-center justify-center">
          <span
            className="px-2.5 py-1 rounded-md bg-black/55 text-white/90 font-medium"
            style={{ fontSize: Math.max(11, 14 * scale) }}
          >
            {labelText}
          </span>
        </div>
      )}
      {/* Type label overlay */}
      <div
        className="absolute top-0 left-0 px-1.5 py-0.5 bg-black/50 rounded-br text-white"
        style={{ fontSize: Math.max(7, 9 * scale), borderTopLeftRadius: mod.style.borderRadius * scale }}
      >
        {labelText}
      </div>
      {/* Status badges (disabled / schedule / condition / background provider) */}
      {badges.map((badge, i) => (
        <div
          key={badge.key}
          {...badge.data}
          className={`absolute top-0 p-0.5 rounded-bl ${badge.className}`}
          style={{
            right: i * badgeStep,
            // The badge in the corner slot hugs the module's rounded corner.
            borderTopRightRadius: i === 0 ? mod.style.borderRadius * scale : undefined,
          }}
          title={badge.title}
        >
          <badge.icon style={{ width: iconSize, height: iconSize }} />
        </div>
      ))}
    </div>
  );
}
