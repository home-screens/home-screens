'use client';

import { useEffect, useState } from 'react';
import { ART_LABEL_SECONDS, type ArtCaption } from '@/lib/art-presentation';

const FADE_MS = 1200;

/**
 * Whether a painting's museum label is up: always, never, or for the first
 * seconds after the painting changes. The small corner caption shows whenever
 * this says no.
 */
export function useArtLabelShown(art: ArtCaption | undefined, pictureKey: string | null | undefined): boolean {
  const brief = art?.label === 'brief';
  const key = art ? `${art.id}|${pictureKey ?? ''}` : null;
  const [expired, setExpired] = useState<string | null>(null);
  useEffect(() => {
    if (!brief || !key) return;
    const timer = setTimeout(() => setExpired(key), ART_LABEL_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [brief, key]);
  if (!art || art.label === 'off') return false;
  return art.label === 'always' || expired !== key;
}

/**
 * The museum label for the painting behind a screen: a small card on the
 * wall beside a framed painting, or lettering on the mat under one that sits
 * in a mat. The hub decided where it goes when it painted the picture
 * (`art.place`, in the screen's own pixels), so label and picture agree.
 */
export default function ArtLabel({ art, shown, evening = false }: {
  art: ArtCaption;
  shown: boolean;
  /** The background is in its evening light, so the card on the wall is warmed and dimmed with it. */
  evening?: boolean;
}) {
  const { place } = art;
  const u = place.unit;
  const byline = [art.artist, art.year].filter(Boolean).join(', ');
  const placard = place.style === 'placard';
  const lettering = placard ? '#2c2924' : place.tone === 'light' ? '#ece6d8' : '#3a352c';
  return (
    <div
      data-testid="art-label"
      data-shown={shown}
      aria-hidden={!shown}
      className="pointer-events-none absolute"
      style={{
        left: place.x,
        top: place.y,
        width: place.w,
        opacity: shown ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease, filter 90s ease-in-out`,
        filter: evening ? 'brightness(0.72) sepia(0.4) saturate(1.25)' : 'none',
        lineHeight: 1.2,
        color: lettering,
        textAlign: placard ? 'left' : 'center',
        ...(placard ? {
          background: '#f4f1ea',
          padding: `${20 * u}px ${22 * u}px ${22 * u}px`,
          borderRadius: 2 * u,
          boxShadow: `0 ${2 * u}px ${3 * u}px rgba(0,0,0,0.35), 0 ${10 * u}px ${24 * u}px rgba(0,0,0,0.28)`,
        } : {}),
      }}
    >
      <div style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontWeight: 500, fontSize: (placard ? 27 : 36) * u, lineHeight: 1.2, letterSpacing: '0.005em' }}>{art.title}</div>
      {byline && <div style={{ fontSize: (placard ? 18 : 23) * u, marginTop: (placard ? 8 : 10) * u, fontWeight: 450 }}>{byline}</div>}
      {art.museum && <div style={{ fontSize: (placard ? 15 : 19) * u, marginTop: 6 * u, opacity: 0.62 }}>{art.museum}</div>}
    </div>
  );
}
