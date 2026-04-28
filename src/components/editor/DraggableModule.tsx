'use client';

import { useRef, useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Clock } from 'lucide-react';
import { GRID_SIZE, snapToGrid } from '@/lib/constants';
import { useEditorStore } from '@/stores/editor-store';
import { getModuleDefinition } from '@/lib/module-registry';
import { getModuleComponent } from '@/lib/module-components';
import { isModuleVisible } from '@/lib/schedule';
import PluginPlaceholder from '@/components/modules/PluginPlaceholder';
import { resolveProvider } from '@/components/display/ScreenRenderer';
import type { ModuleInstance } from '@/types/config';
import { buildModuleShadow } from '@/lib/module-style';
import type { PreviewData } from './usePreviewData';

export interface PreviewSettings {
  latitude: number | undefined;
  longitude: number | undefined;
  timezone: string | undefined;
  globalProvider: string;
  units: 'metric' | 'imperial';
  fullscreenTheme: string | undefined;
}

function ModulePreview({ mod, previewData, settings }: { mod: ModuleInstance; previewData: PreviewData; settings: PreviewSettings | null }) {
  const displays = useEditorStore((s) => s.config?.displays);
  const Component = getModuleComponent(mod.type);
  if (!Component) {
    if (mod.type.startsWith('plugin:')) {
      return <PluginPlaceholder moduleType={mod.type} />;
    }
    return null;
  }

  const extraProps: Record<string, unknown> = {};

  // Pass timezone and fullscreen theme to all modules
  if (settings?.timezone) {
    extraProps.timezone = settings.timezone;
  }
  if (settings?.fullscreenTheme) {
    extraProps.fullscreenTheme = settings.fullscreenTheme;
  }

  // Pass global location to location-aware modules (registry-driven)
  const def = getModuleDefinition(mod.type);
  if (def?.dataRequirements?.includes('location') && settings) {
    extraProps.latitude = settings.latitude;
    extraProps.longitude = settings.longitude;
  }

  // Resolve provider for weather modules
  const globalProvider = settings?.globalProvider ?? 'weatherapi';
  const modProvider = resolveProvider(mod, globalProvider);
  const wd = previewData.weatherByProvider[modProvider] ?? previewData.weatherByProvider[globalProvider];

  // Inject weather data for weather modules or plugins declaring the requirement
  const needsWeather = mod.type === 'weather' || def?.dataRequirements?.includes('weather');
  if (needsWeather) {
    if (settings?.latitude == null || settings?.longitude == null) {
      extraProps.locationMissing = true;
    }
    if (wd) {
      extraProps.hourly = wd.hourly ?? [];
      extraProps.forecast = wd.forecast ?? [];
      extraProps.minutely = wd.minutely ?? undefined;
      extraProps.alerts = wd.alerts ?? undefined;
    }
    extraProps.units = settings?.units;
  }

  // Inject calendar data for calendar modules or plugins declaring the requirement
  const needsCalendar = mod.type === 'calendar' || def?.dataRequirements?.includes('calendar');
  if (needsCalendar) {
    extraProps.events = previewData.calendarEvents;
  }

  // TargetPicker footprint matters for sizing; empty here would hide the picker
  // behind isLegacyMode even when allowRetargeting is on.
  if (mod.type === 'display-control') {
    extraProps.availableDisplays = displays?.map((d) => ({ id: d.id, name: d.name })) ?? [];
  }

  return <Component config={mod.config} style={mod.style} {...extraProps} />;
}

export default function DraggableModule({
  mod,
  scale,
  isSelected,
  onSelect,
  onResize,
  previewData,
  settings,
  now,
}: {
  mod: ModuleInstance;
  scale: number;
  isSelected: boolean;
  onSelect: () => void;
  onResize: (size: { w: number; h: number }) => void;
  previewData: PreviewData;
  settings: PreviewSettings | null;
  now: Date;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `module-${mod.id}`,
    data: { source: 'canvas', moduleId: mod.id },
  });

  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: mod.size.w,
        startH: mod.size.h,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const dx = (ev.clientX - resizeRef.current.startX) / scale;
        const dy = (ev.clientY - resizeRef.current.startY) / scale;
        const snap = useEditorStore.getState().snapEnabled;
        const align = snap ? snapToGrid : Math.round;
        onResize({
          w: Math.max(GRID_SIZE * 2, align(resizeRef.current.startW + dx)),
          h: Math.max(GRID_SIZE * 2, align(resizeRef.current.startH + dy)),
        });
      };

      const handleMouseUp = () => {
        resizeRef.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [mod.size, scale, onResize],
  );

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
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
          isSelected ? 'ring-2 ring-hs-accent ring-offset-1 ring-offset-transparent' : ''
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
          <ModulePreview mod={mod} previewData={previewData} settings={settings} />
        </div>
      </div>
      {/* Type label overlay */}
      <div className="absolute top-0 left-0 px-1.5 py-0.5 bg-black/50 rounded-br text-white" style={{ fontSize: Math.max(7, 9 * scale) }}>
        {getModuleDefinition(mod.type)?.label || mod.type}
      </div>
      {/* Schedule indicator badge */}
      {mod.schedule && (
        <div
          className={`absolute top-0 right-0 p-0.5 rounded-bl ${
            isModuleVisible(mod.schedule, now)
              ? 'bg-hs-accent/70 text-white'
              : 'bg-amber-600/70 text-amber-200'
          }`}
          title={isModuleVisible(mod.schedule, now) ? 'Scheduled — currently active' : 'Scheduled — currently inactive'}
        >
          <Clock style={{ width: Math.max(8, 10 * scale), height: Math.max(8, 10 * scale) }} />
        </div>
      )}
      {isSelected && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute bottom-0 right-0 w-3 h-3 bg-hs-accent cursor-se-resize rounded-tl"
          style={{ zIndex: 999 }}
        />
      )}
    </div>
  );
}
