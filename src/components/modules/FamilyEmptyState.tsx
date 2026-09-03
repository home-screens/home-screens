'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useOrigin } from '@/hooks/useOrigin';
import { phoneSurfaceUrl, phoneSurfaceLabel } from '@/lib/phone-surfaces';
import { TEXT_OPACITY } from '@/lib/constants';

interface FamilyEmptyStateProps {
  /** A big glyph or icon element. */
  icon: ReactNode;
  /** One plain sentence saying what is missing ("No chores yet"). */
  title: string;
  /**
   * Where to go, with `{url}` standing in for the hub's phone address
   * ("Add chores from a phone: open {url} and tap Chores"). The address is
   * this display's own origin plus `/remote`, which is the one fact the
   * person looking at the wall cannot otherwise know.
   */
  hint: string;
  /**
   * Base size the block scales from. Small modules leave this unset and
   * inherit the module font size (everything is in em); the fullscreen
   * modules pass a pixel size derived from the canvas so the empty state
   * fills a wall panel instead of leaving a one-line note in a void.
   */
  fontSize?: number;
  style?: CSSProperties;
}

/**
 * The one empty-state shape for family data modules (chores, meals): big
 * icon, one sentence, the exact place to go. Family data is entered on a
 * phone at /remote, never in the editor, so this never says "editor".
 */
export default function FamilyEmptyState({ icon, title, hint, fontSize, style }: FamilyEmptyStateProps) {
  const origin = useOrigin();
  // Scheme stripped for reading across a room; the bare path until the origin is known.
  const url = origin ? phoneSurfaceLabel('remote', origin) : phoneSurfaceUrl('remote', '');
  const [before, after] = hint.split('{url}');

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center text-center"
      style={{ gap: '0.5em', padding: '0.75em', fontSize, ...style }}
    >
      <span style={{ fontSize: '2.2em', lineHeight: 1, opacity: TEXT_OPACITY.secondary }} aria-hidden="true">
        {icon}
      </span>
      <p style={{ fontSize: '0.8em', fontWeight: 600, opacity: TEXT_OPACITY.heading, lineHeight: 1.3 }}>{title}</p>
      <p style={{ fontSize: '0.55em', opacity: TEXT_OPACITY.secondary, lineHeight: 1.45, maxWidth: '26em' }}>
        {before}
        <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{url}</span>
        {after}
      </p>
    </div>
  );
}
