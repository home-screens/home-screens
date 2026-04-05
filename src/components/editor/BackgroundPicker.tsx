'use client';

import { useState, useEffect, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorStore } from '@/stores/editor-store';
import type { BackgroundRotation } from '@/types/config';
import LocalBackgrounds from './LocalBackgrounds';
import UnsplashBrowser from './UnsplashBrowser';
import NasaBrowser from './NasaBrowser';
import ImmichBrowser from './ImmichBrowser';

interface ImmichAlbumOption { id: string; name: string; assetCount: number }
interface ImmichPersonOption { id: string; name: string }

function ImmichRotationFields({ rotation, onChange }: {
  rotation: BackgroundRotation;
  onChange: (updates: Partial<BackgroundRotation>) => void;
}) {
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

  const selectClass = 'mt-0.5 block w-full rounded bg-neutral-800 border border-neutral-700 text-xs text-neutral-200 px-2 py-1 focus:outline-none focus:border-blue-500';

  return (
    <>
      <label className="block">
        <span className="text-[10px] text-neutral-500">Album</span>
        <select
          value={rotation.immichAlbumId || ''}
          onChange={(e) => onChange({ immichAlbumId: e.target.value || undefined, immichPersonId: undefined })}
          className={selectClass}
        >
          <option value="">Any album</option>
          {albums.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.assetCount})</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-[10px] text-neutral-500">Person</span>
        <select
          value={rotation.immichPersonId || ''}
          onChange={(e) => onChange({ immichPersonId: e.target.value || undefined, immichAlbumId: undefined })}
          className={selectClass}
        >
          <option value="">Anyone</option>
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
          className="rounded border-neutral-600"
        />
        <span className="text-[10px] text-neutral-500">Favorites only</span>
      </label>
    </>
  );
}

export default function BackgroundPicker() {
  const [tab, setTab] = useState<'unsplash' | 'nasa' | 'immich' | 'local'>('unsplash');
  const { config, selectedScreenId, updateScreen } = useEditorStore();
  const [hasUnsplashKey, setHasUnsplashKey] = useState(false);
  const [hasNasaKey, setHasNasaKey] = useState(false);
  const [hasImmichKey, setHasImmichKey] = useState(false);

  const currentScreen = config?.screens.find((s) => s.id === selectedScreenId);
  const rotationSource = currentScreen?.backgroundRotation?.source || 'unsplash';

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
        console.debug('Failed to check API key status:', err);
      }
    }
    checkKeys();
  }, []);

  if (!currentScreen || !selectedScreenId) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-neutral-500 uppercase">Background</h4>

      {/* Auto-rotation controls — only show when at least one source is available */}
      {(hasUnsplashKey || hasNasaKey || hasImmichKey) && <div className="bg-neutral-800/50 rounded-md p-2.5 space-y-2">
        <label className="flex items-center justify-between gap-2 cursor-pointer">
          <span className="text-xs text-neutral-400">Auto-rotate background</span>
          <button
            type="button"
            role="switch"
            aria-checked={currentScreen?.backgroundRotation?.enabled ?? false}
            onClick={() => {
              if (!selectedScreenId) return;
              const current = currentScreen?.backgroundRotation;
              const updated: BackgroundRotation = {
                enabled: !current?.enabled,
                source: current?.source || (hasUnsplashKey ? 'unsplash' : hasNasaKey ? 'nasa-apod' : 'immich'),
                query: current?.query || 'nature landscape',
                intervalMinutes: current?.intervalMinutes || 60,
              };
              updateScreen(selectedScreenId, { backgroundRotation: updated });
            }}
            className={`relative w-9 h-5 rounded-full transition-colors ${
              currentScreen?.backgroundRotation?.enabled ? 'bg-blue-600' : 'bg-neutral-600'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                currentScreen?.backgroundRotation?.enabled ? 'translate-x-4' : ''
              }`}
            />
          </button>
        </label>
        {currentScreen?.backgroundRotation?.enabled && (
          <div className="space-y-2">
            <label className="block">
              <span className="text-[10px] text-neutral-500">Source</span>
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
                className="mt-0.5 block w-full rounded bg-neutral-800 border border-neutral-700 text-xs text-neutral-200 px-2 py-1 focus:outline-none focus:border-blue-500"
              >
                {hasUnsplashKey && <option value="unsplash">Unsplash</option>}
                {hasNasaKey && <option value="nasa-apod">NASA Picture of the Day</option>}
                {hasImmichKey && <option value="immich">Immich</option>}
              </select>
            </label>
            {rotationSource === 'unsplash' && (
              <label className="block">
                <span className="text-[10px] text-neutral-500">Search query</span>
                <input
                  type="text"
                  value={currentScreen.backgroundRotation!.query}
                  onChange={(e) => {
                    if (!selectedScreenId) return;
                    updateScreen(selectedScreenId, {
                      backgroundRotation: { ...currentScreen.backgroundRotation!, query: e.target.value },
                    });
                  }}
                  placeholder="nature landscape"
                  className="mt-0.5 block w-full rounded bg-neutral-800 border border-neutral-700 text-xs text-neutral-200 px-2 py-1 focus:outline-none focus:border-blue-500"
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
              <span className="text-[10px] text-neutral-500">Rotate every</span>
              <select
                value={currentScreen.backgroundRotation!.intervalMinutes}
                onChange={(e) => {
                  if (!selectedScreenId) return;
                  updateScreen(selectedScreenId, {
                    backgroundRotation: { ...currentScreen.backgroundRotation!, intervalMinutes: Number(e.target.value) },
                  });
                }}
                className="mt-0.5 block w-full rounded bg-neutral-800 border border-neutral-700 text-xs text-neutral-200 px-2 py-1 focus:outline-none focus:border-blue-500"
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={120}>2 hours</option>
                <option value={240}>4 hours</option>
                <option value={480}>8 hours</option>
              </select>
            </label>
            {rotationSource === 'nasa-apod' && (
              <p className="text-[10px] text-neutral-500">
                NASA publishes one new astronomy image per day. The display will check for updates at the chosen interval.
              </p>
            )}
          </div>
        )}
      </div>}

      <div className="flex gap-1 bg-neutral-800 rounded-md p-0.5">
        <button
          onClick={() => setTab('unsplash')}
          className={`flex-1 text-xs py-1.5 rounded ${
            tab === 'unsplash' ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-400 hover:text-neutral-300'
          }`}
        >
          Unsplash
        </button>
        <button
          onClick={() => setTab('nasa')}
          className={`flex-1 text-xs py-1.5 rounded ${
            tab === 'nasa' ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-400 hover:text-neutral-300'
          }`}
        >
          NASA
        </button>
        {hasImmichKey && (
          <button
            onClick={() => setTab('immich')}
            className={`flex-1 text-xs py-1.5 rounded ${
              tab === 'immich' ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-400 hover:text-neutral-300'
            }`}
          >
            Immich
          </button>
        )}
        <button
          onClick={() => setTab('local')}
          className={`flex-1 text-xs py-1.5 rounded ${
            tab === 'local' ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-400 hover:text-neutral-300'
          }`}
        >
          Local
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
    </div>
  );
}
