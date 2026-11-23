'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Images, Pause, Play } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { editorFetch } from '@/lib/editor-fetch';
import { displayCommandRequest } from '@/lib/display-dispatch';
import type { SlideshowAction } from '@/components/modules/shared/slideshow-commands';
import { useDisplayTarget } from '../display-target';
import { REMOTE_ACCENT, REMOTE_ON_ACCENT } from './remote-styles';

interface SlideshowControlsProps {
  /** The photo module types on the screens showing now, which the command addresses. */
  moduleTypes: string[];
  /** Changes when the wall moves to another screen, whose slideshow starts unpaused. */
  screenKey: string;
  disabled: boolean;
}

const ROUND = 'w-12 h-12 rounded-full bg-hs-card border border-hs-border-strong text-hs-text-muted flex items-center justify-center shrink-0 transition-colors active:bg-hs-hover active:scale-95 disabled:opacity-40';

/**
 * Back, pause and next for the slideshow on the wall right now, shown only
 * while the screen on show has one: the phone as a photo-frame remote ("go
 * back, I want to see that one again"). Pause holds the photo on screen
 * until Play; a screen that rotates away and back starts playing again, so
 * the button follows the screen.
 */
export default function SlideshowControls({ moduleTypes, screenKey, disabled }: SlideshowControlsProps) {
  const t = useTranslate('remote');
  const { target } = useDisplayTarget();
  const [paused, setPaused] = useState(false);
  useEffect(() => setPaused(false), [screenKey]);

  const send = (action: SlideshowAction) => {
    for (const moduleType of moduleTypes) {
      const { url, init } = displayCommandRequest('module-command', target, { module: moduleType, action });
      editorFetch(url, init).catch(() => {});
    }
  };

  return (
    <div className={`mx-5 mt-4 p-4 bg-hs-card border border-hs-border rounded-[14px] ${disabled ? 'opacity-40' : ''}`} data-testid="slideshow-controls">
      <div className="flex items-center gap-2 text-sm font-semibold text-hs-text-primary mb-3">
        <Images className="w-[18px] h-[18px] text-hs-success" aria-hidden="true" />
        {t('slideshowControls.title')}
      </div>
      <div className="flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={() => send('prev')}
          disabled={disabled}
          className={ROUND}
          aria-label={t('slideshowControls.back')}
          data-testid="slideshow-back"
        >
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            const next = !paused;
            setPaused(next);
            send(next ? 'pause' : 'play');
          }}
          disabled={disabled}
          aria-pressed={paused}
          className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 disabled:opacity-40"
          style={{ background: REMOTE_ACCENT, color: REMOTE_ON_ACCENT }}
          aria-label={paused ? t('slideshowControls.play') : t('slideshowControls.pause')}
          data-testid="slideshow-pause"
        >
          {paused ? <Play className="w-6 h-6 ml-0.5" fill="currentColor" aria-hidden="true" /> : <Pause className="w-6 h-6" fill="currentColor" aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={() => send('next')}
          disabled={disabled}
          className={ROUND}
          aria-label={t('slideshowControls.next')}
          data-testid="slideshow-next"
        >
          <ChevronRight className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
