'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { holdRotationFor } from '@/lib/interaction-hold';
import { BROWSE_ROTATION_HOLD_MS } from '@/components/display/useTapRotationHold';
import { WALL_SCROLL_GLASS_REST_MS, WALL_SCROLL_IDLE_MS, WALL_SCROLL_THUMB_FADE_MS, isAwayFromHome, isNearEnd, wallScrollThumb } from '@/lib/wall-scroll';
import { wallPressProps } from './wallPress';

/** A scroll inside this long of an earlier one is the same gesture: one rotation hold, not one per frame. */
const HOLD_THROTTLE_MS = 1_000;
/** Our own instant scroll's event lands a frame or two later; a smooth glide home lasts well under this. */
const OWN_SCROLL_INSTANT_MS = 120;
const OWN_SCROLL_SMOOTH_MS = 900;

export interface WallScrollerProps {
  /**
   * A touch wall with taps on: a finger scrolls the list. Off (the editor
   * preview, a wall with taps off), the box clips exactly as before and only
   * `home` positions it.
   */
  enabled: boolean;
  /**
   * Where the list sits at rest, as a scroll offset of the scrolling box. It
   * may lay things out first (the meal List adds blank room after the week).
   * Read on mount, whenever the content changes size while nobody has
   * scrolled it, and on the way back home. Unset: the top.
   */
  home?: (box: HTMLDivElement) => number;
  /** Re-reads home when it changes (a new day, a new search). */
  homeKey?: string | number;
  /** The button shown while the list is away from home ("Back to today"). Unset: no button. */
  backLabel?: string;
  /** The button's look on this surface; it is drawn top centre over the list. */
  backStyle?: CSSProperties;
  /** The scroll bar's colour. */
  thumbColor?: string;
  /** The scroll bar's width in pixels. */
  thumbWidth?: number;
  /**
   * Leave the list where a finger put it instead of gliding home a minute
   * after the last touch: an open recipe someone is cooking from, read in
   * bits between stirs.
   */
  stays?: boolean;
  /** How long a scroll holds the screen. Unset: the browsing minute (`BROWSE_ROTATION_HOLD_MS`). */
  holdMs?: number;
  /** Called while the list is near its end (load the next page). The caller ignores repeats. */
  onNearEnd?: () => void;
  /** The scrolling box. */
  style?: CSSProperties;
  className?: string;
  /** The outer frame the bar and button sit in. */
  frameStyle?: CSSProperties;
  testId?: string;
  children: ReactNode;
}

/**
 * A list a finger can scroll on a touch wall, which goes home by itself.
 *
 * At rest it looks exactly like the clipped list a wall has always shown. A
 * finger drag scrolls it natively (the display's `touch-action: pan-y` gives
 * vertical drags to the page and keeps sideways flicks for changing screens).
 * While it moves, a slim bar shows on the right and fades after it stops;
 * away from home, a button at the top goes straight back; a minute after the
 * last touch it glides home on its own. Each scroll holds the screen the way
 * a tap on a control does, so the screen does not change under a reader.
 *
 * Nothing here runs per frame through React: the bar is moved through its
 * style, and state changes only when the button appears or goes.
 */
