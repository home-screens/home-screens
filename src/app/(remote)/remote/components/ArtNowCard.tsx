'use client';

import { useCallback, useState } from 'react';
import { usePolledFetch } from '@/hooks/usePolledFetch';
import { useTranslate } from '@/i18n';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { useDisplayTarget } from '../display-target';
import { showToast } from '../remote-toast';
import PrimaryButton from './PrimaryButton';

interface PaintingNow {
  id: string;
  title: string;
  artist?: string;
  year?: number;
  museum?: string;
  thumb: string;
  about: string;
}

interface ArtNow { painting: PaintingNow | null; screenId?: string; display?: string | null }

/** How often the card asks what is on the wall. A new painting also shows up at once after a button here. */
const POLL_MS = 10_000;
/** The longest a tap waits for the hub's spacing between forced changes (5 s) before asking again. */
const RETRY_CAP_MS = 6_000;

/**
 * "On the wall now": the painting a wall is showing, with Next painting,
 * Don't show again (with Undo) and a link to its page on Wikimedia Commons.
 * Nothing is drawn while no wall is showing a painting from the art source.
 */
export default function ArtNowCard() {
  const t = useTranslate('remote');
  const { target, displays } = useDisplayTarget();
  const [now, setNow] = useState<ArtNow | null>(null);
  const [busy, setBusy] = useState(false);
  const display = target && target !== 'all' ? target : undefined;

  const load = useCallback(async () => {
    try {
      const res = await editorFetch(`/api/art/now${display ? `?display=${encodeURIComponent(display)}` : ''}`);
      if (res.ok) setNow(await res.json() as ArtNow);
    } catch (error) {
      if (isSessionExpired(error)) return;
      // The card keeps what it has: a missed poll is not worth a message.
    }
  }, [display]);

  // Only while the page is in view: a phone left on Photos in a pocket has
  // nobody to show the picture to.
  usePolledFetch(() => load(), [load], { intervalMs: POLL_MS, pauseWhenHidden: true });

  const painting = now?.painting ?? null;
  const screenId = now?.screenId;
  if (!painting || !screenId) return null;

  const wallName = now?.display ? displays.find((d) => d.id === now.display)?.name : undefined;
  const failed = () => showToast(t('photosTab.art.failed'), 'error');
  /**
   * A new picture for the screen now; the wall hears of it within a heartbeat.
   * The hub spaces forced changes a few seconds apart, so a tap that comes too
   * soon waits out the rest of that time and asks once more.
   */
  const rotate = async () => {
    const ask = () => editorFetch(`/api/backgrounds/rotate?screenId=${encodeURIComponent(screenId)}&force=true`);
    const res = await ask();
    if (!res.ok) return false;
    const answer = await res.json() as { spaced?: boolean; retryAfterMs?: number };
    if (!answer.spaced) return true;
    await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(answer.retryAfterMs ?? 0, 0), RETRY_CAP_MS) + 100));
    const again = await ask();
    // Still spaced means another phone or the editor changed it meanwhile: say it did not work rather than claim a new one.
    return again.ok && !(await again.json() as { spaced?: boolean }).spaced;
  };
  const setHidden = async (hidden: boolean) => (await editorFetch('/api/art/hidden', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: painting.id, hidden }),
  })).ok;
  const act = async (run: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await run();
    } catch (error) {
      if (!isSessionExpired(error)) failed();
    } finally {
      setBusy(false);
      // The hub has the new picture as soon as it answers; give the cache a moment and read it back.
      setTimeout(() => void load(), 1200);
    }
  };

  const next = () => act(async () => {
    if (await rotate()) showToast(t('photosTab.art.nextSent'));
    else failed();
  });
  const hide = () => act(async () => {
    if (!(await setHidden(true))) { failed(); return; }
    await rotate();
    showToast(t('photosTab.art.hidden', { title: painting.title }), 'info', {
      label: t('photosTab.art.undo'),
      onPress: () => { void setHidden(false).then((ok) => { if (!ok) failed(); }).catch(failed); },
    });
  });

  const quietButton: React.CSSProperties = {
    flex: 1, minHeight: 44, padding: '12px 8px', borderRadius: 12, border: 'none', fontSize: 15, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
    background: 'var(--hs-bg-card)', color: 'var(--hs-text-body)', opacity: busy ? 0.6 : 1,
  };
  const byline = [painting.artist, painting.year].filter(Boolean).join(', ');

  return (
    <section
      data-testid="art-now-card"
      style={{ margin: '0 0 16px', background: 'var(--hs-bg-panel)', border: '1px solid var(--hs-border)', borderRadius: 16, overflow: 'hidden' }}
    >
      {/* A painting served by Wikimedia Commons, not a file of ours. */}
      <img src={painting.thumb} alt={painting.title} style={{ display: 'block', width: '100%', maxHeight: 280, objectFit: 'cover' }} />
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hs-text-faint)' }}>
          {wallName ? t('photosTab.art.onWallAt', { wall: wallName }) : t('photosTab.art.onWall')}
        </div>
        <div style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontSize: 21, marginTop: 6, color: 'var(--hs-text-primary)' }} data-testid="art-now-title">{painting.title}</div>
        {(byline || painting.museum) && (
          <div style={{ color: 'var(--hs-text-muted)', marginTop: 4, fontSize: 15, lineHeight: 1.35 }}>
            {byline}{byline && painting.museum ? <br /> : null}{painting.museum}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <PrimaryButton compact onClick={next} disabled={busy} style={{ flex: 1, padding: '12px 8px', fontSize: 15 }} data-testid="art-now-next">{t('photosTab.art.next')}</PrimaryButton>
          <button type="button" onClick={hide} disabled={busy} className="press-btn" style={quietButton} data-testid="art-now-hide">{t('photosTab.art.hide')}</button>
        </div>
        <a
          href={painting.about} target="_blank" rel="noopener noreferrer"
          // A finger-sized target like the buttons above it, with the text where it was.
          style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, marginTop: 2, fontSize: 14, color: 'var(--hs-accent-hover)', textDecoration: 'none' }}
        >
          {t('photosTab.art.about')}
        </a>
      </div>
    </section>
  );
}
