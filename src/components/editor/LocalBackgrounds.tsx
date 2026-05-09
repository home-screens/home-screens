'use client';

import { useState, useEffect, useRef } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';

interface Props {
  selectedScreenId: string;
}

export default function LocalBackgrounds({ selectedScreenId }: Props) {
  const t = useTranslate('editor');
  const [localBackgrounds, setLocalBackgrounds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { config, selectedDisplayId, updateScreen } = useEditorStore();

  const activeScreens = config ? getActiveScreens(config, selectedDisplayId) : [];
  const currentScreen = activeScreens.find((s) => s.id === selectedScreenId);

  useEffect(() => {
    async function fetchBackgrounds() {
      try {
        const res = await editorFetch('/api/backgrounds');
        const data = await res.json();
        if (Array.isArray(data)) setLocalBackgrounds(data);
      } catch (err) {
        console.debug('Failed to fetch backgrounds:', err);
      }
    }
    fetchBackgrounds();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await editorFetch('/api/backgrounds', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(
          data.error ?? t('settings.localBackgrounds.uploadFailedWithStatus', { status: res.status }),
        );
      } else if (data.path) {
        setLocalBackgrounds((prev) => prev.includes(data.path) ? prev : [...prev, data.path]);
        const updates: Record<string, unknown> = { backgroundImage: data.path };
        if (currentScreen?.backgroundRotation?.enabled) {
          updates.backgroundRotation = { ...currentScreen.backgroundRotation, enabled: false };
        }
        updateScreen(selectedScreenId, updates);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('settings.localBackgrounds.uploadFailed'));
    }
    setIsLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filenameFromPath = (bg: string) => {
    const url = new URL(bg, 'http://localhost');
    return url.searchParams.get('file') || bg.split('/').pop() || bg;
  };

  const handleDelete = async (bg: string) => {
    const filename = filenameFromPath(bg);
    const confirmed = await useConfirmStore.getState().confirm({
      title: t('settings.localBackgrounds.deleteTitle'),
      message: t('settings.localBackgrounds.deleteMessage', { filename }),
      confirmLabel: t('settings.localBackgrounds.deleteConfirmLabel'),
      variant: 'danger',
    });
    if (!confirmed) return;
    setDeleting(bg);
    try {
      const res = await editorFetch('/api/backgrounds', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: filename }),
      });
      if (res.ok) {
        setLocalBackgrounds((prev) => prev.filter((b) => b !== bg));
        if (currentScreen?.backgroundImage === bg) {
          updateScreen(selectedScreenId, { backgroundImage: '' });
        }
      }
    } catch (err) {
      console.debug('Failed to delete background:', err);
    }
    setDeleting(null);
  };

  if (!currentScreen) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
        <button
          onClick={() => updateScreen(selectedScreenId, { backgroundImage: '' })}
          className={`aspect-[9/16] rounded border text-xs text-hs-text-faint ${
            !currentScreen.backgroundImage ? 'border-hs-accent' : 'border-hs-border-strong'
          }`}
        >
          {t('settings.localBackgrounds.none')}
        </button>
        {localBackgrounds.map((bg) => (
          <div key={bg} className="relative group">
            <button
              onClick={() => {
                const updates: Record<string, unknown> = { backgroundImage: bg };
                if (currentScreen?.backgroundRotation?.enabled) {
                  updates.backgroundRotation = { ...currentScreen.backgroundRotation, enabled: false };
                }
                updateScreen(selectedScreenId, updates);
              }}
              className={`aspect-[9/16] w-full rounded border overflow-hidden ${
                currentScreen.backgroundImage === bg ? 'border-hs-accent' : 'border-hs-border-strong'
              }`}
            >
              <img src={bg} alt="" className="w-full h-full object-cover" />
            </button>
            <button
              onClick={() => handleDelete(bg)}
              disabled={deleting === bg}
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-hs-text-secondary hover:bg-hs-danger hover:text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              title={t('settings.localBackgrounds.deleteAriaLabel')}
            >
              {deleting === bg ? '...' : '×'}
            </button>
          </div>
        ))}
      </div>
      {uploadError && (
        <p className="text-xs text-hs-danger">{uploadError}</p>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
      <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={isLoading} className="w-full">
        {isLoading ? t('settings.localBackgrounds.uploadingButton') : t('settings.localBackgrounds.uploadButton')}
      </Button>
    </>
  );
}
