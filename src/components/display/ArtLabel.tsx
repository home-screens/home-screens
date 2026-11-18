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
 * wall under a framed painting, or lettering on the mat under the painting,
 * whether the mat fills the screen or sits inside a frame. The hub decided
 * where it goes when it painted the picture (`art.place`, in the screen's own
 * pixels), so label and picture agree.
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
  // Lettering on the mat inside a frame: two short lines in the middle of the strip of mat under the painting.
  const banded = !placard && place.band !== undefined;
  const size = placard ? { title: 27, byline: 18, museum: 15, gap: 8 } : banded ? { title: 22, byline: 14, museum: 14, gap: 5 } : { title: 36, byline: 23, museum: 19, gap: 10 };
  const oneLine = banded ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const : {};
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
        ...(banded ? { height: place.band, display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' } : {}),
      }}
    >
      <div style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontWeight: 500, fontSize: size.title * u, lineHeight: 1.2, letterSpacing: '0.005em', ...oneLine }}>{art.title}</div>
      {/* On the mat inside a frame, artist, year and museum share the second line: the strip has room for two. */}
      {banded ? (byline || art.museum) && (
        <div style={{ fontSize: size.byline * u, marginTop: size.gap * u, fontWeight: 450, ...oneLine }}>
          {byline}
          {art.museum && <span style={{ opacity: 0.62 }}>{byline ? ' \u00a0\u00b7\u00a0 ' : ''}{art.museum}</span>}
        </div>
      ) : (
        <>
          {byline && <div style={{ fontSize: size.byline * u, marginTop: size.gap * u, fontWeight: 450 }}>{byline}</div>}
          {art.museum && <div style={{ fontSize: size.museum * u, marginTop: 6 * u, opacity: 0.62 }}>{art.museum}</div>}
        </>
      )}
    </div>
  );
}
