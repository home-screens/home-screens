'use client';

import { useState, useEffect, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { editorFetch } from '@/lib/editor-fetch';
import { eventBus } from '@/lib/event-bus';
import { useEditorStore } from '@/stores/editor-store';
import { getActiveScreens, getActiveDimensions } from '@/lib/editor-multi-display';
import type { PhotoSource } from '@/types/config';
import Button from '@/components/ui/Button';
import AccordionSection from './AccordionSection';
import PropertyGroup from './PropertyGroup';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useTranslate } from '@/i18n';
import { libraryFileFromServeUrl } from '@/lib/library-client';
import { pictureDisplayName, tileThumbnailUrl } from '@/lib/media-paths';
import {
  clampPhotoCount, defaultPhotoSource, hasContent, isReady, isRotationActive, offeredFor,
  rotationBreadth, rotationSources, type PhotoSourceKind,
} from '@/lib/photo-source';
import { DEFAULT_ROTATION_INTERVAL_MINUTES } from '@/lib/screen-background';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { STARTER_BACKGROUNDS } from '@/lib/starter-backgrounds';
import PicturePicker from './picture-picker/PicturePicker';
import { isBuiltInPicture } from './picture-picker/BuiltInTab';
import PhotoSourceEntryFields from './photo-source/PhotoSourceEntryFields';
import SourceRow from './photo-source/SourceRow';
import WallSourceGroup from './WallSourceGroup';
import IntegrationSettingsLink, { type BackgroundIntegration } from './IntegrationSettingsLink';
import BackgroundShadeFields from './BackgroundShadeFields';
import BackgroundEffectsFields from './BackgroundEffectsFields';

const FIELD_CLASS = 'mt-0.5 block w-full rounded bg-hs-card border border-hs-border-strong text-xs text-hs-text-body px-2 py-1 focus:outline-none focus:border-hs-accent';

/** The Settings card that holds a kind's key, for the note on a locked row. */
const INTEGRATION: Partial<Record<PhotoSourceKind, BackgroundIntegration>> = {
  immich: 'immich',
  unsplash: 'unsplash',
  onedrive: 'microsoft',
};

/**
 * A screen's background: one picture chosen in the Image Library (the same
 * window every single-picture spot opens, with the backgrounds that ship
 * with Home Screens as its first tab), or a rotation through any of the
 * sources listed under Sources, one row per kind, each with the same fields
 * a slideshow gets. Then the shade and the effects drawn over it.
 */
