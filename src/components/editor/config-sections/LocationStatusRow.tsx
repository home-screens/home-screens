'use client';

import { MapPin } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { getLocation } from '@/lib/location';
import { settingsPath } from '@/lib/settings-route';
import { formatCoords } from '@/components/modules/weather/location-label';
import { useTranslate } from '@/i18n';
import type { ModuleInstance } from '@/types/config';

/**
 * Rendered by PropertyPanel above the config section of every module whose
 * registry definition requires 'location' or 'weather' (built-in or plugin),
 * so a module cannot be location-bound without saying so here. While the
 * household location is unset it is the one thing the module needs, so it
 * says so and links straight to the Location page; once set, it shows where
 * the module thinks it is, so a wrong town is caught here rather than on the
 * wall.
 *
 * A module carrying its own non-zero `latitude`/`longitude` config (rain map)
 * is centred on those instead, so the row steps aside.
 */
export function LocationStatusRow({ mod }: { mod: ModuleInstance }) {
  const t = useTranslate('editor');
  const settings = useEditorStore((s) => s.config?.settings);
  const location = getLocation(settings);
  const ownLat = mod.config.latitude;
  const ownLon = mod.config.longitude;
  if (typeof ownLat === 'number' && typeof ownLon === 'number' && ownLat !== 0 && ownLon !== 0) return null;

  if (location) {
    const name = settings?.locationName?.trim() || formatCoords(location.lat, location.lon);
    return (
      <p className="flex items-center gap-1.5 text-xs text-hs-text-faint" data-testid="location-status-row">
        <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate" title={name}>{t('configSections.locationRow.set', { name })}</span>
      </p>
    );
  }

  return (
    <div
      className="rounded-md border border-hs-warning/30 bg-hs-warning/10 px-3 py-2 text-xs"
      data-testid="location-status-row"
    >
      <p className="text-hs-text-body">{t('configSections.locationRow.notSet')}</p>
      <a
        href={settingsPath({ kind: 'defaults', page: 'location' })}
        className="mt-1 inline-block font-medium text-hs-accent hover:underline"
      >
        {t('configSections.locationRow.setUp')}
      </a>
    </div>
  );
}
