'use client';

import { useState, useRef } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import Button from '@/components/ui/Button';
import ImageBrowserModal from '@/components/editor/ImageBrowserModal';
import type { ModuleInstance } from '@/types/config';

export function ImageConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
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
        setUploadError(data.error || 'Upload failed');
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      {/* Tab toggle */}
      <div>
        <span className="text-xs text-hs-text-muted">Image Source</span>
        <div className="flex gap-1 bg-hs-card rounded-md p-0.5 mt-1">
          <button
            onClick={() => setTab('url')}
            className={`flex-1 text-xs py-1 rounded ${
              tab === 'url' ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-muted hover:text-hs-text-secondary'
            }`}
          >
            URL
          </button>
          <button
            onClick={() => setTab('library')}
            className={`flex-1 text-xs py-1 rounded ${
              tab === 'library' ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-muted hover:text-hs-text-secondary'
            }`}
          >
            Library
          </button>
        </div>
      </div>

      {tab === 'url' ? (
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-hs-text-muted">Image URL</span>
          <input
            type="text"
            value={(c.src as string) || ''}
            onChange={(e) => set({ src: e.target.value })}
            className={INPUT_CLASS}
            placeholder="https://example.com/photo.jpg"
          />
        </label>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => setShowBrowser(true)} className="flex-1">
              Browse Library...
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleQuickUpload} className="hidden" />
            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex-1">
              {uploading ? 'Uploading...' : 'Upload Image'}
            </Button>
          </div>
          {uploadError && <p className="text-xs text-hs-danger">{uploadError}</p>}
        </div>
      )}

      {/* Preview */}
      {c.src && (
        <div>
          <span className="text-xs text-hs-text-muted">Preview</span>
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
        <label className="flex flex-col gap-0.5 flex-1">
          <span className="text-xs text-hs-text-muted">Object Fit</span>
          <select
            value={(c.objectFit as string) || 'cover'}
            onChange={(e) => set({ objectFit: e.target.value })}
            className={INPUT_CLASS}
          >
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
            <option value="fill">Fill</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5 flex-1">
          <span className="text-xs text-hs-text-muted">Alt Text</span>
          <input
            type="text"
            value={(c.alt as string) || ''}
            onChange={(e) => set({ alt: e.target.value })}
            className={INPUT_CLASS}
          />
        </label>
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
