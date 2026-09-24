'use client';

import { Play } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { useCustomIcons } from '@/hooks/useCustomIcons';
import { useCustomIconUpload } from '@/hooks/useCustomIconUpload';
import { ACCEPT_ATTRIBUTE, customIconValue, iconShapeWarning, parseCustomIconValue, type CustomIconEntry } from '@/lib/custom-icons';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';

interface EditorCustomIconSectionProps {
  value: string | undefined;
  onPick: (value: string) => void;
  /** Fixed column count; omit for an auto-filling grid. */
  columns?: number;
  /** Tile names under each picture (the icon picker's Yours tab). */
  showNames?: boolean;
  /** Only icons whose names contain this (the picker's search box). */
  query?: string;
  /** Hide the "Your icons" heading when the host already names the section. */
  hideHeading?: boolean;
  /** What a new picture is called to start with (the meal or chore being
   *  edited) instead of its file name. */
  suggestedName?: string;
}

/**
 * "Your icons" for the editor's pickers: an Add tile and the family's
 * pictures, with the review step drawn inline above the grid. The phone has
 * its own touch-sized section; both run the same upload flow.
 */
export default function EditorCustomIconSection({ value, onPick, columns, showNames = false, query = '', hideHeading = false, suggestedName }: EditorCustomIconSectionProps) {
  const t = useTranslate('core');
  const { icons } = useCustomIcons();
  const upload = useCustomIconUpload((icon) => onPick(customIconValue(icon.id)), { suggestedName });
  const selectedId = parseCustomIconValue(value);
  const q = query.trim().toLowerCase();
  const shown = q ? icons.filter((icon) => icon.name.toLowerCase().includes(q)) : icons;
  const { state } = upload;
  const gridStyle = columns
    ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
    : { gridTemplateColumns: `repeat(auto-fill, minmax(${showNames ? 64 : 44}px, 1fr))` };

  return (
    <div data-testid="custom-icon-section">
      {!hideHeading && (
        <div className="text-[10px] font-bold uppercase tracking-wider text-hs-text-muted mb-1.5">{t('customIcons.yourIcons')}</div>
      )}

      {state.step !== 'idle' && <ReviewPanel upload={upload} />}

      <div className="grid gap-1" style={gridStyle}>
        <button
          type="button"
          onClick={upload.choose}
          aria-label={t('customIcons.add')}
          title={t('customIcons.add')}
          className={`${showNames ? 'h-[72px]' : 'aspect-square'} rounded border-2 border-dashed border-hs-border-strong text-hs-text-muted hover:text-hs-text-body hover:border-hs-accent flex flex-col items-center justify-center gap-1 transition-colors`}
        >
          <span className="text-xl leading-none font-light">+</span>
          {showNames && <span className="text-[10px]">{t('customIcons.add')}</span>}
        </button>
        {shown.map((icon) => (
          <Tile key={icon.id} icon={icon} selected={icon.id === selectedId} showName={showNames}
            onPick={() => onPick(customIconValue(icon.id))} movingLabel={t('customIcons.moving')} />
        ))}
        {icons.length === 0 && !showNames && (
          <p className="col-span-full text-[11px] text-hs-text-faint py-1">{t('customIcons.emptyHint')}</p>
        )}
      </div>
      <input ref={upload.inputRef} type="file" accept={ACCEPT_ATTRIBUTE} onChange={upload.onFileChange} hidden data-testid="custom-icon-file" />
    </div>
  );
}

function Tile({ icon, selected, showName, onPick, movingLabel }: {
  icon: CustomIconEntry;
  selected: boolean;
  showName: boolean;
  onPick: () => void;
  movingLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      title={icon.name}
      aria-label={icon.animated ? `${icon.name} (${movingLabel})` : icon.name}
      aria-pressed={selected}
      className={`relative ${showName ? 'h-[72px] rounded-lg border' : 'aspect-square rounded border-2'} flex flex-col items-center justify-center gap-1 transition ${
        selected
          ? showName ? 'border-hs-accent bg-hs-accent/10' : 'border-amber-500 bg-amber-500/10'
          : `border-transparent ${showName ? '' : 'bg-hs-card'} hover:bg-hs-hover hover:border-hs-border-strong`
      }`}
    >
      <img src={icon.url} alt="" draggable={false} className={showName ? 'w-[30px] h-[30px] object-contain' : 'w-[62%] h-[62%] object-contain'} />
      {showName && (
        <span className="text-[10px] text-hs-text-faint max-w-[60px] truncate">{icon.name}</span>
      )}
      {icon.animated && (
        <span aria-hidden className="absolute right-0.5 bottom-0.5 w-3 h-3 rounded-full bg-black/75 text-white flex items-center justify-center">
          <Play size={6} fill="currentColor" strokeWidth={0} />
        </span>
      )}
    </button>
  );
}