export default function BackgroundPicker() {
  const t = useTranslate('editor');
  const { config, selectedDisplayId, selectedScreenId, updateScreen, updateScreenRotation, pickScreenBackground } = useEditorStore();
  const { status: secretStatus } = useSecretStatus();
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

  const rotation = currentScreen?.backgroundRotation;
  const sources = rotationSources(rotation);
  const breadth = rotationBreadth(rotation, secretStatus);
  const rotating = isRotationActive(rotation) && breadth !== 'none';

  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState<'changed' | 'nothing' | null>(null);
  const refreshNow = async () => {
    if (!selectedScreenId || !rotating || refreshing) return;
    setRefreshing(true);
    setRefreshed(null);
    try {
      const res = await editorFetch(`/api/backgrounds/rotate?screenId=${encodeURIComponent(selectedScreenId)}&force=true`, { timeoutMs: null });
      if (res.ok) {
        const data = await res.json();
        if (data.fresh) eventBus.publish('background.forceRefresh', { screenId: selectedScreenId, path: data.path ?? null });
        setRefreshed(data.fresh ? 'changed' : 'nothing');
      } else {
        setRefreshed('nothing');
      }
    } catch {
      setRefreshed('nothing');
    } finally {
      setRefreshing(false);
    }
  };

  if (!currentScreen || !selectedScreenId) return null;
  const screenId = selectedScreenId;

  const entryOf = (kind: PhotoSourceKind): PhotoSource | null => sources.find((source) => source.kind === kind) ?? null;
  const wallEntry = (group: 'color' | 'pattern') =>
    (sources.find((source) => source.kind === 'wall' && source.group === group) as Extract<PhotoSource, { kind: 'wall' }> | undefined) ?? null;

  /** What a row says under its name: where to add the key, or what the source still needs. */
  const rowNote = (kind: PhotoSourceKind, entry: PhotoSource | null) => {
    if (!isReady(kind, secretStatus, 'background')) {
      const integration = INTEGRATION[kind];
      return (
        <>
          {t('backgroundPicker.sourceNotSetUp')}{' '}
          {integration && (
            <IntegrationSettingsLink integration={integration}>
              {t('backgroundPicker.sourceSetUpLink', { source: t(`photoSources.kinds.${kind}`) })}
            </IntegrationSettingsLink>
          )}
        </>
      );
    }
    if (entry && !hasContent(entry)) return t(`backgroundPicker.sourceNeeds.${kind}`);
    return undefined;
  };

  const kinds = offeredFor('background').filter((kind) => kind !== 'wall');

  // NASA has one new picture a day; checking hourly gains nothing.
  const withNasaPace = (update: { source: PhotoSource }) =>
    update.source.kind === 'nasa' && (rotation?.intervalMinutes ?? DEFAULT_ROTATION_INTERVAL_MINUTES) < 240
      ? { ...update, intervalMinutes: 240 }
      : update;

  return (
    <>
    <AccordionSection title={t('backgroundPicker.title')}>
      <PropertyGroup title={t('photoSources.background.pictureGroup')} accent={1}>
        <PictureField
          value={currentScreen.backgroundImage}
          orientation={orientation}
          rotating={rotating}
          onChoose={() => setPicking(true)}
          onNone={() => updateScreen(screenId, { backgroundImage: '' })}
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
            <Button size="sm" onClick={() => updateScreen(screenId, { backgroundImage: '' })}>
              {t('backgroundPicker.missing.useSolid')}
            </Button>
          </div>
        </div>
      )}

      <PropertyGroup
        title={t('backgroundPicker.sourcesGroup')}
        accent={2}
        titleExtra={
          <button
            type="button"
            onClick={refreshNow}
            disabled={!rotating || refreshing}
            aria-label={t('backgroundPicker.refreshNow')}
            title={rotating ? t('backgroundPicker.refreshNow') : t('backgroundPicker.refreshDisabled')}
            data-testid="background-rotation-refresh"
            className="mb-[7px] shrink-0 rounded p-1 text-hs-text-faint hover:text-hs-text-secondary hover:bg-hs-hover disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        }
      >
        <div className="space-y-2">
          <p className="text-xs font-medium text-hs-text-secondary" data-testid="background-mode" title={t('backgroundPicker.modeHelp')}>
            {breadth === 'many' ? t('backgroundPicker.modeRotating') : breadth === 'one' ? t('backgroundPicker.modeOne') : t('backgroundPicker.modeFixed')}
            {refreshed && <span className="ml-2 font-normal text-hs-text-faint" data-testid="background-refresh-result">{t(refreshed === 'changed' ? 'backgroundPicker.refreshChanged' : 'backgroundPicker.refreshNothing')}</span>}
          </p>

          <WallSourceGroup group="color" source={wallEntry('color')} onChange={(source) => updateScreenRotation(screenId, source ? { source } : { remove: { kind: 'wall', group: 'color' } })} />
          <WallSourceGroup group="pattern" source={wallEntry('pattern')} onChange={(source) => updateScreenRotation(screenId, source ? { source } : { remove: { kind: 'wall', group: 'pattern' } })} />

          {kinds.map((kind) => {
            const entry = entryOf(kind);
            const ready = isReady(kind, secretStatus, 'background');
            return (
              <SourceRow
                key={kind}
                id={kind}
                label={t(`photoSources.kinds.${kind}`)}
                checked={entry !== null}
                disabled={!ready && entry === null}
                onCheck={(checked) => updateScreenRotation(screenId, checked ? withNasaPace({ source: defaultPhotoSource(kind) }) : { remove: { kind } })}
                note={rowNote(kind, entry)}
              >
                {ready && (
                  <PhotoSourceEntryFields
                    use="background"
                    source={entry ?? defaultPhotoSource(kind)}
                    count={clampPhotoCount(undefined, kind)}
                    onChange={(source) => updateScreenRotation(screenId, withNasaPace({ source }))}
                  />
                )}
              </SourceRow>
            );
          })}

          {breadth === 'many' && (
            <label className="block">
              <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.rotateEveryLabel')}</span>
              <select
                value={rotation?.intervalMinutes ?? DEFAULT_ROTATION_INTERVAL_MINUTES}
                onChange={(e) => updateScreenRotation(screenId, { intervalMinutes: Number(e.target.value) })}
                className={FIELD_CLASS}
                data-testid="background-rotate-every"
              >
                {intervalOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </PropertyGroup>

      {picking && (
        <PicturePicker
          mode="pick-image"
          builtIn="backgrounds"
          currentValue={currentScreen.backgroundImage || undefined}
          orientation={orientation}
          // Choosing a picture turns the rotation off, so the choice stays.
          onSelectImage={(url) => pickScreenBackground(screenId, url)}
          onClose={() => setPicking(false)}
        />
      )}
    </AccordionSection>

    <AccordionSection title={t('backgroundPicker.effectsTitle')}>
      <BackgroundShadeFields screenId={screenId} shade={currentScreen.shade} />
      <BackgroundEffectsFields screenId={screenId} effects={currentScreen.effects} />
    </AccordionSection>
    </>
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
