'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Play, Trash2, X } from 'lucide-react';
import { useLocale, useTranslate } from '@/i18n';
import Button from '@/components/ui/Button';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { useConfirmStore } from '@/stores/confirm-store';
import { useEditorStore } from '@/stores/editor-store';
import { replaceIconReferences } from '@/lib/custom-icon-removal';
import { isSessionExpired } from '@/lib/editor-fetch';
import {
  CustomIconRequestError,
  deleteCustomIcon,
  fetchCustomIconUsage,
  keepCustomIcon,
  renameCustomIcon,
  uploadCustomIcon,
  useCustomIcons,
} from '@/hooks/useCustomIcons';
import {
  ACCEPT_ATTRIBUTE,
  ACCEPTED_MIME_TYPES,
  LIBRARY_BUDGET_BYTES,
  customIconValue,
  formatIconBytes,
  iconNameFromFileName,
  normalizeIconName,
  type CustomIconEntry,
  type CustomIconErrorCode,
  type CustomIconUsage,
} from '@/lib/custom-icons';
import { customIconUseCount, customIconUseRows } from '@/lib/custom-icon-usage';
import type { TranslateFn } from '@/i18n';

/**
 * The hub rewrote the screen config when a removed icon was used there (a
 * Text prefix, a calendar rule). The editor's copy must not lag behind, or
 * its next save of the older copy is refused as a conflict. A clean store
 * simply reloads; one holding unsaved edits gets the same rewrite applied in
 * memory plus the new revision, so its edits and the rewrite merge at the
 * next save. Mirrors the media library's move.
 */
function adoptIconRemoval(value: string, revision: string): void {
  const store = useEditorStore.getState();
  if (!store.isDirty && !store.isSaving) {
    void store.loadConfig();
    return;
  }
  if (!store.config) return;
  useEditorStore.setState({ config: replaceIconReferences(store.config, value, undefined), configRevision: revision });
}

/** One line under the upload button about a file that was not added. */
type UploadNote =
  | { file: string; code: CustomIconErrorCode | 'failed' }
  | { file: string; existing: string };

/** "Dad's chili (Meal), Stir the pot (Chore), Screen (2)". */
function usageList(usage: CustomIconUsage | undefined, t: TranslateFn): string {
  return customIconUseRows(usage)
    .map((row) => row.kind === 'screen'
      ? `${t('customIcons.kinds.screen')} (${row.count})`
      : `${row.name} (${t(`customIcons.kinds.${row.kind}`)})`)
    .join(', ');
}

/**
 * Settings > Your icons: the household's own pictures, next to Pictures &
 * videos. Same facts as the phone's page (space used, where each icon is
 * used, rename and remove), laid out for a desktop: several pictures can be
 * added at once or dropped onto the grid, and rename happens in place. After
 * a batch the first new picture opens for naming, because a phone photo
 * arrives called "IMG 4821".
 */
