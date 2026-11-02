'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import { PickerEntry, PickerGroup, PickerSidebar } from './PickerSidebar';
import RemoteGrid, { PickerBar } from './RemoteGrid';
import SearchBox from './SearchBox';
import SetupHint from './SetupHint';
import { usePickerBrowse } from './usePickerBrowse';
import { importPicture } from './import-picture';
import type { PickerTabProps } from './types';

/**
 * Search words behind each idea. Unsplash searches in English, so the words
 * stay English whatever the editor's language; only the labels translate.
 * Holidays and Birthday are here because Countdown events and Image modules
 * open this window, and they are mostly birthdays and holidays.
 */
export const UNSPLASH_IDEAS = [
  { key: 'nature', query: 'nature landscape' },
  { key: 'mountains', query: 'mountains scenic' },
  { key: 'ocean', query: 'ocean sea coast' },
  { key: 'forest', query: 'forest trees' },
  { key: 'sky', query: 'sky clouds sunset' },
  { key: 'space', query: 'space galaxy nebula' },
  { key: 'city', query: 'city skyline night' },
  { key: 'flowers', query: 'flowers botanical' },
  { key: 'seasons', query: 'seasons autumn winter' },
  { key: 'holidays', query: 'holiday celebration' },
  { key: 'birthday', query: 'birthday party' },
  { key: 'abstract', query: 'abstract gradient dark' },
] as const;

/**
 * Unsplash in the same layout as every other tab: ideas where folders sit,
 * a search box above the grid, select then confirm. Select Image copies the
 * photo into the library's `unsplash` folder and tells Unsplash it was
 * downloaded, as their guidelines ask; the photographer is named on the tile
 * and in the footer.
 */
export default function UnsplashTab({ selection, onSelect, copying, ready, orientation }: PickerTabProps & {
  ready: boolean;
  orientation?: 'portrait' | 'landscape';
}) {
  const t = useTranslate('editor');
  const [idea, setIdea] = useState<string | null>(UNSPLASH_IDEAS[0].key);
  const [typed, setTyped] = useState('');
  const query = idea ? UNSPLASH_IDEAS.find((i) => i.key === idea)!.query : typed;
  const browse = usePickerBrowse({ kind: 'unsplash', collection: 'search', query, orientation, enabled: ready });

  if (!ready) return <div className="flex-1"><SetupHint text={t('photoSources.unsplash.needsKey')} /></div>;

  return (
    <div className="flex flex-1 min-h-0">
      <PickerSidebar footer={t('photoSources.unsplash.orSearch')}>
        <PickerGroup title={t('photoSources.picker.ideas')} />
        {UNSPLASH_IDEAS.map((i) => (
          <PickerEntry
            key={i.key}
            label={t(`photoSources.unsplash.ideas.${i.key}`)}
            selected={idea === i.key}
            onClick={() => { setIdea(i.key); setTyped(''); onSelect(null); }}
            testId={`unsplash-idea-${i.key}`}
          />
        ))}
      </PickerSidebar>
      <div className="flex flex-1 flex-col min-w-0">
        <PickerBar>
          <SearchBox
            value={typed}
            placeholder={t('photoSources.unsplash.searchPlaceholder')}
            onSearch={(words) => { setTyped(words); setIdea(null); onSelect(null); }}
          />
        </PickerBar>
        <div className="flex-1 overflow-y-auto p-3">
          <RemoteGrid
            browse={browse}
            selectedKey={selection?.key ?? null}
            copying={copying}
            caption={(tile) => tile.credit?.name}
            onChoose={(tile) => onSelect(selection?.key === tile.ref ? null : {
              key: tile.ref,
              hint: tile.credit?.name ? t('photoSources.unsplash.creditHint', { name: tile.credit.name }) : undefined,
              resolve: () => importPicture('unsplash', tile.ref),
            })}
            empty={t('photoSources.unsplash.empty')}
            failed={(
              <SetupHint
                text={(browse.failure?.body as { error?: string } | null)?.error === 'unsplash-rate-limit'
                  ? t('photoSources.unsplash.rateLimited')
                  : t('photoSources.unsplash.loadFailed')}
                action={{ label: t('photoSources.picker.tryAgain'), onClick: browse.retry }}
              />
            )}
          />
        </div>
      </div>
    </div>
  );
}
