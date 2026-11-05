'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import LabeledInput from '@/components/ui/LabeledInput';
import { useEditorData } from '@/hooks/useEditorData';
import { PHOTO_SOURCE_MEDIA_PATH, photoSourceParams } from '@/lib/photo-source';
import { useTranslate } from '@/i18n';
import type { MediaListItem } from '@/types/config';

/** The collection id in a pasted Unsplash address (`unsplash.com/collections/<id>/<slug>`), or the text as typed. */
export function parseCollectionId(raw: string): string {
  const text = raw.trim();
  const match = /unsplash\.com\/collections\/([A-Za-z0-9_-]+)/.exec(text);
  return (match ? match[1] : text).replace(/[^A-Za-z0-9_-]/g, '');
}

/**
 * Unsplash collections as a source: a short list of collection ids, each
 * checked against Unsplash once (does it exist, does it hold photos) so a
 * typo is caught here and not as a wall that never changes.
 */
export default function UnsplashCollectionsFields({ collections, ready, onChange }: {
  collections: string[];
  /** The Unsplash key is saved, so a collection can be checked. */
  ready: boolean;
  onChange: (collections: string[]) => void;
}) {
  const t = useTranslate('editor');
  const [draft, setDraft] = useState('');
  const add = () => {
    const id = parseCollectionId(draft);
    if (!id || collections.includes(id)) return;
    onChange([...collections, id]);
    setDraft('');
  };
  return (
    <div className="space-y-2" data-testid="unsplash-collections">
      <p className="text-[10px] leading-relaxed text-hs-text-faint">{t('photoSources.unsplash.collectionsHelp')}</p>
      {collections.map((id) => (
        <CollectionRow key={id} id={id} ready={ready} onRemove={() => onChange(collections.filter((c) => c !== id))} />
      ))}
      <form className="flex items-end gap-1.5" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <div className="min-w-0 flex-1">
          <LabeledInput
            label={t('photoSources.unsplash.collectionLabel')}
            value={draft}
            placeholder="https://unsplash.com/collections/..."
            onChange={setDraft}
          />
        </div>
        <Button size="sm" type="submit" disabled={!parseCollectionId(draft)}>{t('photoSources.unsplash.addCollection')}</Button>
      </form>
    </div>
  );
}

function CollectionRow({ id, ready, onRemove }: { id: string; ready: boolean; onRemove: () => void }) {
  const t = useTranslate('editor');
  // One photo from the collection says whether it exists and holds any.
  const { data, error, loading } = useEditorData<MediaListItem[]>(
    ready ? `${PHOTO_SOURCE_MEDIA_PATH}?${photoSourceParams({ kind: 'unsplash', query: '', collections: [id] })}&count=1` : null,
    null,
  );
  const status = !ready ? null
    : loading || (data === null && !error) ? t('photoSources.unsplash.collectionChecking')
      : error ? t('photoSources.unsplash.collectionNotFound')
        : (data ?? []).length > 0 ? t('photoSources.unsplash.collectionValid') : t('photoSources.unsplash.collectionEmpty');
  return (
    <div className="rounded border border-hs-border-strong bg-hs-card px-2 py-1" data-testid={`unsplash-collection-${id}`}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-hs-text-body">{id}</span>
        <button type="button" onClick={onRemove} className="shrink-0 text-[10px] text-hs-text-faint hover:text-hs-text-body" aria-label={t('photoSources.unsplash.removeCollection', { id })}>
          {t('photoSources.unsplash.removeCollectionShort')}
        </button>
      </div>
      {status && <div className="text-[10px] text-hs-text-faint">{status}</div>}
    </div>
  );
}
