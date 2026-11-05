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

/** Search words behind each idea (NASA's library searches in English). */
export const NASA_IDEAS = [
  { key: 'nebula', query: 'nebula' },
  { key: 'galaxy', query: 'galaxy' },
  { key: 'earth', query: 'earth from space' },
  { key: 'mars', query: 'mars surface' },
  { key: 'moon', query: 'moon' },
  { key: 'saturn', query: 'saturn rings' },
  { key: 'jupiter', query: 'jupiter' },
  { key: 'sun', query: 'sun solar' },
  { key: 'aurora', query: 'aurora borealis' },
  { key: 'iss', query: 'international space station' },
] as const;

/**
 * NASA: the Astronomy Picture of the Day (30 days at a time, newest first,
 * then Show more for the 30 before), and NASA's image library by idea or
 * search. Neither needs a key. Select Image copies into the `nasa` folder.
 */
export default function NasaTab({ selection, onSelect, copying }: PickerTabProps) {
  const t = useTranslate('editor');
  const [view, setView] = useState<string>('apod');
  const [typed, setTyped] = useState('');
  const apod = view === 'apod';
  const idea = NASA_IDEAS.find((i) => i.key === view);
  const query = apod ? '' : idea?.query ?? typed;
  const browse = usePickerBrowse({ kind: 'nasa', collection: apod ? 'apod' : 'search', query });

  // NASA's Picture of the Day API sending nothing but placeholders.
  const apodDown = (browse.failure?.body as { error?: string } | null)?.error === 'apod-unavailable';

  const choose = (next: string) => {
    setView(next);
    setTyped('');
    onSelect(null);
  };

  return (
    <div className="flex flex-1 min-h-0">
      <PickerSidebar>
        <PickerEntry label={t('photoSources.nasa.pictureOfTheDay')} selected={apod} onClick={() => choose('apod')} testId="nasa-apod" />
        <PickerGroup title={t('photoSources.nasa.searchGroup')} />
        {NASA_IDEAS.map((i) => (
          <PickerEntry
            key={i.key}
            label={t(`photoSources.nasa.ideas.${i.key}`)}
            selected={view === i.key}
            onClick={() => choose(i.key)}
            testId={`nasa-idea-${i.key}`}
          />
        ))}
      </PickerSidebar>
      <div className="flex flex-1 flex-col min-w-0">
        <PickerBar>
          {apod ? (
            <span className="flex-1 text-xs text-hs-text-muted">
              {t('photoSources.nasa.pictureOfTheDay')}
              <span className="ml-1 text-hs-text-faint">({t('photoSources.nasa.newestFirst')})</span>
            </span>
          ) : (
            <SearchBox
              value={typed}
              placeholder={t('photoSources.nasa.searchPlaceholder')}
              onSearch={(words) => { setTyped(words); setView('typed'); onSelect(null); }}
            />
          )}
        </PickerBar>
        <div className="flex-1 overflow-y-auto p-3">
          <RemoteGrid
            browse={browse}
            selectedKey={selection?.key ?? null}
            copying={copying}
            caption={(tile) => tile.secondary}
            onChoose={(tile) => onSelect(selection?.key === tile.ref ? null : {
              key: tile.ref,
              resolve: () => importPicture('nasa', tile.ref),
            })}
            empty={t('photoSources.nasa.empty')}
            failed={(
              <SetupHint
                text={apodDown ? t('photoSources.nasa.apodUnavailable') : t('photoSources.nasa.loadFailed')}
                action={{ label: t('photoSources.picker.tryAgain'), onClick: browse.retry }}
              />
            )}
          />
        </div>
      </div>
    </div>
  );
}
