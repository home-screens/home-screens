'use client';

import { useTranslate } from '@/i18n';
import type { ImmichPermission } from '@/lib/immich-permissions';

/** What the note says is hidden, by the permission the key is missing. */
const HIDDEN_KEY: Partial<Record<ImmichPermission, string>> = {
  'album.read': 'photoSources.immich.permissionNote.albumsHidden',
  'person.read': 'photoSources.immich.permissionNote.peopleHidden',
  'asset.read': 'photoSources.immich.permissionNote.photosHidden',
  'asset.view': 'photoSources.immich.permissionNote.photosHidden',
};

/**
 * Where a list would be when the household's Immich key can't see it: what
 * is hidden, and the one box to tick in Immich. A key scoped to only what the
 * wall needs is common, and an empty dropdown with no reason was how the
 * missing album list went unnoticed.
 */
export default function ImmichPermissionNote({ permission, className = '' }: {
  permission: ImmichPermission;
  className?: string;
}) {
  const t = useTranslate('editor');
  const hiddenKey = HIDDEN_KEY[permission];
  if (!hiddenKey) return null;
  const [before, after = ''] = t('photoSources.immich.permissionNote.howToFix').split('{permission}');
  return (
    <p
      className={`rounded-md border border-hs-warning/25 bg-hs-warning/10 px-2 py-1.5 text-[11px] leading-[1.45] text-hs-text-secondary ${className}`}
      data-testid="immich-permission-note"
      data-permission={permission}
    >
      <b className="font-semibold text-hs-warning">{t(hiddenKey)}</b>{' '}
      {before}
      <b className="font-semibold text-hs-warning">{permission}</b>
      {after}
    </p>
  );
}