export function WallScroller({
  enabled, home, homeKey, backLabel, backStyle, thumbColor = 'rgba(127,127,127,0.55)', thumbWidth = 6,
  stays = false, holdMs = BROWSE_ROTATION_HOLD_MS, onNearEnd, style, className, frameStyle, testId, children,
}: WallScrollerProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const homeRef = useRef(home);
  homeRef.current = home;
  const nearEndRef = useRef(onNearEnd);
  nearEndRef.current = onNearEnd;

  const homeTopRef = useRef(0);
  // Scrolled by a person since it last went home: leave it where they put it.
  const awayByUserRef = useRef(false);
  const ownScrollUntilRef = useRef(0);
  const lastHoldRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameRef = useRef<number | null>(null);
  // Away from home, and which way home is: up (scrolled down past it) or down.
  const [away, setAway] = useState<'up' | 'down' | null>(null);

  const readHome = useCallback((box: HTMLDivElement) => {
    const top = homeRef.current ? homeRef.current(box) : 0;
    homeTopRef.current = Math.max(0, top);
    return homeTopRef.current;
  }, []);

  const goHome = useCallback((smooth: boolean) => {
    const box = boxRef.current;
    if (!box) return;
    const top = readHome(box);
    awayByUserRef.current = false;
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    ownScrollUntilRef.current = performance.now() + (smooth ? OWN_SCROLL_SMOOTH_MS : OWN_SCROLL_INSTANT_MS);
    if (smooth) box.scrollTo({ top, behavior: 'smooth' });
    else box.scrollTop = top;
    setAway(null);
  }, [readHome]);

  // Home on mount, on a new day or search, and whenever the content changes
  // size while nobody has moved the list.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    goHome(false);
    const observer = new ResizeObserver(() => {
      if (!awayByUserRef.current) goHome(false);
    });
    observer.observe(box);
    if (box.firstElementChild) observer.observe(box.firstElementChild);
    return () => observer.disconnect();
  }, [goHome, homeKey]);

  // The card's frosted glass rests while the list moves (`WALL_SCROLL_GLASS_REST_MS`).
  const glassCardRef = useRef<HTMLElement | null>(null);
  const glassTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restGlass = useCallback(() => {
    const card = glassCardRef.current ?? boxRef.current?.closest<HTMLElement>('[data-module-card]') ?? null;
    if (!card) return;
    glassCardRef.current = card;
    card.setAttribute('data-wall-scrolling', '');
    if (glassTimerRef.current) clearTimeout(glassTimerRef.current);
    glassTimerRef.current = setTimeout(() => {
      glassTimerRef.current = null;
      card.removeAttribute('data-wall-scrolling');
    }, WALL_SCROLL_GLASS_REST_MS);
  }, []);

  useEffect(() => () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    if (glassTimerRef.current) clearTimeout(glassTimerRef.current);
    glassCardRef.current?.removeAttribute('data-wall-scrolling');
  }, []);

  const drawThumb = useCallback(() => {
    frameRef.current = null;
    const box = boxRef.current;
    const thumb = thumbRef.current;
    if (!box || !thumb) return;
    const geo = wallScrollThumb(box.scrollTop, box.scrollHeight, box.clientHeight);
    if (!geo) {
      thumb.style.opacity = '0';
      return;
    }
    thumb.style.height = `${geo.height}px`;
    thumb.style.transform = `translateY(${geo.top}px)`;
    thumb.style.opacity = '1';
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => { thumb.style.opacity = '0'; }, WALL_SCROLL_THUMB_FADE_MS);
  }, []);

  const onScroll = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    if (isNearEnd(box.scrollTop, box.scrollHeight, box.clientHeight)) nearEndRef.current?.();
    if (!enabled) return;
    // A glide home moves the list too, so the glass rests for it as well.
    restGlass();
    if (performance.now() < ownScrollUntilRef.current) return;
    // A person moved it.
    awayByUserRef.current = true;
    const now = Date.now();
    if (now - lastHoldRef.current >= HOLD_THROTTLE_MS) {
      lastHoldRef.current = now;
      // A list moved away from home is someone reading: hold the screen for the
      // same minute after which the list slides home (or the caller's own hold).
      holdRotationFor(holdMs);
    }
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(drawThumb);
    if (!stays) {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => goHome(true), WALL_SCROLL_IDLE_MS);
    }
    const next = isAwayFromHome(box.scrollTop, homeTopRef.current, box.clientHeight)
      ? (box.scrollTop > homeTopRef.current ? 'up' : 'down')
      : null;
    setAway((was) => (was === next ? was : next));
  }, [enabled, stays, holdMs, drawThumb, goHome, restGlass]);

  // A person's touch or wheel: the scroll it starts is theirs, even during or
  // just after a glide home (else a flick right after "Back to today" never
  // showed the button or went home again).
  const onWheel = useCallback(() => { ownScrollUntilRef.current = 0; }, []);

  // A finger resting on the list (reading, about to tap) restarts the minute too.
  const onPointerDown = useCallback(() => {
    if (!enabled) return;
    ownScrollUntilRef.current = 0;
    if (!awayByUserRef.current) return;
    holdRotationFor(holdMs);
    if (stays) return;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => goHome(true), WALL_SCROLL_IDLE_MS);
  }, [enabled, stays, holdMs, goHome]);

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', ...frameStyle }}>
      <div
        ref={boxRef}
        data-testid={testId}
        data-wall-scroll={enabled ? 'on' : 'off'}
        className={className}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onWheel={enabled ? onWheel : undefined}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: enabled ? 'auto' : 'hidden',
          overflowX: 'hidden',
          overscrollBehavior: 'contain',
          scrollbarWidth: 'none',
          position: 'relative',
          // Room for the bar, so it never sits over the right-hand words (a grocery amount, an event time).
          // A caller that pads the list itself has made its own room.
          paddingRight: enabled && style?.padding === undefined ? thumbWidth + 4 : undefined,
          ...style,
        }}
      >
        {children}
      </div>
      {enabled && (
        <div
          ref={thumbRef}
          aria-hidden="true"
          data-testid={testId ? `${testId}-thumb` : undefined}
          style={{
            position: 'absolute', top: 0, right: 2, width: thumbWidth, borderRadius: thumbWidth / 2,
            background: thumbColor, opacity: 0, transition: 'opacity 250ms ease-out', pointerEvents: 'none', zIndex: 2,
          }}
        />
      )}
      {enabled && away && backLabel && (
        <button
          type="button"
          {...wallPressProps}
          data-testid={testId ? `${testId}-home` : undefined}
          onClick={() => goHome(true)}
          style={{
            position: 'absolute', top: '0.5em', left: '50%', transform: 'translateX(-50%)', zIndex: 3,
            display: 'inline-flex', alignItems: 'center', gap: '0.4em', whiteSpace: 'nowrap',
            border: 0, borderRadius: 999, padding: '0.45em 1.1em', font: 'inherit', fontWeight: 700, cursor: 'pointer',
            background: '#3b82f6', color: '#fff', boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
            ...backStyle,
          }}
        >
          <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={away === 'up' ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'} />
          </svg>
          {backLabel}
        </button>
      )}
    </div>
  );
}
