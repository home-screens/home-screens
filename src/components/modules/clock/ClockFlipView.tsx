'use client';

import { useRef, useState, useEffect } from 'react';
import { parseClockTime } from '@/lib/date-info';
import { fitFactor, flipRowWidth } from './fit-width';
import type { ClockViewProps } from './types';

const FLIP_DURATION = 500; // ms

function FlipCard({
  digit,
  size,
  accentColor,
  animate,
}: {
  digit: string;
  size: number;
  accentColor: string;
  animate: boolean;
}) {
  const prevDigitRef = useRef(digit);
  const [flipping, setFlipping] = useState(false);
  const [displayPrev, setDisplayPrev] = useState(digit);

  useEffect(() => {
    if (digit !== prevDigitRef.current) {
      if (animate) {
        setDisplayPrev(prevDigitRef.current);
        setFlipping(true);
        const timer = setTimeout(() => setFlipping(false), FLIP_DURATION);
        prevDigitRef.current = digit;
        return () => clearTimeout(timer);
      }
      prevDigitRef.current = digit;
    }
  }, [digit, animate]);

  const w = size * 0.65;
  const h = size;
  const fs = size * 0.82;
  const borderColor = accentColor ? `${accentColor}20` : 'rgba(255,255,255,0.06)';

  // Shared text style — full card height, centered, so clipping top/bottom half works
  // The digits are white on purpose: they sit on the flap's own dark fill
  // (#1a1a1a below), not on the card, so they are chip ink and do not follow
  // the text colour (plan 50, item 19).
  const textBase: React.CSSProperties = {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    fontSize: fs,
    fontWeight: 300,
    lineHeight: `${h}px`,
    left: 0,
  };

  return (
    <div style={{ width: w, height: h, position: 'relative' }}>
      {/* ── Layer 1: Static new digit (background, always shows new value) ── */}
      {/* Top half — new digit */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, width: w, height: h / 2,
          overflow: 'hidden', background: '#1a1a1a',
          borderRadius: '6px 6px 0 0',
          border: `1px solid ${borderColor}`,
          borderBottom: 'none',
        }}
      >
        <span className="tabular-nums" style={{ ...textBase, top: 0, color: 'rgba(255,255,255,0.92)' }} suppressHydrationWarning>
          {digit}
        </span>
      </div>
      {/* Bottom half — new digit */}
      <div
        style={{
          position: 'absolute', top: h / 2, left: 0, width: w, height: h / 2,
          overflow: 'hidden', background: '#151515',
          borderRadius: '0 0 6px 6px',
          border: `1px solid ${borderColor}`,
          borderTop: 'none',
        }}
      >
        <span className="tabular-nums" style={{ ...textBase, top: -h / 2, color: 'rgba(255,255,255,0.85)' }} suppressHydrationWarning>
          {flipping ? displayPrev : digit}
        </span>
      </div>

      {/* ── Layer 2: Animated top flap (old digit, folds down) ── */}
      {flipping && (
        <div
          style={{
            position: 'absolute', top: 0, left: 0, width: w, height: h / 2,
            overflow: 'hidden', background: '#1a1a1a',
            borderRadius: '6px 6px 0 0',
            border: `1px solid ${borderColor}`,
            borderBottom: 'none',
            transformOrigin: '50% 100%',
            animation: `flip-top-down ${FLIP_DURATION}ms ease-in forwards`,
            zIndex: 3,
          }}
        >
          <span className="tabular-nums" style={{ ...textBase, top: 0, color: 'rgba(255,255,255,0.92)' }}>
            {displayPrev}
          </span>
        </div>
      )}

      {/* ── Center divider ── */}
      <div
        style={{
          position: 'absolute', top: h / 2 - 1, left: 0, right: 0, height: 2,
          background: 'linear-gradient(to right, rgba(0,0,0,0.7), rgba(0,0,0,0.4), rgba(0,0,0,0.7))',
          zIndex: 4,
        }}
      />

      {/* ── Shadow under top half ── */}
      <div
        style={{
          position: 'absolute', top: h / 2, left: 0, right: 0, height: 6,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.3), transparent)',
          zIndex: 2,
        }}
      />

      {/* ── Inner shadow overlay ── */}
      <div
        style={{
          position: 'absolute', inset: 0, borderRadius: 6,
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4), inset 0 -1px 3px rgba(0,0,0,0.2)',
          pointerEvents: 'none',
          zIndex: 5,
        }}
      />
    </div>
  );
}

function FlipColon({ size, accentColor }: { size: number; accentColor: string }) {
  const dotSize = Math.max(size * 0.08, 4);
  const color = accentColor || 'rgba(255, 255, 255, 0.5)';

  return (
    <div
      className="clock-flip-colon flex flex-col items-center justify-center"
      style={{ width: size * 0.2, height: size, gap: size * 0.2 }}
    >
      <div style={{ width: dotSize, height: dotSize, borderRadius: 2, background: color }} />
      <div style={{ width: dotSize, height: dotSize, borderRadius: 2, background: color }} />
    </div>
  );
}

export default function ClockFlipView({ config, now, scaledFontSize, containerRef, boxWidth }: ClockViewProps) {
  const { h, mStr, sStr } = parseClockTime(config.format24h, now);
  // Flip cards always need 2-digit hours
  const hStr = String(h).padStart(2, '0');

  const accent = config.accentColor || 'rgba(255, 255, 255, 0.5)';
  // Shrink the cards when the row is wider than the box; the height-derived
  // size stays the ceiling.
  const baseCardSize = scaledFontSize * 3.5;
  const cards = config.showSeconds ? 6 : 4;
  const colons = config.showSeconds ? 2 : 1;
  const cardSize = baseCardSize * fitFactor(flipRowWidth(baseCardSize, cards, colons), boxWidth);
  const gap = Math.max(cardSize * 0.04, 2);
  const animate = config.animateFlip !== false;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center"
    >
      <style>{`
        @keyframes flip-top-down {
          0% {
            transform: perspective(400px) rotateX(0deg);
          }
          100% {
            transform: perspective(400px) rotateX(-90deg);
          }
        }
        @keyframes flip-colon-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .clock-flip-colon {
          animation: flip-colon-pulse 2s ease-in-out infinite;
        }
      `}</style>

      <div className="flex items-center" style={{ gap }}>
        <FlipCard digit={hStr[0]} size={cardSize} accentColor={accent} animate={animate} />
        <FlipCard digit={hStr[1]} size={cardSize} accentColor={accent} animate={animate} />

        <FlipColon size={cardSize} accentColor={accent} />

        <FlipCard digit={mStr[0]} size={cardSize} accentColor={accent} animate={animate} />
        <FlipCard digit={mStr[1]} size={cardSize} accentColor={accent} animate={animate} />

        {config.showSeconds && (
          <>
            <FlipColon size={cardSize} accentColor={accent} />
            <FlipCard digit={sStr[0]} size={cardSize} accentColor={accent} animate={animate} />
            <FlipCard digit={sStr[1]} size={cardSize} accentColor={accent} animate={animate} />
          </>
        )}
      </div>
    </div>
  );
}
