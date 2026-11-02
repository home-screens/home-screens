'use client';

import { useState, useEffect, useMemo } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorStore, getActiveScreens, getActiveDimensions } from '@/stores/editor-store';
import type { BackgroundRotation, BackgroundShade, PhotoSource } from '@/types/config';
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import Button from '@/components/ui/Button';
import AccordionSection from './AccordionSection';
import PropertyGroup from './PropertyGroup';
import Toggle from '@/components/ui/Toggle';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useTranslate } from '@/i18n';
import { libraryFileFromServeUrl } from '@/lib/library-client';
import { pictureDisplayName, tileThumbnailUrl } from '@/lib/media-paths';
import { isReady, normalizePhotoSource } from '@/lib/photo-source';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { STARTER_BACKGROUNDS } from '@/lib/starter-backgrounds';
import PicturePicker from './picture-picker/PicturePicker';
import { isBuiltInPicture } from './picture-picker/BuiltInTab';
import PhotoSourceFields from './photo-source/PhotoSourceFields';

const FIELD_CLASS = 'mt-0.5 block w-full rounded bg-hs-card border border-hs-border-strong text-xs text-hs-text-body px-2 py-1 focus:outline-none focus:border-hs-accent';

/**
 * A screen's background: one picture chosen in the Image Library (the same
 * window every single-picture spot opens, with the backgrounds that ship
 * with Home Screens as its first tab), or a rotating background whose
 * pictures come from the shared photo source block. Then the shade drawn
 * over it.
 */
