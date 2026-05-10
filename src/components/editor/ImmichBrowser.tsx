'use client';

import { useState, useEffect, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';

interface ImmichAlbum { id: string; name: string; assetCount: number }

interface Props {
  selectedScreenId: string;
  hasImmichKey: boolean;
}

export default function ImmichBrowser({ selectedScreenId, hasImmichKey }: Props) {
  const t = useTranslate('editor');
  const { updateScreen } = useEditorStore();
  const currentScreen = useEditorStore((s) => {
    if (!s.config) return undefined;
    return getActiveScreens(s.config, s.selectedDisplayId).find((sc) => sc.id === selectedScreenId);
  });
  const [albums, setAlbums] = useState<ImmichAlbum[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch albums on mount
  useEffect(() => {
    if (!hasImmichKey) return;
    editorFetch('/api/immich/albums').then(async (res) => {
      if (res.ok) setAlbums(await res.json());
    }).catch(() => {});
  }, [hasImmichKey]);

  // Fetch photos when album changes
  const fetchPhotos = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ count: '20' });
      if (selectedAlbum) params.set('albumId', selectedAlbum);
      const res = await editorFetch(`/api/immich/photos?${params}`);
      if (res.ok) {
        const urls: string[] = await res.json();
        setPhotos(urls);
      } else {
        setError(t('imageBrowsers.immich.errors.loadPhotos'));
      }
    } catch {
      setError(t('imageBrowsers.immich.errors.loadPhotos'));
    }
    setIsLoading(false);
  }, [selectedAlbum, t]);

  useEffect(() => {
    if (hasImmichKey) fetchPhotos();
  }, [hasImmichKey, fetchPhotos]);

  const handleUsePhoto = async (serveUrl: string) => {
    if (!selectedScreenId) return;
    setSaving(serveUrl);
    setError(null);
    try {
      // Fetch the image binary from the serve endpoint and upload it as a local background
      const imgRes = await editorFetch(serveUrl);
      if (!imgRes.ok) throw new Error(t('imageBrowsers.immich.errors.fetchImage'));
      const blob = await imgRes.blob();
      const assetId = new URL(serveUrl, 'http://localhost').searchParams.get('assetId') || 'photo';
      const ext = blob.type.includes('png') ? '.png' : blob.type.includes('webp') ? '.webp' : '.jpg';

      const formData = new FormData();
      formData.append('file', new File([blob], `immich-${assetId}${ext}`, { type: blob.type }));
      const uploadRes = await editorFetch('/api/backgrounds', { method: 'POST', body: formData });
      const data = await uploadRes.json();
      if (data.path) {
        const updates: Record<string, unknown> = { backgroundImage: data.path };
        if (currentScreen?.backgroundRotation?.enabled) {
          updates.backgroundRotation = { ...currentScreen.backgroundRotation, enabled: false };
        }
        updateScreen(selectedScreenId, updates);
      }
    } catch {
      setError(t('imageBrowsers.immich.errors.saveImage'));
    }
    setSaving(null);
  };

  if (!hasImmichKey) {
    return (
      <div className="text-xs text-hs-text-faint bg-hs-hover rounded-md p-3 space-y-2">
        <p>{t('imageBrowsers.immich.notConfiguredPrefix')} <strong>{t('imageBrowsers.immich.settingsWord')}</strong> {t('imageBrowsers.immich.notConfiguredSuffix')}</p>
        <p className="text-hs-text-faint">
          {t('imageBrowsers.immich.apiKeyHint')}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Album filter + refresh */}
      <div className="flex gap-1.5">
        <select
          value={selectedAlbum}
          onChange={(e) => setSelectedAlbum(e.target.value)}
          className="flex-1 rounded-md bg-hs-card border border-hs-border-strong text-xs text-hs-text-body px-2 py-1.5 focus:outline-none focus:border-hs-accent"
        >
          <option value="">{t('imageBrowsers.immich.allPhotos')}</option>
          {albums.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.assetCount})</option>
          ))}
        </select>
        <Button size="sm" onClick={fetchPhotos} disabled={isLoading}>
          {t('imageBrowsers.immich.refresh')}
        </Button>
      </div>

      {error && <p className="text-xs text-hs-danger">{error}</p>}

      {isLoading ? (
        <div className="text-xs text-hs-text-faint py-4 text-center">{t('common.loading')}</div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 max-h-[300px] overflow-y-auto">
          {photos.map((url) => {
            const thumbUrl = url.replace('size=preview', 'size=thumbnail');
            return (
              <button
                key={url}
                onClick={() => handleUsePhoto(url)}
                disabled={saving === url}
                className="group relative aspect-[9/16] rounded overflow-hidden border border-hs-border-strong hover:border-hs-accent transition-colors"
              >
                <img
                  src={thumbUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {saving === url && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <span className="text-xs text-white">{t('common.saving')}</span>
                  </div>
                )}
              </button>
            );
          })}
          {photos.length === 0 && !error && (
            <p className="col-span-2 text-xs text-hs-text-faint text-center py-4">{t('imageBrowsers.immich.noPhotos')}</p>
          )}
        </div>
      )}

      <p className="text-[9px] text-hs-text-faint text-center">
        {t('imageBrowsers.immich.attribution')}
      </p>
    </>
  );
}
