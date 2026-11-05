'use client';

import { tileThumbnailUrl } from '@/lib/media-paths';

/** A row of small pictures under a source, so a choice shows what it brings. */
export default function PreviewStrip({ urls }: { urls: readonly string[] }) {
  if (urls.length === 0) return null;
  return (
    <div className="flex gap-1 mt-1 overflow-x-auto" data-testid="photo-source-preview">
      {urls.map((url) => (
        <img
          key={url}
          src={tileThumbnailUrl(url)}
          alt=""
          loading="lazy"
          className="w-12 h-12 rounded object-cover flex-shrink-0 border border-hs-border-strong"
        />
      ))}
    </div>
  );
}
