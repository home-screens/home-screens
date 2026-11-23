'use client';

import { useEffect, useRef } from 'react';
import ModalFrame from '@/components/ui/ModalFrame';
import Button from '@/components/ui/Button';
import { ChevronLeft, ChevronRight, RefreshCw, Trash2, X } from 'lucide-react';
import { formatBytes } from '@/lib/format-bytes';
import { extensionOf, fileNameOf, folderOf, serveUrlFor, typeTagOf } from '@/lib/media-paths';
import type { MediaInventoryItem } from '@/lib/media-inventory';
import type { MediaUse } from '@/lib/media-usage';
import type { useTranslate } from '@/i18n';

/** One translated where-used line, with the use behind it for the jump link. */
export interface UsedByLine {
  label: string;
  use: MediaUse;
}

interface MediaViewerProps {
  item: MediaInventoryItem;
  /** Where-used lines; empty when nothing uses the file. */
  usedBy: UsedByLine[];
  /** Why this file cannot be deleted, when the reason needs more than the
   *  where-used list (a slideshow's last picture). */
  lockHint?: string;
  /** Position inside the list being browsed, for the counter and the arrows. */
  index: number;
  total: number;
  t: ReturnType<typeof useTranslate>;
  onClose: () => void;
  onStep: (delta: 1 | -1) => void;
  /** Absent while the file is locked: it cannot be deleted from here either. */
  onDelete?: () => void;
  /** Opens a picker for a same-type file that overwrites this one in place. */
  onReplace: (file: File) => void;
  /** Jumps to the screen or module a where-used line names, when it can. */
  onOpenUse?: (use: MediaUse) => void;
  busy: boolean;
}

/** True when a key press belongs to something else: a video's own controls
 *  (arrows seek there), a text field, or a handler that already claimed it. */
function keyBelongsElsewhere(e: KeyboardEvent): boolean {
  if (e.defaultPrevented) return true;
  const target = e.target;
  return target instanceof HTMLElement && !!target.closest('video, input, textarea, select');
}

/**
 * Full-size look at one library file: the picture fitted to the viewport, or
 * the video playing with its controls, with the facts the tile only hints at
 * (folder, dimensions, size, type) and the complete where-used list, so the
 * hover popover is not the only place that information lives. Left and
 * right arrows step through the list the tile was opened from. ModalFrame
 * supplies the dialog semantics: Escape closes, focus stays inside and
 * returns to the tile that opened it.
 */
export default function MediaViewer({
  item,
  usedBy,
  lockHint,
  index,
  total,
  t,
  onClose,
  onStep,
  onDelete,
  onReplace,
  onOpenUse,
  busy,
}: MediaViewerProps) {
  const replaceInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (keyBelongsElsewhere(e)) return;
      if (e.key === 'ArrowRight') onStep(1);
      else if (e.key === 'ArrowLeft') onStep(-1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onStep]);

  const name = fileNameOf(item.path);
  const folder = folderOf(item.path);
  const src = serveUrlFor(item.path, { version: item.mtimeMs });
  const canStep = total > 1;
  const accept = item.kind === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/*';

  return (
    <ModalFrame label={name} onClose={onClose} className="h-full w-full">
      {/* Empty space around the picture closes, as the backdrop would; the
          picture, the header and the footer stop the click. */}
      <div
        className="flex h-full w-full flex-col text-hs-text-body"
        data-testid="media-viewer"
        onClick={onClose}
      >
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <span className="truncate text-sm font-semibold" data-testid="media-viewer-name">{name}</span>
          <span className="text-xs text-hs-text-muted">{index + 1} / {total}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('settings.mediaPage.viewer.close')}
            data-testid="media-viewer-close"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded text-hs-text-muted hover:bg-white/10 hover:text-hs-text-body"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center py-3">
          {canStep && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onStep(-1); }}
              aria-label={t('settings.mediaPage.viewer.previous')}
              data-testid="media-viewer-prev"
              className="absolute left-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
          )}
          {item.kind === 'video' ? (
            <video
              key={item.path}
              src={src}
              controls
              autoPlay
              playsInline
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full rounded-lg"
              data-testid="media-viewer-video"
            />
          ) : (
            <img
              key={item.path}
              src={src}
              alt={name}
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full rounded-lg object-contain"
              data-testid="media-viewer-image"
            />
          )}
          {canStep && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onStep(1); }}
              aria-label={t('settings.mediaPage.viewer.next')}
              data-testid="media-viewer-next"
              className="absolute right-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          )}
        </div>

        <div
          className="flex flex-wrap items-start gap-x-6 gap-y-2 rounded-lg border border-hs-border-strong bg-hs-card px-4 py-3 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <Fact label={t('settings.mediaPage.viewer.folder')}>
            {folder || t('settings.mediaPage.topLevel')}
          </Fact>
          <Fact label={t('settings.mediaPage.viewer.type')}>{typeTagOf(item.path)}</Fact>
          {item.width != null && item.height != null && (
            <Fact label={t('settings.mediaPage.viewer.dimensions')}>{item.width} × {item.height}</Fact>
          )}
          <Fact label={t('settings.mediaPage.viewer.size')}>{formatBytes(item.bytes)}</Fact>
          <div className="min-w-[160px] flex-1" data-testid="media-viewer-used-by">
            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-hs-text-faint">
              {t('settings.mediaPage.usedBy')}
            </div>
            {usedBy.length === 0 ? (
              <div className="text-hs-text-muted">{t('settings.mediaPage.viewer.notUsed')}</div>
            ) : (
              usedBy.map((line, i) => (
                <UsedByEntry key={i} line={line} t={t} onOpenUse={onOpenUse} />
              ))
            )}
            {lockHint && (
              <div className="mt-1 max-w-[260px] leading-relaxed text-hs-text-muted" data-testid="media-viewer-lock-hint">
                {lockHint}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 self-center">
            <input
              ref={replaceInputRef}
              type="file"
              accept={accept}
              className="hidden"
              data-testid="media-viewer-replace-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) onReplace(file);
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => replaceInputRef.current?.click()}
              disabled={busy}
              title={t('settings.mediaPage.replaceHint', { ext: extensionOf(item.path) })}
              data-testid="media-viewer-replace"
              className="flex items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              {t('settings.mediaPage.replace')}
            </Button>
            {onDelete && (
              <Button
                variant="danger"
                size="sm"
                onClick={onDelete}
                disabled={busy}
                data-testid="media-viewer-delete"
                className="flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t('settings.mediaPage.deleteConfirm')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}

/** A where-used line: a link into the editor when the use names a screen,
 *  plain text otherwise (a rotation, or something outside any screen). */
export function UsedByEntry({
  line,
  t,
  onOpenUse,
  className,
}: {
  line: UsedByLine;
  t: ReturnType<typeof useTranslate>;
  onOpenUse?: (use: MediaUse) => void;
  className?: string;
}) {
  const canOpen = !!onOpenUse && !!line.use.screenId;
  if (!canOpen) return <div className={className ?? 'text-hs-text-muted'}>{line.label}</div>;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpenUse!(line.use); }}
      title={t('settings.mediaPage.openInEditor')}
      data-testid="media-used-by-link"
      className={`block text-left text-hs-accent hover:underline ${className ?? ''}`}
    >
      {line.label}
    </button>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-hs-text-faint">{label}</div>
      <div className="text-hs-text-body">{children}</div>
    </div>
  );
}