export default function BackgroundPicker() {
  const t = useTranslate('editor');
  const { config, selectedDisplayId, selectedScreenId, updateScreen, pickScreenBackground } = useEditorStore();
  const { status: secretStatus, hasStatus: secretsKnown, error: secretsFailed } = useSecretStatus();
  const [picking, setPicking] = useState(false);

  const activeScreens = config ? getActiveScreens(config, selectedDisplayId) : [];
  const currentScreen = activeScreens.find((s) => s.id === selectedScreenId);
  const dims = config ? getActiveDimensions(config, selectedDisplayId) : null;
  const orientation = dims && dims.width > dims.height ? 'landscape' : 'portrait';

  // Interval options. Labels run through `t()` so every locale gets its own
  // plurals; the numeric `value` is the underlying minutes count.
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

  // Is the screen's own background file still on the hub? Checked when the
  // panel opens and whenever the path changes (one HEAD request). Only local
  // paths: a remote URL can't be checked from here without CORS trouble, and
  // a network hiccup is not a missing file, so errors are not flagged.
  const backgroundPath = currentScreen?.backgroundImage ?? '';
  const [missingPath, setMissingPath] = useState<string | null>(null);
  useEffect(() => {
    if (!backgroundPath || !backgroundPath.startsWith('/')) {
      setMissingPath(null);
      return;
    }
    let cancelled = false;
    editorFetch(backgroundPath, { method: 'HEAD' })
      .then((res) => { if (!cancelled) setMissingPath(res.ok ? null : backgroundPath); })
      .catch(() => { if (!cancelled) setMissingPath(null); });
    return () => { cancelled = true; };
  }, [backgroundPath]);

  if (!currentScreen || !selectedScreenId) return null;

  const rotation = currentScreen.backgroundRotation;
  const rotationEnabled = rotation?.enabled ?? false;

  const setRotationEnabled = (enabled: boolean) => {
    const fallback: PhotoSource = isReady('unsplash', secretStatus)
      ? { kind: 'unsplash', query: 'nature landscape' }
      : { kind: 'library', folder: '' };
    const updated: BackgroundRotation = {
      enabled,
      intervalMinutes: rotation?.intervalMinutes || 60,
      photoSource: normalizePhotoSource(rotation?.photoSource) ?? fallback,
    };
    updateScreen(selectedScreenId, { backgroundRotation: updated });
  };

  const updateRotation = (updates: Partial<BackgroundRotation>) => {
    if (!rotation) return;
    updateScreen(selectedScreenId, { backgroundRotation: { ...rotation, ...updates } });
  };

  const shade = currentScreen.shade;
  const shadeEnabled = shade?.enabled ?? false;
  const setShadeEnabled = (enabled: boolean) => {
    const updated: BackgroundShade = {
      enabled,
      style: shade?.style || 'topBottom',
      strength: shade?.strength ?? 40,
      color: shade?.color || '#000000',
    };
    updateScreen(selectedScreenId, { shade: updated });
  };
  const updateShade = (updates: Partial<BackgroundShade>) => {
    if (!shade) return;
    updateScreen(selectedScreenId, { shade: { ...shade, ...updates } });
  };

  return (
    <AccordionSection title={t('backgroundPicker.title')}>
      <PropertyGroup title={t('photoSources.background.pictureGroup')} accent={1}>
        <PictureField
          value={currentScreen.backgroundImage}
          orientation={orientation}
          rotating={rotationEnabled}
          onChoose={() => setPicking(true)}
          onNone={() => updateScreen(selectedScreenId, { backgroundImage: '' })}
        />
      </PropertyGroup>

      {missingPath && (
        <div className="rounded-md border border-hs-danger/40 bg-hs-danger/10 px-2.5 py-2 space-y-1.5" data-testid="background-missing">
          <div className="text-[10px] text-hs-text-faint">{t('backgroundPicker.missing.label')}</div>
          <div className="font-mono text-[11px] text-hs-text-body break-all">{missingPath}</div>
          <p className="text-[11px] text-hs-danger flex gap-1.5">
            <span aria-hidden="true">⚠</span>
            <span>{t('backgroundPicker.missing.note')}</span>
          </p>
          <div className="flex gap-2 pt-0.5">
            <Button size="sm" onClick={() => setPicking(true)}>{t('backgroundPicker.missing.pickAnother')}</Button>
            <Button size="sm" onClick={() => updateScreen(selectedScreenId, { backgroundImage: '' })}>
              {t('backgroundPicker.missing.useSolid')}
            </Button>
          </div>
        </div>
      )}

      <PropertyGroup title={t('backgroundPicker.statusGroup')} accent={1}>
        {/* Turning rotation on picks a starting source from the saved keys, so
            it waits the moment it takes to learn them (a failed check starts
            on a library folder). Turning it off never waits. */}
        <Toggle
          label={t('backgroundPicker.autoRotate')}
          checked={rotationEnabled}
          onChange={setRotationEnabled}
          disabled={!rotationEnabled && !rotation && !secretsKnown && !secretsFailed}
        />
      </PropertyGroup>
      {rotationEnabled && rotation && (
        <PropertyGroup title={t('fields.rotation')} accent={2}>
          <div className="space-y-2">
            <PhotoSourceFields
              use="background"
              value={rotation}
              onChange={({ photoSource }) => {
                if (!photoSource) return;
                // NASA has one new picture a day; checking hourly gains nothing.
                const slow = photoSource.kind === 'nasa' && rotation.intervalMinutes < 240;
                updateRotation({ photoSource, ...(slow ? { intervalMinutes: 240 } : {}) });
              }}
            />
            <label className="block">
              <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.rotateEveryLabel')}</span>
              <select
                value={rotation.intervalMinutes}
                onChange={(e) => updateRotation({ intervalMinutes: Number(e.target.value) })}
                className={FIELD_CLASS}
              >
                {intervalOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>
        </PropertyGroup>
      )}

      <PropertyGroup title={t('backgroundPicker.shadeGroup')} accent={1}>
        <Toggle label={t('backgroundPicker.shadeEnable')} checked={shadeEnabled} onChange={setShadeEnabled} />
        {shadeEnabled && shade && (
          <div className="space-y-2 mt-2">
            <label className="block">
              <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.shadeStyleLabel')}</span>
              <select
                value={shade.style}
                onChange={(e) => updateShade({ style: e.target.value as BackgroundShade['style'] })}
                className={FIELD_CLASS}
              >
                <option value="even">{t('backgroundPicker.shadeStyles.even')}</option>
                <option value="topBottom">{t('backgroundPicker.shadeStyles.topBottom')}</option>
                <option value="edges">{t('backgroundPicker.shadeStyles.edges')}</option>
                <option value="both">{t('backgroundPicker.shadeStyles.both')}</option>
              </select>
            </label>
            <Slider
              label={t('backgroundPicker.shadeStrengthLabel')}
              value={shade.strength}
              min={0}
              max={100}
              step={5}
              displayValue={`${shade.strength}%`}
              onChange={(value) => updateShade({ strength: value })}
            />
            <ColorPicker
              label={t('backgroundPicker.shadeColorLabel')}
              value={shade.color}
              onChange={(value) => updateShade({ color: value })}
            />
          </div>
        )}
      </PropertyGroup>

      {picking && (
        <PicturePicker
          mode="pick-image"
          builtIn="backgrounds"
          currentValue={currentScreen.backgroundImage || undefined}
          orientation={orientation}
          // Choosing a picture turns Auto-rotate off, so the choice stays.
          onSelectImage={(url) => pickScreenBackground(selectedScreenId, url)}
          onClose={() => setPicking(false)}
        />
      )}
    </AccordionSection>
  );
}

/** The screen's own picture: a small preview, its name and where it lives, Choose a picture and None. */
function PictureField({ value, orientation, rotating, onChoose, onNone }: {
  value: string;
  orientation: 'portrait' | 'landscape';
  rotating: boolean;
  onChoose: () => void;
  onNone: () => void;
}) {
  const t = useTranslate('editor');
  const starter = STARTER_BACKGROUNDS.find((bg) => bg.path === value);
  const file = value ? libraryFileFromServeUrl(value) : null;
  const name = !value ? t('photoSources.background.noPicture')
    : starter ? (starter.group === 'theme'
      ? FULLSCREEN_THEMES.find((th) => th.id === starter.themeId)?.name ?? starter.id
      : t(`backgroundPicker.starters.${starter.id}`))
      : file ? pictureDisplayName(file) : value;
  const folder = file && file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
  const where = rotating ? t('photoSources.background.rotatingNote')
    : !value ? t('photoSources.background.plainColor')
      : isBuiltInPicture('backgrounds', value) ? t('photoSources.background.comesWithHomeScreens')
        : file ? (folder ? t('photoSources.background.inLibraryFolder', { folder }) : t('photoSources.background.inLibrary'))
          : '';
  const shape = orientation === 'landscape' ? 'aspect-video w-[72px]' : 'aspect-[9/16] w-[44px]';
  return (
    <div className="flex gap-2.5" data-testid="background-picture-field">
      <div className={`${shape} shrink-0 overflow-hidden rounded border border-hs-border-strong bg-hs-card`}>
        {value
          ? <img src={tileThumbnailUrl(value)} alt="" className="h-full w-full object-cover" />
          : <span className="flex h-full items-center justify-center text-[9px] text-hs-text-faint">{t('photoSources.background.none')}</span>}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div>
          <div className="truncate text-xs text-hs-text-body" data-testid="background-picture-name">{name}</div>
          {where && <div className="text-[10px] leading-snug text-hs-text-faint">{where}</div>}
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" onClick={onChoose} data-testid="background-choose">{t('photoSources.background.choose')}</Button>
          {value && <Button size="sm" onClick={onNone} data-testid="background-none">{t('photoSources.background.none')}</Button>}
        </div>
      </div>
    </div>
  );
}
