'use client';

import { useState } from 'react';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Toggle from '@/components/ui/Toggle';
import { useTranslate } from '@/i18n';
import { ART_PROVIDERS } from '@/lib/photo-source';
import type { ArtProvider } from '@/types/config';
import { PickerEntry, PickerGroup, PickerSidebar } from './PickerSidebar';
import RemoteGrid, { PickerBar } from './RemoteGrid';
import SearchBox from './SearchBox';
import SetupHint from './SetupHint';
import { usePickerBrowse } from './usePickerBrowse';
import { importPicture } from './import-picture';
import type { PickerTabProps } from './types';

/** The museums search in English, so only the labels translate. */
export const ART_IDEAS = [
  { key: 'impressionism', query: 'Impressionism' },
  { key: 'dutch', query: 'Dutch Golden Age' },
  { key: 'landscapes', query: 'landscape' },
  { key: 'portraits', query: 'portrait' },
  { key: 'stillLife', query: 'still life' },
  { key: 'seascapes', query: 'seascape' },
  { key: 'louvre', query: 'Louvre' },
  { key: 'rijksmuseum', query: 'Rijksmuseum' },
  { key: 'vanGogh', query: 'Van Gogh' },
] as const;

export default function ArtTab({ selection, onSelect, copying }: PickerTabProps) {
  const t = useTranslate('editor');
  const [provider, setProvider] = useState<ArtProvider>('wikimedia');
  const [idea, setIdea] = useState<string | null>(ART_IDEAS[0].key);
  const [typed, setTyped] = useState('');
  const [familyFriendly, setFamilyFriendly] = useState(false);
  const query = idea ? ART_IDEAS.find((i) => i.key === idea)!.query : typed;
  const browse = usePickerBrowse({ kind: 'art', collection: provider, query, familyFriendly });

  return (
    <div className="flex flex-1 min-h-0">
      <PickerSidebar footer={t('photoSources.art.picker.orSearch')}>
        <div className="px-1 pt-1 pb-1">
          <LabeledSelect
            label={t('photoSources.art.provider')}
            value={provider}
            onChange={(next) => { setProvider(next); onSelect(null); }}
            options={ART_PROVIDERS.map((value) => ({ value, label: t(`photoSources.art.providers.${value}`) }))}
          />
        </div>
        <div className="px-1 pb-1" title={t('photoSources.art.familyFriendlyHint')}>
          <Toggle label={t('photoSources.art.familyFriendly')} checked={familyFriendly} onChange={(next) => { setFamilyFriendly(next); onSelect(null); }} />
        </div>
        <PickerGroup title={t('photoSources.picker.ideas')} />
        {ART_IDEAS.map((i) => (
          <PickerEntry
            key={i.key}
            label={t(`photoSources.art.picker.ideas.${i.key}`)}
            selected={idea === i.key}
            onClick={() => { setIdea(i.key); setTyped(''); onSelect(null); }}
            testId={`art-idea-${i.key}`}
          />
        ))}
      </PickerSidebar>
      <div className="flex flex-1 flex-col min-w-0">
        <PickerBar>
          <SearchBox
            value={typed}
            placeholder={t('photoSources.art.picker.searchPlaceholder')}
            onSearch={(words) => { setTyped(words); setIdea(null); onSelect(null); }}
          />
        </PickerBar>
        {browse.matched.length > 0 && (
          <p className="px-3 pt-2 text-[11px] text-hs-text-faint" data-testid="art-matched">
            {t('photoSources.art.picker.matched', {
              matches: browse.matched
                .map((m) => t('photoSources.art.picker.matchItem', { label: m.label, type: t(`photoSources.art.picker.matchTypes.${m.type}`) }))
                .join(', '),
            })}
          </p>
        )}
        <div className="flex-1 overflow-y-auto p-3">
          <RemoteGrid
            browse={browse}
            selectedKey={selection?.key ?? null}
            copying={copying}
            caption={(tile) => tile.credit?.name}
            onChoose={(tile) => onSelect(selection?.key === tile.ref ? null : {
              key: tile.ref,
              hint: t('photoSources.art.picker.creditHint', {
                credit: [tile.label, tile.credit?.name, tile.secondary].filter(Boolean).join(', '),
              }),
              resolve: () => importPicture('art', tile.ref),
            })}
            empty={t('photoSources.art.picker.empty')}
            failed={(
              <SetupHint
                text={(browse.failure?.body as { error?: string } | null)?.error === 'art-unavailable'
                  ? t('photoSources.art.picker.unavailable')
                  : t('photoSources.art.picker.loadFailed')}
                action={{ label: t('photoSources.picker.tryAgain'), onClick: browse.retry }}
              />
            )}
          />
        </div>
      </div>
    </div>
  );
}
