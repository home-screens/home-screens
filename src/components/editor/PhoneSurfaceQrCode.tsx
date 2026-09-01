'use client';

import { QRCodeSVG } from 'qrcode.react';
import { phoneSurfaceUrl, type PhoneSurface } from '@/lib/phone-surfaces';

interface PhoneSurfaceQrCodeProps {
  surface: PhoneSurface;
  /** Origin the editor was reached on; `''` before mount (see `useOrigin`). */
  origin: string;
  size: number;
}

/**
 * The scannable code for one phone surface, on the white plate a camera needs.
 *
 * Always light, never themed: a QR code is read by contrast, and inverting it
 * for dark mode is the one "theme-aware" choice that stops phones scanning it.
 *
 * Renders nothing until `origin` is known — a code encoding a bare `/chores`
 * path scans to something unopenable, which is worse than a code appearing a
 * tick late.
 */
export default function PhoneSurfaceQrCode({ surface, origin, size }: PhoneSurfaceQrCodeProps) {
  if (!origin) {
    return (
      <div
        className="shrink-0 rounded-md border border-dashed border-hs-border-strong"
        style={{ width: size + 12, height: size + 12 }}
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="shrink-0 rounded-md bg-white p-1.5 leading-none">
      <QRCodeSVG
        value={phoneSurfaceUrl(surface, origin)}
        size={size}
        level="M"
        bgColor="#ffffff"
        fgColor="#0a0a0a"
      />
    </div>
  );
}
