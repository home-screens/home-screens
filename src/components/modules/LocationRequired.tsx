'use client';

import type { Ref } from 'react';
import { useTranslate } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import type { ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { EditorSettingsLink } from './EditorSettingsLink';

/**
 * Empty state for a module that cannot render without coordinates: "Location
 * not set", and where to set it. Every location module draws this one, in
 * the same words.
 *
 * `locationSettingsHref` is set by `buildModuleProps` only in the editor: the
 * second line becomes a link to the Location page there (see
 * EditorSettingsLink), and on the wall it says where to go instead.
 *
 * `fontSize` is for a module that sizes its type from its own box (the
 * weather card): the measured size in px, with `measureRef` on the box it is
 * measured from. Without it the state follows the card's font size.
 */
export function LocationRequired({ style, locationSettingsHref, fontSize, measureRef }: {
  style: ModuleStyle;
  locationSettingsHref?: string;
  fontSize?: number;
  measureRef?: Ref<HTMLDivElement>;
}) {
  const t = useTranslate('modules');
  return (
    <ModuleWrapper style={style}>
      <div
        ref={measureRef}
        className="flex flex-col items-center justify-center gap-1 h-full text-center"
        style={{ fontSize: fontSize ? `${fontSize}px` : '0.85em' }}
      >
        <span style={{ opacity: TEXT_OPACITY.secondary }}>{t('common.locationNotSet')}</span>
        {locationSettingsHref ? (
          <EditorSettingsLink href={locationSettingsHref} style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.secondary }}>
            {t('common.setLocationLink')}
          </EditorSettingsLink>
        ) : (
          <span style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.tertiary }}>{t('common.setLocationInEditor')}</span>
        )}
      </div>
    </ModuleWrapper>
  );
}
