'use client';

import { useState } from 'react';
import { FolderPlus, Monitor, Pencil, Trash2 } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { sanitizeFolderName } from '@/lib/library-folder-name';
import BottomSheet from './BottomSheet';
import { GHOST_BUTTON, HELPER_TEXT, PRIMARY_BUTTON, SHEET_FIELD, SHEET_LABEL } from './remote-styles';

/** A tappable row in a phone sheet: icon, words, and an optional line under them. */
export function SheetRow({
  icon,
  label,
  sub,
  right,
  onClick,
  disabled = false,
  danger = false,
  dashed = false,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  dashed?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={disabled ? undefined : 'press-scale'}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 56,
        padding: '8px 14px',
        borderRadius: 12,
        background: dashed ? 'transparent' : 'var(--hs-bg-card)',
        border: dashed ? '1px dashed var(--hs-border-strong)' : '1px solid var(--hs-border-subtle)',
        marginBottom: 6,
        fontSize: 15,
        fontWeight: 600,
        fontFamily: 'inherit',
        textAlign: 'left',
        color: dashed ? 'var(--hs-accent)' : danger ? 'var(--hs-danger)' : 'var(--hs-text-body)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span style={{ flex: 'none', display: 'flex', color: dashed ? 'var(--hs-accent)' : danger ? 'var(--hs-danger)' : 'var(--hs-text-muted)' }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {label}
        {sub && (
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--hs-text-faint)', marginTop: 2 }}>
            {sub}
          </span>
        )}
      </span>
      {right}
    </button>
  );
}

/**
 * The ⋯ menu of the folder being viewed: rename it, start a folder inside it
 * (two levels at most), or delete it once it is empty. Delete stays greyed
 * out with the reason while it cannot work, instead of failing after a tap.
 */
export function PhotoFolderMenu({
  title,
  showingOn,
  canNestFolder,
  deleteBlockedBy,
  onRename,
  onNewInside,
  onDelete,
  onClose,
}: {
  title: string;
  /** Walls that show the folder, joined; null when none does. */
  showingOn: string | null;
  canNestFolder: boolean;
  /** Why it cannot be deleted yet; null when it can. */
  deleteBlockedBy: string | null;
  onRename: () => void;
  onNewInside: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  return (
    <BottomSheet title={title} onClose={onClose} testId="photo-folder-menu">
      {showingOn && (
        <div style={{ fontSize: 13, color: 'var(--hs-text-faint)', margin: '-8px 0 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Monitor size={14} style={{ color: 'var(--hs-success)' }} aria-hidden="true" />
          {t('photosTab.showingOn', { walls: showingOn })}
        </div>
      )}
      <SheetRow icon={<Pencil size={20} />} label={t('photosTab.folderMenu.rename')} onClick={onRename} testId="photo-folder-rename" />
      {canNestFolder && (
        <SheetRow
          icon={<FolderPlus size={20} />}
          label={t('photosTab.folderMenu.newInside', { folder: title })}
          onClick={onNewInside}
          testId="photo-folder-new-inside"
        />
      )}
      <SheetRow
        icon={<Trash2 size={20} />}
        label={t('photosTab.folderMenu.delete')}
        sub={deleteBlockedBy ?? undefined}
        onClick={onDelete}
        disabled={deleteBlockedBy !== null}
        danger
        testId="photo-folder-delete"
      />
      <button type="button" onClick={onClose} className="press-scale" style={{ ...GHOST_BUTTON, marginTop: 12 }}>
        {tCore('actions.cancel')}
      </button>
    </BottomSheet>
  );
}

/** Stands in for a value inside a translated sentence, so the value can be
 *  drawn in bold wherever the language puts it. */
const MARK = '\u0001';

function Emphasized({ template, value }: { template: string; value: string }) {
  const [before, after = ''] = template.split(MARK);
  return (
    <>
      {before}
      <b style={{ color: 'var(--hs-text-muted)' }}>{value}</b>
      {after}
    </>
  );
}

/**
 * Name a new folder, or a new name for one. Spaces and punctuation cannot be
 * part of a folder name, so the sheet says up front what "Grandma's visit"
 * will be saved as rather than renaming it silently.
 */
export function PhotoFolderNameSheet({
  mode,
  initialName,
  folderName,
  wallNote,
  offWallNote,
  busy,
  onSubmit,
  onClose,
}: {
  mode: 'create' | 'rename';
  initialName: string;
  /** The folder being renamed, for the title. */
  folderName?: string;
  /** For a folder a wall shows: that the wall follows the new name. */
  wallNote?: string;
  /** For a new folder: that it starts off the wall. */
  offWallNote?: string;
  busy: boolean;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();
  const savedAs = sanitizeFolderName(trimmed);
  const unchanged = mode === 'rename' && savedAs === sanitizeFolderName(initialName);
  const canSubmit = !busy && savedAs !== '' && !unchanged;
  const submit = () => {
    if (canSubmit) onSubmit(trimmed);
  };
  return (
    <BottomSheet
      title={mode === 'create' ? t('photosTab.nameSheet.newTitle') : t('photosTab.nameSheet.renameTitle', { folder: folderName ?? '' })}
      onClose={onClose}
      testId="photo-folder-name-sheet"
    >
      <label style={{ ...SHEET_LABEL, marginTop: 4 }} htmlFor="photo-folder-name">
        {mode === 'create' ? tCore('actions.name') : t('photosTab.nameSheet.newName')}
      </label>
      <input
        id="photo-folder-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        autoFocus
        autoComplete="off"
        data-testid="photo-folder-name"
        style={SHEET_FIELD}
      />
      {savedAs && savedAs !== trimmed && (
        <div style={HELPER_TEXT} data-testid="photo-folder-saved-as">
          <Emphasized template={t('photosTab.savedAsHint', { name: MARK })} value={savedAs} />
        </div>
      )}
      {offWallNote && <div style={{ ...HELPER_TEXT, marginTop: 4 }}>{offWallNote}</div>}
      {wallNote && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 12, background: 'var(--hs-accent-soft)', color: 'var(--hs-text-body)', fontSize: 13.5, lineHeight: 1.4, marginTop: 14 }}>
          <Monitor size={18} style={{ color: 'var(--hs-success)', marginTop: 1, flex: 'none' }} aria-hidden="true" />
          <span>{wallNote}</span>
        </div>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        data-testid="photo-folder-name-submit"
        className="press-btn"
        style={{ ...PRIMARY_BUTTON, marginTop: 18, opacity: canSubmit ? 1 : 0.4 }}
      >
        {mode === 'create' ? t('photosTab.nameSheet.create') : tCore('actions.save')}
      </button>
      <button type="button" onClick={onClose} className="press-scale" style={GHOST_BUTTON}>
        {tCore('actions.cancel')}
      </button>
    </BottomSheet>
  );
}
