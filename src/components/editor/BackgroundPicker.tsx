'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import type { BackgroundRotation } from '@/types/config';
import LocalBackgrounds from './LocalBackgrounds';
import UnsplashBrowser from './UnsplashBrowser';
import NasaBrowser from './NasaBrowser';
import ImmichBrowser from './ImmichBrowser';
import AccordionSection from './AccordionSection';
import PropertyGroup from './PropertyGroup';
import Toggle from '@/components/ui/Toggle';
import { useTranslate } from '@/i18n';
import { logger } from '@/lib/logger';

const log = logger('background-picker');

interface ImmichAlbumOption { id: string; name: string; assetCount: number }
interface ImmichPersonOption { id: string; name: string }

function ImmichRotationFields({ rotation, onChange }: {
  rotation: BackgroundRotation;
  onChange: (updates: Partial<BackgroundRotation>) => void;
}) {
  const t = useTranslate('editor');
  const [albums, setAlbums] = useState<ImmichAlbumOption[]>([]);
  const [people, setPeople] = useState<ImmichPersonOption[]>([]);

  const fetchOptions = useCallback(async () => {
    const [albumRes, peopleRes] = await Promise.all([
      editorFetch('/api/immich/albums').catch(() => null),
      editorFetch('/api/immich/people').catch(() => null),
    ]);
    if (albumRes?.ok) setAlbums(await albumRes.json());
    if (peopleRes?.ok) setPeople(await peopleRes.json());
  }, []);

  useEffect(() => { fetchOptions(); }, [fetchOptions]);

  const selectClass = 'mt-0.5 block w-full rounded bg-hs-card border border-hs-border-strong text-xs text-hs-text-body px-2 py-1 focus:outline-none focus:border-hs-accent';

  return (
    <>
      <label className="block">
        <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.immich.albumLabel')}</span>
        <select
          value={rotation.immichAlbumId || ''}
          onChange={(e) => onChange({ immichAlbumId: e.target.value || undefined, immichPersonId: undefined })}
          className={selectClass}
        >
          <option value="">{t('backgroundPicker.immich.anyAlbum')}</option>
          {albums.map((a) => (
            <option key={a.id} value={a.id}>
              {t('backgroundPicker.immich.albumOption', { name: a.name, count: a.assetCount })}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.immich.personLabel')}</span>
        <select
          value={rotation.immichPersonId || ''}
          onChange={(e) => onChange({ immichPersonId: e.target.value || undefined, immichAlbumId: undefined })}
          className={selectClass}
        >
          <option value="">{t('backgroundPicker.immich.anyone')}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={rotation.immichFavoritesOnly || false}
          onChange={(e) => onChange({ immichFavoritesOnly: e.target.checked || undefined })}
          className="rounded border-hs-border-strong"
        />
        <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.immich.favoritesOnly')}</span>
      </label>
    </>
  );
}

export default function BackgroundPicker() {
  const t = useTranslate('editor');
  const [tab, setTab] = useState<'unsplash' | 'nasa' | 'immich' | 'local'>('unsplash');
  const { config, selectedDisplayId, selectedScreenId, updateScreen } = useEditorStore();
  const [hasUnsplashKey, setHasUnsplashKey] = useState(false);
  const [hasNasaKey, setHasNasaKey] = useState(false);
  const [hasImmichKey, setHasImmichKey] = useState(false);

  const activeScreens = config ? getActiveScreens(config, selectedDisplayId) : [];
  const currentScreen = activeScreens.find((s) => s.id === selectedScreenId);
  const rotationSource = currentScreen?.backgroundRotation?.source || 'unsplash';

  // Interval options. Re-built per locale (cheap; rebuilds only when `t`
  // identity changes). Labels run through `t()` so de-DE renders idiomatic
  // German plurals; the numeric `value` is the underlying minutes count.
  const intervalOptions = useMemo<{ value: number; label: string }[]>(
    () => [
      { value: 15, label: t('backgroundPicker.intervals.minutes', { count: 15 }) },
      { value: 30, label: t('backgroundPicker.intervals.minutes', { count: 30 }) },
      { value: 60, label: t('backgroundPicker.intervals.hourSingular') },
      { value: 120, label: t('backgroundPicker.intervals.hours', { count: 2 }) },
      { value: 240, label: t('backgroundPicker.intervals.hours', { count: 4 }) },
      { value: 480, label: t('backgroundPicker.intervals.hours', { count: 8 }) },
    ],
    [t],
  );

  useEffect(() => {
    async function checkKeys() {
      try {
        const res = await editorFetch('/api/secrets');
        if (res.ok) {
          const data: Record<string, boolean> = await res.json();
          setHasUnsplashKey(!!data.unsplash_access_key);
          setHasNasaKey(!!data.nasa_api_key);
          setHasImmichKey(!!data.immich_api_key && !!data.immich_url);
        }
      } catch (err) {
        log.debug('Failed to check API key status:', err);
      }
    }
    checkKeys();
  }, []);

  if (!currentScreen || !selectedScreenId) return null;

  const rotationEnabled = currentScreen?.backgroundRotation?.enabled ?? false;
  const anySourceAvailable = hasUnsplashKey || hasNasaKey || hasImmichKey;

  const setRotationEnabled = (enabled: boolean) => {
    if (!selectedScreenId) return;
    const current = currentScreen?.backgroundRotation;
    const updated: BackgroundRotation = {
      enabled,
      source: current?.source || (hasUnsplashKey ? 'unsplash' : hasNasaKey ? 'nasa-apod' : 'immich'),
      query: current?.query || 'nature landscape',
      intervalMinutes: current?.intervalMinutes || 60,
    };
    updateScreen(selectedScreenId, { backgroundRotation: updated });
  };

  const rotationFieldClass = 'mt-0.5 block w-full rounded bg-hs-card border border-hs-border-strong text-xs text-hs-text-body px-2 py-1 focus:outline-none focus:border-hs-accent';

  return (
    <AccordionSection title={t('backgroundPicker.title')}>
      {anySourceAvailable && (
        <>
          <PropertyGroup title={t('backgroundPicker.statusGroup')} accent={1}>
            <Toggle
              label={t('backgroundPicker.autoRotate')}
              checked={rotationEnabled}
              onChange={setRotationEnabled}
            />
          </PropertyGroup>
          {rotationEnabled && (
            <PropertyGroup title={t('fields.rotation')} accent={2}>
              <div className="space-y-2">
                <label className="block">
                  <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.sourceLabel')}</span>
                  <select
                    value={rotationSource}
                    onChange={(e) => {
                      if (!selectedScreenId) return;
                      const source = e.target.value as BackgroundRotation['source'];
                      updateScreen(selectedScreenId, {
                        backgroundRotation: {
                          ...currentScreen.backgroundRotation!,
                          source,
                          query: source === 'nasa-apod' || source === 'immich' ? '' : (currentScreen.backgroundRotation!.query || 'nature landscape'),
                          intervalMinutes: source === 'nasa-apod' ? 240 : (currentScreen.backgroundRotation!.intervalMinutes || 60),
                        },
                      });
                    }}
                    className={rotationFieldClass}
                  >
                    {hasUnsplashKey && <option value="unsplash">Unsplash</option>}
                    {hasNasaKey && <option value="nasa-apod">{t('backgroundPicker.sources.nasaApod')}</option>}
                    {hasImmichKey && <option value="immich">Immich</option>}
                  </select>
                </label>
                {rotationSource === 'unsplash' && (
                  <label className="block">
                    <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.searchQueryLabel')}</span>
                    <input
                      type="text"
                      value={currentScreen.backgroundRotation!.query}
                      onChange={(e) => {
                        if (!selectedScreenId) return;
                        updateScreen(selectedScreenId, {
                          backgroundRotation: { ...currentScreen.backgroundRotation!, query: e.target.value },
                        });
                      }}
                      placeholder={t('backgroundPicker.searchQueryPlaceholder')}
                      className={rotationFieldClass}
                    />
                  </label>
                )}
                {rotationSource === 'immich' && (
                  <ImmichRotationFields
                    rotation={currentScreen.backgroundRotation!}
                    onChange={(updates) => {
                      if (!selectedScreenId) return;
                      updateScreen(selectedScreenId, {
                        backgroundRotation: { ...currentScreen.backgroundRotation!, ...updates },
                      });
                    }}
                  />
                )}
                <label className="block">
                  <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.rotateEveryLabel')}</span>
                  <select
                    value={currentScreen.backgroundRotation!.intervalMinutes}
                    onChange={(e) => {
                      if (!selectedScreenId) return;
                      updateScreen(selectedScreenId, {
                        backgroundRotation: { ...currentScreen.backgroundRotation!, intervalMinutes: Number(e.target.value) },
                      });
                    }}
                    className={rotationFieldClass}
                  >
                    {intervalOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                {rotationSource === 'nasa-apod' && (
                  <p className="text-[10px] text-hs-text-faint">
                    {t('backgroundPicker.nasaInfo')}
                  </p>
                )}
              </div>
            </PropertyGroup>
          )}
        </>
      )}

      <div className="flex gap-1 bg-hs-card rounded-md p-0.5">
        <button
          onClick={() => setTab('unsplash')}
          className={`flex-1 text-xs py-1.5 rounded ${
            tab === 'unsplash' ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-muted hover:text-hs-text-secondary'
          }`}
        >
          Unsplash
        </button>
        <button
          onClick={() => setTab('nasa')}
          className={`flex-1 text-xs py-1.5 rounded ${
            tab === 'nasa' ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-muted hover:text-hs-text-secondary'
          }`}
        >
          {t('backgroundPicker.tabs.nasa')}
        </button>
        {hasImmichKey && (
          <button
            onClick={() => setTab('immich')}
            className={`flex-1 text-xs py-1.5 rounded ${
              tab === 'immich' ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-muted hover:text-hs-text-secondary'
            }`}
          >
            Immich
          </button>
        )}
        <button
          onClick={() => setTab('local')}
          className={`flex-1 text-xs py-1.5 rounded ${
            tab === 'local' ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-muted hover:text-hs-text-secondary'
          }`}
        >
          {t('backgroundPicker.tabs.local')}
        </button>
      </div>

      {tab === 'unsplash' && (
        <UnsplashBrowser selectedScreenId={selectedScreenId} hasUnsplashKey={hasUnsplashKey} />
      )}

      {tab === 'nasa' && (
        <NasaBrowser selectedScreenId={selectedScreenId} hasNasaKey={hasNasaKey} />
      )}

      {tab === 'immich' && (
        <ImmichBrowser selectedScreenId={selectedScreenId} hasImmichKey={hasImmichKey} />
      )}

      {tab === 'local' && (
        <LocalBackgrounds selectedScreenId={selectedScreenId} />
      )}
    </AccordionSection>
  );
}