/** The wall's light card and the editor's dark panel. */
const PREVIEW_TILES = ['#f4efe6', 'var(--hs-bg-panel)'];

function ReviewPanel({ upload }: { upload: ReturnType<typeof useCustomIconUpload> }) {
  const t = useTranslate('core');
  const { state } = upload;
  const review = state.step === 'review' || state.step === 'saving' ? state : null;
  const icon = review?.icon ?? null;
  const busy = state.step === 'saving';
  const shape = icon && !review?.existing ? iconShapeWarning(icon) : null;

  return (
    <div className="mb-2 rounded-lg border border-hs-border-strong bg-hs-card p-3" data-testid="custom-icon-review">
      <div className="text-xs font-semibold text-hs-text-primary mb-1">{t('customIcons.review.title')}</div>
      {state.step === 'uploading' && <p className="text-xs text-hs-text-muted" role="status">{t('customIcons.review.working')}</p>}
      {state.step === 'error' && (
        <>
          <p
            role="alert"
            className={`text-xs rounded-md px-2.5 py-2 mb-2 border ${
              state.code === 'library-full' || state.code === 'budget-full'
                ? 'text-hs-warning border-hs-warning/40 bg-hs-warning/10'
                : 'text-hs-danger border-hs-danger/40 bg-hs-danger/10'
            }`}
          >
            {t(`customIcons.errors.${state.code}`)}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={upload.pickAnother} className="text-xs px-3 py-1.5 rounded bg-hs-accent text-white">{t('customIcons.review.pickAnother')}</button>
            <button type="button" onClick={upload.cancel} className="text-xs px-3 py-1.5 rounded border border-hs-border-strong text-hs-text-body">{t('actions.cancel')}</button>
          </div>
        </>
      )}
      {icon && review && (
        <>
          <p className="text-[11px] text-hs-text-muted mb-2">
            {review.existing ? t('customIcons.review.existing', { name: icon.name }) : t('customIcons.review.preview')}
          </p>
          <div className="flex items-center gap-2 mb-2">
            {PREVIEW_TILES.map((background) => (
              <div
                key={background}
                className="w-[64px] h-[64px] shrink-0 rounded-lg border border-hs-border-strong flex items-center justify-center"
                style={{ background }}
              >
                <img src={icon.url} alt="" className="w-[52px] h-[52px] object-contain" />
              </div>
            ))}
            <div className="flex flex-col gap-1.5 min-w-0 text-hs-text-body ml-1">
              {[13, 20].map((size) => (
                <span key={size} className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden" style={{ fontSize: size }}>
                  <img src={icon.url} alt="" style={{ width: '1em', height: '1em', objectFit: 'contain', flexShrink: 0 }} />
                  <span className="truncate">{review.name}</span>
                </span>
              ))}
              {icon.animated && <span className="text-[10px] text-hs-text-muted">▶ {t('customIcons.moving')}</span>}
            </div>
          </div>
          {shape && (
            <div role="status" className="text-xs rounded-md px-2.5 py-2 mb-2 border text-hs-warning border-hs-warning/40 bg-hs-warning/10">
              {t(`customIcons.review.${shape}`)}
              {icon.square && (
                <button type="button" disabled={busy} onClick={() => void upload.crop()} className="block mt-1.5 text-xs font-semibold underline">
                  {t('customIcons.review.crop')}
                </button>
              )}
            </div>
          )}
          <label className="block text-[11px] font-bold text-hs-text-muted uppercase tracking-wider mb-1" htmlFor="editor-custom-icon-name">
            {t('customIcons.review.nameLabel')}
          </label>
          <input
            id="editor-custom-icon-name"
            type="text"
            maxLength={32}
            value={review.name}
            onChange={(event) => upload.setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); void upload.confirm(); }
              // Escape backs out of this picture only, not the window it sits in.
              if (event.key === 'Escape') { event.preventDefault(); upload.cancel(); }
            }}
            className={`${MODAL_INPUT_CLASS} mb-2`}
          />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void upload.confirm()} className="text-xs px-3 py-1.5 rounded bg-hs-accent text-white disabled:opacity-60">
              {t('customIcons.review.use')}
            </button>
            <button type="button" disabled={busy} onClick={upload.pickAnother} className="text-xs px-3 py-1.5 rounded border border-hs-border-strong text-hs-text-body">
              {t('customIcons.review.pickAnother')}
            </button>
            <button type="button" disabled={busy} onClick={upload.cancel} className="text-xs px-3 py-1.5 rounded text-hs-text-muted hover:text-hs-text-body">
              {t('actions.cancel')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
