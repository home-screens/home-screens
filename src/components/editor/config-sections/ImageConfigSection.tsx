'use client';

import { useState, useRef } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Button from '@/components/ui/Button';
import ImageBrowserModal from '@/components/editor/ImageBrowserModal';
import { useTranslate } from '@/i18n';
import type { ModuleInstance } from '@/types/config';

export function ImageConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const OBJECT_FIT_OPTIONS = [
    { value: 'cover', label: t('common.objectFitCover') },
    { value: 'contain', label: t('common.objectFitContain') },
    { value: 'fill', label: t('common.objectFitFill') },
  ] as const;

  const { config: c, set } = useModuleConfig<{ src?: string; objectFit?: string; alt?: string }>(mod, screenId);
  const [tab, setTab] = useState<'url' | 'library'>(() => {
    // Default to library tab if src is a local serve URL
    const src = (c.src as string) || '';
    return src.startsWith('/api/backgrounds/serve') ? 'library' : 'url';
  });
  const [showBrowser, setShowBrowser] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleQuickUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await editorFetch('/api/backgrounds', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.path) {
        set({ src: data.path });
      } else {
        setUploadError(data.error || t('configSections.image.uploadFailed'));
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('configSections.image.uploadFailed'));
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      {/* Tab toggle */}
      <div>
        <span className="text-xs text-hs-text-muted">{t('configSections.image.imageSource')}</span>
        <div className="flex gap-1 bg-hs-card rounded-md p-0.5 mt-1">
          <button
            onClick={() => setTab('url')}
            className={`flex-1 text-xs py-1 rounded ${
              tab === 'url' ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-muted hover:text-hs-text-secondary'
            }`}
          >
            {t('configSections.image.tabUrl')}
          </button>
          <button
            onClick={() => setTab('library')}
            className={`flex-1 text-xs py-1 rounded ${
              tab === 'library' ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-muted hover:text-hs-text-secondary'
            }`}
          >
            {t('configSections.image.tabLibrary')}
          </button>
        </div>
      </div>

      {tab === 'url' ? (
        <LabeledInput
          label={t('configSections.image.imageUrl')}
          value={(c.src as string) || ''}
          onChange={(v) => set({ src: v })}
          placeholder="https://example.com/photo.jpg"
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => setShowBrowser(true)} className="flex-1">
              {t('configSections.image.browseLibrary')}
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleQuickUpload} className="hidden" />
            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex-1">
              {uploading ? t('configSections.image.uploading') : t('configSections.image.uploadImage')}
            </Button>
          </div>
          {uploadError && <p className="text-xs text-hs-danger">{uploadError}</p>}
        </div>
      )}

      {/* Preview */}
      {c.src && (
        <div>
          <span className="text-xs text-hs-text-muted">{t('configSections.image.preview')}</span>
          <div className="mt-1 rounded-md overflow-hidden border border-hs-border-strong">
            <img
              src={c.src as string}
              alt={(c.alt as string) || ''}
              className="w-full max-h-28 object-cover"
            />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <LabeledSelect
          label={t('common.objectFit')}
          value={((c.objectFit as string) || 'cover') as 'cover' | 'contain' | 'fill'}
          onChange={(v) => set({ objectFit: v })}
          options={OBJECT_FIT_OPTIONS}
          fieldClassName="flex-1"
        />
        <LabeledInput
          label={t('configSections.image.altText')}
          value={(c.alt as string) || ''}
          onChange={(v) => set({ alt: v })}
          fieldClassName="flex-1"
        />
      </div>

      {showBrowser && (
        <ImageBrowserModal
          mode="pick-image"
          onSelectImage={(url) => set({ src: url })}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </>
  );
}
