'use client';

import type { CSSProperties } from 'react';
import { Play } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { useCustomIcons } from '@/hooks/useCustomIcons';
import { useCustomIconUpload } from '@/hooks/useCustomIconUpload';
import { ACCEPT_ATTRIBUTE, customIconValue, parseCustomIconValue, type CustomIconEntry } from '@/lib/custom-icons';
import PhoneCustomIconReviewSheet from './PhoneCustomIconReviewSheet';

/** Section heading inside a phone picker. The brighter of the two faint
 *  greys: the darker one measured 4.18:1 at this size, under the minimum. */
export const PHONE_SUBHEAD_STYLE: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  color: 'var(--hs-text-muted)',
  margin: '0 0 6px',
};

/** A fingertip-sized tile, never narrower than the emoji tiles around it. */
const MIN_TILE_PX = 46;

interface PhoneCustomIconSectionProps {
  /** The field's current value, to mark the picked icon. */
  value: string | undefined;
  onPick: (value: string) => void;
  /** Border colour of the picked cell (the meal form's amber, for one). */
  accent?: string;
  /** Name under every tile, for pickers whose built-in tiles carry names
   *  too (chores, rewards, people). Otherwise the picked one is named under
   *  the grid. */
  captions?: boolean;
  /** What a new picture is called to start with: the meal or chore it is
   *  being added for, rather than the phone's "IMG_4821". */
  suggestedName?: string;
}

/**
 * "Your icons" at the top of a phone picker: an Add tile, then every picture
 * the family has added. Picking a file opens the review sheet, and keeping
 * the picture picks it straight away.
 *
 * Touch-sized and inline-styled like the rest of /remote. The editor has its
 * own section (`EditorCustomIconSection`); they share the upload flow and the
 * rules, not the markup.
 */
export default function PhoneCustomIconSection({ value, onPick, accent = '#f59e0b', captions = false, suggestedName }: PhoneCustomIconSectionProps) {
  const t = useTranslate('core');
  const { icons, byId } = useCustomIcons();
  const upload = useCustomIconUpload((icon) => onPick(customIconValue(icon.id)), { suggestedName });
  const selectedId = parseCustomIconValue(value);
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const tileHeight = captions ? 64 : undefined;

  const cell = (isSelected: boolean): CSSProperties => ({
    width: '100%',
    aspectRatio: captions ? undefined : '1',
    height: tileHeight,
    borderRadius: 8,
    border: isSelected ? `2px solid ${accent}` : '2px solid transparent',
    background: isSelected ? `color-mix(in srgb, ${accent} 12%, transparent)` : 'var(--hs-bg-panel)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    position: 'relative',
    padding: 2,
    minWidth: 0,
    fontFamily: 'inherit',
  });

  return (
    <div data-testid="custom-icon-section">
      <div style={PHONE_SUBHEAD_STYLE}>{t('customIcons.yourIcons')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${MIN_TILE_PX}px, 1fr))`, gap: 6 }}>
        <button
          type="button"
          onClick={upload.choose}
          aria-label={t('customIcons.add')}
          className="press-scale-sm"
          style={{ ...cell(false), background: 'transparent', border: '2px dashed var(--hs-border-strong)', color: 'var(--hs-text-muted)' }}
        >
          <span aria-hidden style={{ fontSize: 22, fontWeight: 300, lineHeight: 1 }}>+</span>
          <span aria-hidden style={{ fontSize: 10, lineHeight: 1 }}>{t('customIcons.addShort')}</span>
        </button>
        {icons.length === 0 ? (
          <div
            style={{
              gridColumn: '2 / -1',
              display: 'flex',
              alignItems: 'center',
              fontSize: 14,
              lineHeight: 1.35,
              color: 'var(--hs-text-muted)',
              paddingLeft: 6,
            }}
          >
            {t('customIcons.emptyHint')}
          </div>
        ) : (
          icons.map((icon) => (
            <IconCell key={icon.id} icon={icon} style={cell(icon.id === selectedId)} selected={icon.id === selectedId}
              caption={captions} onPick={() => onPick(customIconValue(icon.id))} movingLabel={t('customIcons.moving')} />
          ))
        )}
      </div>
      {!captions && selected && (
        <div style={{ fontSize: 13, color: 'var(--hs-text-muted)', marginTop: 6 }} aria-live="polite">{selected.name}</div>
      )}
      <input ref={upload.inputRef} type="file" accept={ACCEPT_ATTRIBUTE} onChange={upload.onFileChange} hidden data-testid="custom-icon-file" />
      {upload.state.step !== 'idle' && <PhoneCustomIconReviewSheet upload={upload} />}
    </div>
  );
}

function IconCell({ icon, style, selected, caption, onPick, movingLabel }: {
  icon: CustomIconEntry;
  style: CSSProperties;
  selected: boolean;
  caption: boolean;
  onPick: () => void;
  movingLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={icon.animated ? `${icon.name} (${movingLabel})` : icon.name}
      aria-pressed={selected}
      className="press-scale-sm"
      style={style}
    >
      <img src={icon.url} alt="" draggable={false} style={{ width: caption ? 30 : '62%', height: caption ? 30 : '62%', objectFit: 'contain' }} />
      {caption && (
        <span
          aria-hidden
          style={{
            fontSize: 9, lineHeight: 1.1, color: 'var(--hs-text-muted)', maxWidth: '100%',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {icon.name}
        </span>
      )}
      {icon.animated && (
        <span
          aria-hidden
          style={{
            position: 'absolute', right: 2, top: caption ? 2 : undefined, bottom: caption ? undefined : 2, width: 13, height: 13, borderRadius: '50%',
            background: 'rgba(0,0,0,0.75)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Play size={7} fill="currentColor" strokeWidth={0} />
        </span>
      )}
    </button>
  );
}
