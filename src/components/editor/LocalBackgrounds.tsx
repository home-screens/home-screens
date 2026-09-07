'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorStore, getActiveScreens, getActiveDimensions } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import Button from '@/components/ui/Button';
import FullscreenThemePreview from '@/components/ui/FullscreenThemePreview';
import { themeTileClass } from '@/components/editor/settings/shared/FullscreenThemeTile';
import { useTranslate, tOrFallback } from '@/i18n';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import {
  starterBackgroundsIn,
  type StarterBackground,
  type StarterBackgroundGroup,
} from '@/lib/starter-backgrounds';
import { logger } from '@/lib/logger';

const log = logger('backgrounds');

interface Props {
  selectedScreenId: string;
}

const GROUP_STORAGE_PREFIX = 'hs-background-group-';

function readGroupOpen(id: string): boolean {
  try {
    return localStorage.getItem(GROUP_STORAGE_PREFIX + id) !== 'closed';
  } catch {
    return true;
  }
}

/** One collapsible heading in the shipped set. Open by default; the choice sticks per browser. */
function StarterGroup({ id, title, count, children }: { id: StarterBackgroundGroup; title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  useEffect(() => { setOpen(readGroupOpen(id)); }, [id]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(GROUP_STORAGE_PREFIX + id, next ? 'open' : 'closed'); } catch { /* private mode */ }
  };
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        data-testid={`starter-group-${id}`}
        className="flex w-full items-center gap-1 py-1 text-[10px] text-hs-text-faint hover:text-hs-text-muted"
      >
        <Chevron size={11} />
        <span>{title}</span>
        <span className="ml-auto">{count}</span>
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
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
        log.debug('Failed to fetch backgrounds:', err);
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
      log.debug('Failed to delete background:', err);
    }
    setDeleting(null);
  };

  if (!currentScreen || !config) return null;

  // Picking any background turns rotation off: a rotating screen would paint
  // over the choice within the hour, which reads as "it didn't save".
  const pick = (backgroundImage: string) => {
    const updates: Record<string, unknown> = { backgroundImage };
    if (currentScreen?.backgroundRotation?.enabled) {
      updates.backgroundRotation = { ...currentScreen.backgroundRotation, enabled: false };
    }
    updateScreen(selectedScreenId, updates);
  };

  // Tiles follow the selected display's orientation, so a landscape wall's
  // thumbnails are landscape too.
  const dims = getActiveDimensions(config, selectedDisplayId);
  const landscape = dims.width > dims.height;
  const tileAspect = landscape ? 'aspect-video' : 'aspect-[9/16]';
  const tileGrid = landscape ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-4 gap-1.5';
  const isCurrent = (path: string) => currentScreen.backgroundImage === path;
  const tileBorder = (path: string) => (isCurrent(path) ? 'border-hs-accent ring-1 ring-hs-accent' : 'border-hs-border-strong');

  // The theme the selected display paints its fullscreen modules with: its
  // own override first, then the shared default, then the shipped default.
  const display = selectedDisplayId ? config.displays?.find((d) => d.id === selectedDisplayId) : undefined;
  const themeInUse = display?.settings?.fullscreenTheme ?? config.settings.fullscreenTheme ?? 'linen';
  const themeWalls = starterBackgroundsIn('theme');
  const orderedThemeWalls = [
    ...themeWalls.filter((bg) => bg.themeId === themeInUse),
    ...themeWalls.filter((bg) => bg.themeId !== themeInUse),
  ];
  const colorWalls = starterBackgroundsIn('color');
  const patternWalls = starterBackgroundsIn('pattern');

  const wallTile = (bg: StarterBackground) => {
    const name = t(`backgroundPicker.starters.${bg.id}`);
    return (
      <div key={bg.id}>
        <button
          onClick={() => pick(bg.path)}
          title={name}
          data-testid={`starter-background-${bg.id}`}
          className={`block w-full overflow-hidden rounded border ${tileAspect} ${tileBorder(bg.path)}`}
        >
          {/* The thumbnail is the wall's own file, so it cannot drift from what the display paints. */}
          <img src={bg.path} alt="" className="h-full w-full object-cover" />
        </button>
        <div className={`mt-0.5 truncate text-center text-[9px] leading-tight ${isCurrent(bg.path) ? 'text-hs-accent-hover' : 'text-hs-text-muted'}`}>
          {name}
        </div>
      </div>
    );
  };

  return (
    <>
      <p className="text-[10px] text-hs-text-faint">{t('backgroundPicker.starterHeading')}</p>

      <StarterGroup id="theme" title={t('backgroundPicker.groups.theme')} count={themeWalls.length}>
        <div className="grid grid-cols-2 gap-1.5">
          {orderedThemeWalls.map((bg) => {
            const theme = FULLSCREEN_THEMES.find((th) => th.id === bg.themeId);
            if (!theme) return null;
            const selected = isCurrent(bg.path);
            const inUse = theme.id === themeInUse;
            const group = tOrFallback(t, `settings.defaultDisplayPage.themeGroups.${theme.group}`, theme.group);
            return (
              <button
                key={bg.id}
                type="button"
                aria-pressed={selected}
                onClick={() => pick(bg.path)}
                data-testid={`starter-background-${bg.id}`}
                data-in-use={inUse ? 'true' : undefined}
                className={`flex items-center gap-1.5 rounded-lg border px-1.5 py-1.5 text-left transition-colors ${themeTileClass(selected)}`}
              >
                <FullscreenThemePreview tokens={theme.tokens} size="sm" />
                <div className="min-w-0">
                  <div className={`truncate text-[10px] font-semibold ${selected ? 'text-hs-accent-hover' : 'text-hs-text-body'}`}>{theme.name}</div>
                  <div className="truncate text-[9px] text-hs-text-faint">
                    <span className="capitalize">{group}</span>
                    {inUse && <span> · {t('backgroundPicker.inUse')}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </StarterGroup>

      <StarterGroup id="color" title={t('backgroundPicker.groups.color')} count={colorWalls.length}>
        <div className={tileGrid}>
          <div>
            <button
              onClick={() => updateScreen(selectedScreenId, { backgroundImage: '' })}
              data-testid="starter-background-none"
              className={`block w-full rounded border text-[10px] text-hs-text-faint ${tileAspect} ${
                !currentScreen.backgroundImage ? 'border-hs-accent ring-1 ring-hs-accent' : 'border-hs-border-strong'
              }`}
            >
              {t('settings.localBackgrounds.none')}
            </button>
            <div className="mt-0.5 text-[9px] leading-tight">&nbsp;</div>
          </div>
          {colorWalls.map(wallTile)}
        </div>
      </StarterGroup>

      <StarterGroup id="pattern" title={t('backgroundPicker.groups.pattern')} count={patternWalls.length}>
        <div className={tileGrid}>{patternWalls.map(wallTile)}</div>
      </StarterGroup>

      <p className="mt-3 text-[10px] text-hs-text-faint">{t('backgroundPicker.yourPicturesHeading')}</p>
      <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
        {localBackgrounds.map((bg) => (
          <div key={bg} className="relative group">
            <button
              onClick={() => pick(bg)}
              className={`${tileAspect} w-full rounded border overflow-hidden ${
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
