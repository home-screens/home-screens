'use client';

import { useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { TranslateFn } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import type { NewsDisplayItem } from '@/lib/news/types';
import type { NewsTapAction } from '@/types/config';
import { clampLines } from './news-shared';

/** The overlay closes itself after this long so a wall display never sits on a QR code. */
export const OVERLAY_AUTO_CLOSE_MS = 30_000;

/**
 * What a tapped story opens: a QR code to read it on a phone (`qr`), or the
 * full description with a smaller QR in the corner (`details`). Rendered
 * inside the module so it inherits the module font and never escapes the
 * tile. Tapping anywhere closes it.
 */
export function StoryOverlay({
  item, mode, meta, onClose, t,
}: {
  item: NewsDisplayItem;
  mode: Exclude<NewsTapAction, 'none'>;
  meta: string;
  onClose: () => void;
  t: TranslateFn;
}) {
  useEffect(() => {
    const id = setTimeout(onClose, OVERLAY_AUTO_CLOSE_MS);
    return () => clearTimeout(id);
  }, [onClose, item]);

  const link = item.link;

  return (
    <div
      data-news-overlay={mode}
      role="dialog"
      aria-label={item.title}
      onClick={onClose}
      className="absolute inset-0 z-10 flex items-center justify-center p-[6%] cursor-pointer"
      // The QR below is fixed dark-on-white so it scans, and sits on this scrim
      // rather than the card: not card ink (plan 50, item 19).
      style={{ backgroundColor: 'rgba(8,10,14,0.9)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
    >
      {mode === 'qr' ? (
        <div className="flex flex-col items-center gap-3 max-w-full">
          {link ? (
            <div className="rounded-xl bg-white p-3" style={{ width: 'min(60%, 42vh)', aspectRatio: '1 / 1', minWidth: '7em' }}>
              <QRCodeSVG value={link} fgColor="#111" bgColor="#fff" style={{ width: '100%', height: '100%' }} />
            </div>
          ) : (
            <span style={{ opacity: TEXT_OPACITY.secondary }}>{t('news.noLink')}</span>
          )}
          <span className="text-center font-semibold" style={{ fontSize: '0.8em' }}>{t('news.scanToRead')}</span>
          <span className="text-center" style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.secondary, ...clampLines(2) }}>{item.title}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2 w-full max-h-full min-h-0">
          {meta && <span style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.secondary }}>{meta}</span>}
          <span className="font-bold leading-snug" style={{ fontSize: '1.15em', ...clampLines(4) }}>{item.title}</span>
          <div className="flex gap-3 min-h-0 items-end">
            <span className="leading-normal min-w-0 flex-1 overflow-hidden" style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.heading, ...clampLines(8) }}>
              {item.description || t('news.noDescription')}
            </span>
            {link && (
              <div className="rounded-md bg-white p-1 shrink-0" style={{ width: '4.5em', height: '4.5em' }}>
                <QRCodeSVG value={link} fgColor="#111" bgColor="#fff" style={{ width: '100%', height: '100%' }} />
              </div>
            )}
          </div>
          <span style={{ fontSize: '0.65em', opacity: TEXT_OPACITY.dim }}>
            {link ? t('news.scanToRead') : ''} · {t('news.tapToClose')}
          </span>
        </div>
      )}
    </div>
  );
}
