'use client';

import { memo } from 'react';
import { Check, Lock, Play } from 'lucide-react';
import { useTranslate } from '@/i18n';
import type { MediaInventoryItem } from '@/lib/media-inventory';
import { TILE_THUMBNAIL_WIDTH, serveUrlFor } from '@/lib/media-paths';
import { REMOTE_ACCENT, REMOTE_ON_ACCENT } from './remote-styles';

interface PhotoGridProps {
  items: readonly MediaInventoryItem[];
  selecting: boolean;
  selected: ReadonlySet<string>;
  /** Files a screen uses on their own (a background, a day rule), marked with a lock. */
  usedAlone: ReadonlySet<string>;
  onOpen: (path: string) => void;
  onToggle: (path: string) => void;
}

/** A dark disc on the photo, so a mark reads on a pale sky as well as a night shot. */
const BADGE: React.CSSProperties = {
  position: 'absolute',
  width: 26,
  height: 26,
  borderRadius: 13,
  background: 'rgba(0,0,0,0.6)',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
};

/**
 * Three square tiles a row, newest first. A tap opens the viewer, or in
 * select mode picks the photo. Videos show their first frame with a play
 * mark (the viewer shows how long they are); a lock marks a photo that a
 * screen uses on its own and so cannot be deleted.
 */
function PhotoGrid({ items, selecting, selected, usedAlone, onOpen, onToggle }: PhotoGridProps) {
  const t = useTranslate('remote');
  let photoNumber = 0;
  let videoNumber = 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }} data-testid="photo-grid">
      {items.map((item) => {
        const isVideo = item.kind === 'video';
        const label = isVideo
          ? t('photosTab.videoLabel', { n: ++videoNumber })
          : t('photosTab.photoLabel', { n: ++photoNumber });
        const on = selected.has(item.path);
        return (
          <button
            key={item.path}
            type="button"
            data-testid="photo-tile"
            data-path={item.path}
            data-selected={on ? 'true' : undefined}
            aria-label={label}
            aria-pressed={selecting ? on : undefined}
            onClick={() => (selecting ? onToggle(item.path) : onOpen(item.path))}
            className="press-scale-sm"
            style={{
              position: 'relative',
              aspectRatio: '1 / 1',
              borderRadius: 8,
              overflow: 'hidden',
              background: 'var(--hs-bg-card)',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              display: 'block',
              width: '100%',
            }}
          >
            {isVideo ? (
              // The first frame: `preload="metadata"` plus a start time, since
              // Safari paints nothing for a video that has not been told where
              // to start.
              <video
                src={`${serveUrlFor(item.path, { version: item.mtimeMs })}#t=0.1`}
                preload="metadata"
                muted
                playsInline
                aria-hidden="true"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none', opacity: on ? 0.7 : 1 }}
              />
            ) : (
              <img
                src={serveUrlFor(item.path, { width: TILE_THUMBNAIL_WIDTH, version: item.mtimeMs })}
                alt=""
                loading="lazy"
                decoding="async"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: on ? 0.7 : 1 }}
              />
            )}
            {isVideo && (
              <span style={{ ...BADGE, left: 6, bottom: 6 }} aria-hidden="true">
                <Play size={14} fill="currentColor" style={{ marginLeft: 1 }} />
              </span>
            )}
            {usedAlone.has(item.path) && (
              <span style={{ ...BADGE, right: 6, bottom: 6 }} data-used-alone="" aria-hidden="true">
                <Lock size={14} />
              </span>
            )}
            {selecting && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  border: '2px solid #fff',
                  background: on ? REMOTE_ACCENT : 'rgba(0,0,0,0.25)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: REMOTE_ON_ACCENT,
                }}
              >
                {on && <Check size={15} strokeWidth={3} />}
              </span>
            )}
            {on && (
              <span
                aria-hidden="true"
                // The fixed amber, not the page ink: the ring sits on the photo, not on the theme's background.
                style={{ position: 'absolute', inset: 0, borderRadius: 8, boxShadow: `inset 0 0 0 3px ${REMOTE_ACCENT}`, pointerEvents: 'none' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default memo(PhotoGrid);