export default function CustomIconsPage() {
  const t = useTranslate('core');
  const locale = useLocale();
  const { icons, bytes } = useCustomIcons();
  const [usage, setUsage] = useState<Record<string, CustomIconUsage>>({});
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<UploadNote[]>([]);
  const [dragging, setDragging] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadUsage = useCallback(async () => {
    try {
      setUsage(await fetchCustomIconUsage());
    } catch { /* counts just stay blank */ }
  }, []);
  useEffect(() => { void loadUsage(); }, [loadUsage]);

  const addFiles = async (files: File[]) => {
    const pictures = files.filter((file) => (ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type) || !file.type);
    if (!files.length || busy) return;
    setBusy(true);
    setNotes([]);
    const next: UploadNote[] = files
      .filter((file) => !pictures.includes(file))
      .map((file) => ({ file: file.name, code: file.type === 'image/svg+xml' ? 'svg-drawing' as const : 'not-a-picture' as const }));
    let firstNew: string | null = null;
    for (const file of pictures) {
      try {
        const { icon, existing } = await uploadCustomIcon(file, iconNameFromFileName(file.name));
        if (existing) {
          next.push({ file: file.name, existing: icon.name });
          continue;
        }
        // Nothing to review on this page: an upload here is meant to stay.
        await keepCustomIcon(icon.id, icon.name);
        firstNew ??= icon.id;
      } catch (error) {
        if (isSessionExpired(error)) return;
        next.push({ file: file.name, code: error instanceof CustomIconRequestError ? error.code : 'failed' });
      }
    }
    setNotes(next);
    setBusy(false);
    if (firstNew) setRenamingId(firstNew);
    void loadUsage();
  };

  const share = Math.min(1, bytes / LIBRARY_BUDGET_BYTES);

  return (
    <div
      onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void addFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="flex items-center gap-4 mb-5">
        <div className="h-2 w-64 rounded bg-hs-card overflow-hidden" aria-hidden>
          <div
            className={`h-full rounded ${share > 0.8 ? 'bg-hs-warning' : 'bg-amber-500'}`}
            style={{ width: `${Math.max(share * 100, bytes ? 1.5 : 0)}%` }}
          />
        </div>
        <span className="text-xs text-hs-text-muted flex-1">
          {t('customIcons.page.count', { count: icons.length })} · {t('customIcons.page.used', { used: formatIconBytes(bytes, locale), max: formatIconBytes(LIBRARY_BUDGET_BYTES, locale) })}
        </span>
        <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={busy} data-field-id="icons.add">
          {busy ? t('customIcons.review.working') : t('customIcons.addPictures')}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          hidden
          data-testid="custom-icon-file"
          onChange={(event) => {
            void addFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </div>

      {notes.length > 0 && (
        <ul className="mb-4 space-y-1.5">
          {notes.map((note, i) => (
            <li
              key={`${note.file}-${i}`}
              role={'code' in note ? 'alert' : 'status'}
              className={`flex items-start gap-2 text-xs rounded-md px-2.5 py-2 border ${
                'code' in note
                  ? 'text-hs-danger border-hs-danger/40 bg-hs-danger/10'
                  : 'text-hs-text-body border-hs-border-strong bg-hs-card'
              }`}
            >
              <span className="flex-1">
                <span className="font-semibold">{note.file}:</span>{' '}
                {'code' in note ? t(`customIcons.errors.${note.code}`) : t('customIcons.review.existing', { name: note.existing })}
              </span>
              <button
                type="button"
                aria-label={t('actions.close')}
                onClick={() => setNotes((current) => current.filter((_, j) => j !== i))}
                className="shrink-0 opacity-70 hover:opacity-100"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))' }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`min-h-[118px] rounded-lg border border-dashed text-xs flex items-center justify-center text-center px-3 transition-colors ${
            dragging ? 'border-hs-accent text-hs-accent bg-hs-accent/10' : 'border-hs-border-strong text-hs-text-muted hover:border-hs-accent'
          }`}
        >
          + {t('customIcons.page.dropHint')}
        </button>
        {icons.map((icon) => (
          <IconTile
            key={icon.id}
            icon={icon}
            usage={usage[icon.id]}
            renaming={renamingId === icon.id}
            onRename={(on) => setRenamingId(on ? icon.id : null)}
            onChanged={() => void loadUsage()}
          />
        ))}
      </div>

      {icons.length === 0 && <p className="text-xs text-hs-text-muted mt-4">{t('customIcons.page.empty')}</p>}
      <p className="text-[11.5px] text-hs-text-muted mt-4">{t('customIcons.formats')}</p>
    </div>
  );
}

function IconTile({ icon, usage, renaming, onRename, onChanged }: {
  icon: CustomIconEntry;
  usage: CustomIconUsage | undefined;
  renaming: boolean;
  onRename: (on: boolean) => void;
  onChanged: () => void;
}) {
  const t = useTranslate('core');
  const [name, setName] = useState(icon.name);
  const renameButton = useRef<HTMLButtonElement>(null);
  const uses = customIconUseCount(usage);
  const where = usageList(usage, t);

  useEffect(() => { if (renaming) setName(icon.name); }, [renaming, icon.name]);

  // The input unmounts on Enter or Escape; give focus back to the tile's own
  // Rename button rather than dropping it to the page.
  const stopRenaming = () => {
    onRename(false);
    requestAnimationFrame(() => renameButton.current?.focus());
  };

  const commitRename = async () => {
    const next = normalizeIconName(name);
    stopRenaming();
    if (!next || next === icon.name) { setName(icon.name); return; }
    try {
      await renameCustomIcon(icon.id, next);
    } catch {
      setName(icon.name);
    }
  };

  const remove = async () => {
    const confirmed = await useConfirmStore.getState().confirm({
      title: t('customIcons.remove.title', { name: icon.name }),
      message: uses
        ? `${t('customIcons.remove.inUse', { count: uses })} ${t('customIcons.page.usedByList', { list: where })}`
        : t('customIcons.remove.notUsed'),
      confirmLabel: t('customIcons.remove.confirm'),
      cancelLabel: t('customIcons.remove.keep'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      const { configRevision } = await deleteCustomIcon(icon.id);
      if (configRevision) adoptIconRemoval(customIconValue(icon.id), configRevision);
      onChanged();
    } catch { /* the tile stays; nothing changed */ }
  };

  return (
    <div className="group relative rounded-lg border border-hs-border-strong bg-hs-card px-2 pt-3 pb-2.5 flex flex-col items-center gap-1.5" data-testid="custom-icon-tile">
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          ref={renameButton}
          type="button"
          onClick={() => onRename(true)}
          aria-label={`${t('customIcons.detail.rename')}: ${icon.name}`}
          title={t('customIcons.detail.rename')}
          className="w-6 h-6 rounded bg-hs-panel border border-hs-border-strong text-hs-text-muted hover:text-hs-text-body flex items-center justify-center"
        >
          <Pencil size={11} />
        </button>
        <button
          type="button"
          onClick={() => void remove()}
          aria-label={`${t('customIcons.detail.remove')}: ${icon.name}`}
          title={t('customIcons.detail.remove')}
          className="w-6 h-6 rounded bg-hs-panel border border-hs-border-strong text-hs-text-muted hover:text-hs-danger flex items-center justify-center"
        >
          <Trash2 size={11} />
        </button>
      </div>
      <img src={icon.url} alt="" className="w-14 h-14 object-contain" />
      {renaming ? (
        <input
          autoFocus
          value={name}
          maxLength={32}
          aria-label={t('customIcons.review.nameLabel')}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void commitRename();
            if (event.key === 'Escape') { setName(icon.name); stopRenaming(); }
          }}
          className={`${MODAL_INPUT_CLASS} text-center !text-xs !py-0.5`}
        />
      ) : (
        <span className="text-xs text-hs-text-body text-center max-w-full truncate flex items-center gap-1">
          {icon.animated && <Play size={8} fill="currentColor" strokeWidth={0} className="shrink-0 text-hs-text-muted" />}
          {icon.name}
        </span>
      )}
      <span className={`text-[10.5px] ${uses ? 'text-hs-success' : 'text-hs-text-muted'}`} title={where || undefined}>
        {uses ? t('customIcons.page.usedIn', { count: uses }) : t('customIcons.page.notUsed')}
      </span>
    </div>
  );
}
