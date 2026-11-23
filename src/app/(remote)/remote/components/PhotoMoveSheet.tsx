'use client';

import { Folder, FolderPlus, Monitor } from 'lucide-react';
import { useTranslate } from '@/i18n';
import type { PhotoFolder } from '@/lib/media-folders';
import BottomSheet from './BottomSheet';
import { SheetRow } from './PhotoFolderSheets';

/**
 * Where the picked photos go: every folder, the ones on a wall marked with
 * where they show. Picking one moves them at once, no confirm, since
 * everything that shows a moved photo follows it. The last row starts a new
 * folder and moves them into it.
 */
export default function PhotoMoveSheet({
  title,
  folders,
  current,
  folderLabel,
  contents,
  wallsFor,
  onPick,
  onNewFolder,
  onClose,
}: {
  title: string;
  folders: readonly PhotoFolder[];
  /** The folder they are in now, which cannot be picked. */
  current: string;
  folderLabel: (folder: PhotoFolder) => string;
  contents: (folder: PhotoFolder) => string;
  /** The walls that show a folder, joined, or null. */
  wallsFor: (folder: PhotoFolder) => string | null;
  onPick: (folder: string) => void;
  onNewFolder: () => void;
  onClose: () => void;
}) {
  const t = useTranslate('remote');
  return (
    <BottomSheet title={title} onClose={onClose} testId="photo-move-sheet">
      {folders.map((folder) => {
        const here = folder.path === current;
        const walls = wallsFor(folder);
        return (
          <SheetRow
            key={folder.path || '(main)'}
            icon={<Folder size={20} />}
            label={folderLabel(folder)}
            sub={contents(folder)}
            disabled={here}
            onClick={() => onPick(folder.path)}
            testId="photo-move-target"
            right={here ? (
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--hs-text-faint)', whiteSpace: 'nowrap' }}>
                {t('photosTab.moveSheet.here')}
              </span>
            ) : walls ? (
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--hs-success)', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                <Monitor size={14} aria-hidden="true" />
                {walls}
              </span>
            ) : undefined}
          />
        );
      })}
      <SheetRow icon={<FolderPlus size={20} />} label={t('photosTab.moveSheet.newFolder')} onClick={onNewFolder} dashed testId="photo-move-new-folder" />
    </BottomSheet>
  );
}
