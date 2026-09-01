'use client';

import { useTranslate } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import type { ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { EditorSettingsLink } from './EditorSettingsLink';

/**
 * Empty state for a module that cannot render without coordinates.
 *
 * `locationSettingsHref` is set by `buildModuleProps` only in the editor: the
 * message becomes a link to the Location page there (see EditorSettingsLink),
 * and stays plain text on the wall.
 */
export function LocationRequired({ style, locationSettingsHref }: { style: ModuleStyle; locationSettingsHref?: string }) {
  const t = useTranslate('modules');
  return (
    <ModuleWrapper style={style}>
      <div className="flex flex-col items-center justify-center gap-1 h-full text-center" style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.dim }}>
        <span>{t('common.locationNotConfigured')}</span>
        {locationSettingsHref && (
          <EditorSettingsLink href={locationSettingsHref} style={{ fontSize: '0.8em' }}>
            {t('common.setLocationLink')}
          </EditorSettingsLink>
        )}
      </div>
    </ModuleWrapper>
  );
}
