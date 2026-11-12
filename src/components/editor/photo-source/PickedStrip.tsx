'use client';

import { useState } from 'react';
import { ImageOff, X } from 'lucide-react';
import { useTranslate } from '@/i18n';

export interface PickedItem {
  id: string;
  /** A small picture of the pick; left out when none is known. */
  thumb?: string;
  /** What the pick is called, for its tooltip and the button's name. */
  name: string;
}

/**
 * Everything picked for a source, as small tiles, whatever folder, album or
 * search the grid below is showing: the picks made somewhere else stay in
 * sight, and a click on one takes it out without going back to find it.
 */
export default function PickedStrip({ items, onRemove }: {
  items: readonly PickedItem[];
  onRemove: (id: string) => void;
}) {
  const t = useTranslate('editor');
  if (items.length === 0) return null;
  return (
    <ul className="flex max-h-[100px] flex-wrap gap-1 overflow-y-auto" data-testid="picked-strip">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            title={t('photoSources.picked.takeOut', { name: item.name })}
            aria-label={t('photoSources.picked.takeOut', { name: item.name })}
            data-testid={`picked-${item.id}`}
            className="group relative block h-11 w-11 overflow-hidden rounded border border-hs-accent bg-hs-card"
          >
            <PickedThumb thumb={item.thumb} />
            <span className="absolute right-0 top-0 flex h-3.5 w-3.5 items-center justify-center rounded-bl bg-black/70 text-white group-hover:bg-hs-danger" aria-hidden="true">
              <X size={10} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The pick's picture, or a plain mark when there is none or it no longer loads. */
function PickedThumb({ thumb }: { thumb?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (!thumb || broken === thumb) {
    return <span className="flex h-full w-full items-center justify-center text-hs-text-faint"><ImageOff size={14} aria-hidden="true" /></span>;
  }
  return <img src={thumb} alt="" loading="lazy" decoding="async" onError={() => setBroken(thumb)} className="h-full w-full object-cover" />;
}
