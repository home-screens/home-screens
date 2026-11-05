'use client';

import { useState, useEffect, useMemo, useId, useRef } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorStore } from '@/stores/editor-store';
import { getActiveScreens } from '@/lib/editor-multi-display';
import type { BackgroundRotation, BackgroundRotationSourceId } from '@/types/config';
import LocalBackgrounds from './LocalBackgrounds';
import { ChevronDown, ChevronRight, Lock, RefreshCw } from 'lucide-react';
import { useGroupOpen } from './useGroupOpen';
import AccordionSection from './AccordionSection';
import PropertyGroup from './PropertyGroup';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useTranslate } from '@/i18n';
import { eventBus } from '@/lib/event-bus';
import { isUnsplashCollectionsMode } from '@/lib/unsplash-rotation-mode';
import { activeRotationSources, stopBackgroundRotation } from '@/lib/screen-background';
import IntegrationSettingsLink, { type BackgroundIntegration } from './IntegrationSettingsLink';
import { parseICloudAlbumToken, parseICloudSharedAlbumUrl } from '@/lib/icloud-parse';
import { ImmichRotationFields, LocalRotationFields, CollectionsRotationFields } from './BackgroundRotationFields';
import BackgroundShadeFields from './BackgroundShadeFields';
import BackgroundEffectsFields from './BackgroundEffectsFields';
import ThemeBackgrounds from './ThemeBackgrounds';
import UnsplashSearchPicker from './UnsplashSearchPicker';
import ImmichPickPicker from './ImmichPickPicker';
import SourceModeToggle, { SourceHint } from './SourceModeToggle';
import { effectiveImmichMode } from '@/lib/immich-mode';

const isICloudLinkValid = (link?: string) => !!(link && (parseICloudSharedAlbumUrl(link) || parseICloudAlbumToken(link)));

/**
 * One rotation source row: label + chevron header, then its inline settings.
 * Collapse mirrors the Colors/Patterns groups (chevron button, aria-expanded,
 * remembered per source in localStorage). Collapsing only hides the settings;
 * it never touches the enabled state or saved config. The chevron is always
 * shown, even for unselected or unconfigured sources (notes, such as the
 * setup hint, live inside the collapsible panel). Ticking a source re-expands it.
 */
function CollapsibleSource({ id, label, checked, tooltip, header, notes, children }: {
  id: string; label: string; checked: boolean; tooltip?: string;
  header: (toggle: React.ReactNode) => React.ReactNode;
  notes: React.ReactNode; children: React.ReactNode;
}) {
  const [open, setOpen] = useGroupOpen(id);
  const panelId = useId();
  const wasChecked = useRef(checked);
  useEffect(() => {
    if (checked && !wasChecked.current) setOpen(true);
    wasChecked.current = checked;
  }, [checked, setOpen]);
  const Chevron = open ? ChevronDown : ChevronRight;
  const toggle = (
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={panelId}
      data-testid={`source-group-${id}`} aria-label={label} title={tooltip}
      className="flex items-center rounded px-1 text-[10px] text-hs-text-muted hover:bg-hs-hover">
      <Chevron size={11} aria-hidden="true" />
    </button>
  );
  return (
    <div data-testid={`source-row-${id}`}>
      <div className="flex items-center gap-2">{header(toggle)}</div>
      {open && <div id={panelId}>{notes}{children}</div>}
    </div>
  );
}

export default function BackgroundPicker() {
  const t = useTranslate('editor');
  const { config, selectedDisplayId, selectedScreenId, updateScreen, updateScreenRotation } = useEditorStore();
  const { status: secretStatus } = useSecretStatus();
  const hasUnsplashKey = !!secretStatus.unsplash_access_key;
  const hasNasaKey = !!secretStatus.nasa_api_key;
  const hasImmichKey = !!secretStatus.immich_api_key && !!secretStatus.immich_url;

  const activeScreens = config ? getActiveScreens(config, selectedDisplayId) : [];
  const currentScreen = activeScreens.find((s) => s.id === selectedScreenId);
  const rotationSources = activeRotationSources(currentScreen?.backgroundRotation);
  const unsplashCollectionsMode = currentScreen?.backgroundRotation
    ? isUnsplashCollectionsMode(currentScreen.backgroundRotation)
    : false;

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

  const [refreshing, setRefreshing] = useState(false);
  const refreshNow = async () => {
    if (!selectedScreenId || rotationSources.length === 0 || refreshing) return;
    setRefreshing(true);
    try {
      const res = await editorFetch(`/api/backgrounds/rotate?screenId=${encodeURIComponent(selectedScreenId)}&force=true`);
      if (res.ok) {
        const data = await res.json();
        if (data.fresh) eventBus.publish('background.forceRefresh', { screenId: selectedScreenId, path: data.path ?? null });
      }
    } finally {
      setRefreshing(false);
    }
  };

  if (!currentScreen || !selectedScreenId) return null;

  const ROTATION_SOURCES: { id: BackgroundRotationSourceId; label: string; locked: boolean; integration?: BackgroundIntegration }[] = [
    { id: 'unsplash', label: t('backgroundPicker.sources.unsplash'), locked: !hasUnsplashKey, integration: 'unsplash' },
    { id: 'nasa-apod', label: t('backgroundPicker.sources.nasaApod'), locked: !hasNasaKey, integration: 'nasa' },
    { id: 'immich', label: t('backgroundPicker.sources.immich'), locked: !hasImmichKey, integration: 'immich' },
    { id: 'icloud', label: t('backgroundPicker.sources.icloud'), locked: !isICloudLinkValid(currentScreen.backgroundRotation?.icloudAlbumUrl) },
    { id: 'local', label: t('backgroundPicker.sources.local'), locked: false },
  ];

  const toggleRotationSource = (id: BackgroundRotationSourceId, checked: boolean) => {
    if (!selectedScreenId) return;
    const current = currentScreen.backgroundRotation?.sources ?? [];
    const sources = checked ? [...current, id] : current.filter((s) => s !== id);
    updateScreenRotation(selectedScreenId, {
      sources,
      // Pin the mode on first enable so a fresh Immich config that showed Pictures does not flip to filters.
      ...(checked && id === 'immich' ? { immichMode: effectiveImmichMode(currentScreen.backgroundRotation) } : {}),
      query: currentScreen.backgroundRotation?.query || 'nature landscape',
      intervalMinutes: currentScreen.backgroundRotation?.intervalMinutes || 60,
    });
  };

  const rotationFieldClass = 'mt-0.5 block w-full rounded bg-hs-card border border-hs-border-strong text-xs text-hs-text-body px-2 py-1 focus:outline-none focus:border-hs-accent';

  // Every source's real controls, shown whenever its panel is open: the checkbox
  // only decides whether the source is in the rotation. A source without its API
  // key shows just the setup hint (its pickers would only report errors).
  const rotation: BackgroundRotation = currentScreen.backgroundRotation ?? { sources: [], query: 'nature landscape', intervalMinutes: 60 };
  const patchRotation = (updates: Partial<BackgroundRotation>) => {
    if (!selectedScreenId) return;
    updateScreenRotation(selectedScreenId, {
      query: rotation.query || 'nature landscape',
      intervalMinutes: rotation.intervalMinutes || 60,
      ...updates,
    });
  };
  const sourceControls = (entry: { id: BackgroundRotationSourceId; locked: boolean }) => {
    const needsKey = entry.locked && entry.id !== 'icloud' && entry.id !== 'nasa-apod' && entry.id !== 'local';
    if (needsKey) return null;
    return (
      <div className="mt-1.5 ml-5 space-y-2">
        {entry.id === 'unsplash' && (
          <>
            <SourceModeToggle
              testIdPrefix="unsplash-mode"
              value={unsplashCollectionsMode ? 'collections' : 'query'}
              onChange={(id) => patchRotation({
                unsplashMode: id,
                unsplashCollections: id === 'collections' && !rotation.unsplashCollections?.length ? [''] : rotation.unsplashCollections,
              })}
              options={[
                { id: 'query', label: t('backgroundPicker.unsplash.modeQuery') },
                { id: 'collections', label: t('backgroundPicker.unsplash.modeCollections') },
              ]}
            />
            {unsplashCollectionsMode ? (
              <CollectionsRotationFields
                key={selectedScreenId}
                collections={rotation.unsplashCollections || []}
                onChange={(ids) => patchRotation({ unsplashCollections: ids })}
              />
            ) : (
              <UnsplashSearchPicker rotation={rotation} onChange={patchRotation} />
            )}
          </>
        )}
        {entry.id === 'icloud' && (
          <label className="block">
            <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.icloud.albumLabel')}</span>
            <input
              type="url"
              value={rotation.icloudAlbumUrl || ''}
              onChange={(e) => patchRotation({ icloudAlbumUrl: e.target.value || undefined, sources: rotationSources })}
              placeholder="https://www.icloud.com/sharedalbum/#..."
              className={rotationFieldClass}
            />
            <SourceHint>{t('backgroundPicker.icloud.albumHelp')}</SourceHint>
            {entry.locked && (
              <SourceHint testId="icloud-needs-link">{t('backgroundPicker.icloud.needsLink')}</SourceHint>
            )}
          </label>
        )}
        {entry.id === 'immich' && (
          <>
            <SourceModeToggle
              testIdPrefix="immich-mode"
              value={effectiveImmichMode(rotation)}
              onChange={(id) => patchRotation({ immichMode: id })}
              options={[
                { id: 'pick', label: t('backgroundPicker.immich.modePictures') },
                { id: 'filters', label: t('backgroundPicker.immich.modeFilters') },
              ]}
            />
            {effectiveImmichMode(rotation) === 'pick' ? (
              <ImmichPickPicker rotation={rotation} onChange={patchRotation} />
            ) : (
              <ImmichRotationFields rotation={rotation} onChange={patchRotation} />
            )}
          </>
        )}
        {entry.id === 'nasa-apod' && <SourceHint>{t('backgroundPicker.nasaInfo')}</SourceHint>}
        {entry.id === 'local' && <LocalRotationFields rotation={rotation} onChange={patchRotation} />}
      </div>
    );
  };

  return (
    <>
    {/* A full-screen theme wall is a single fixed pick, not a media source, so it sits outside Sources. */}
    <AccordionSection title={t('backgroundPicker.groups.theme')}>
      <ThemeBackgrounds selectedScreenId={selectedScreenId} />
    </AccordionSection>

    <AccordionSection title={t('backgroundPicker.title')}>
      <PropertyGroup
        title={t('backgroundPicker.sourcesGroup')}
        accent={2}
        titleExtra={
                <button
                  type="button"
                  onClick={refreshNow}
                  disabled={rotationSources.length === 0 || refreshing}
                  aria-label={t('backgroundPicker.refreshNow')}
                  title={t('backgroundPicker.refreshNow')}
                  data-testid="background-rotation-refresh"
                  className="mb-[7px] shrink-0 rounded p-1 text-hs-text-faint hover:text-hs-text-secondary hover:bg-hs-hover disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                </button>
              }
            >
              <div className="space-y-2">
                <p className="text-xs font-medium text-hs-text-secondary" data-testid="background-mode" title={t('backgroundPicker.modeHelp')}>
                  {rotationSources.length > 0 ? t('backgroundPicker.modeRotating') : t('backgroundPicker.modeFixed')}
                </p>
                <LocalBackgrounds selectedScreenId={selectedScreenId} />
                <div className="space-y-2">
                  {ROTATION_SOURCES.map((entry) => {
                    const checked = rotationSources.includes(entry.id);
                    return (
                      <CollapsibleSource key={entry.id} id={entry.id} checked={checked}
                        tooltip={entry.locked ? (entry.id === 'icloud' ? t('backgroundPicker.icloud.needsLink') : `${t('backgroundPicker.sourceNotSetUp')} ${t('backgroundPicker.sourceSetUpLink', { source: entry.label })}`) : undefined}
                        label={entry.label}
                        header={(toggle) => (<>
                        <label
                          className={`flex min-w-0 flex-1 items-center gap-2 ${entry.locked && !checked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                          title={entry.locked ? t('backgroundPicker.sourceSetUpLink', { source: entry.label }) : undefined}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={entry.locked && !checked}
                            onChange={(e) => toggleRotationSource(entry.id, e.target.checked)}
                            className="rounded border-hs-border-strong"
                          />
                          <span className={`text-xs flex items-center gap-1 ${entry.locked ? 'text-hs-text-faint' : 'text-hs-text-body'}`}>
                            {entry.locked && <Lock className="h-2.5 w-2.5" aria-hidden="true" />}
                            {entry.label}
                          </span>
                        </label>
                        {toggle}
                        </>)}
                        notes={<>
                        {entry.locked && entry.id !== 'icloud' && (
                          checked ? (
                            <span
                              className="mt-1 block text-[10px] leading-relaxed text-hs-warning"
                              data-testid="background-source-key-missing"
                            >
                              {t('backgroundPicker.sourceKeyMissing')}
                            </span>
                          ) : (
                            <span
                              className="mt-0.5 block pl-5 text-[10px] leading-relaxed text-hs-text-faint"
                              data-testid={`background-source-not-set-up-${entry.id}`}
                            >
                              {t('backgroundPicker.sourceNotSetUp')}{' '}
                              {entry.integration && (
                                <IntegrationSettingsLink integration={entry.integration}>
                                  {t('backgroundPicker.sourceSetUpLink', { source: entry.label })}
                                </IntegrationSettingsLink>
                              )}
                            </span>
                          )
                        )}
                        </>}
                      >
                          {sourceControls(entry)}
                      </CollapsibleSource>
                    );
                  })}
                </div>
                <label className="block">
                  <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.rotateEveryLabel')}</span>
                  <select
                    value={currentScreen.backgroundRotation?.intervalMinutes ?? 60}
                    onChange={(e) => {
                      if (!selectedScreenId) return;
                      updateScreenRotation(selectedScreenId, { intervalMinutes: Number(e.target.value) });
                    }}
                    className={rotationFieldClass}
                  >
                    {intervalOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
              </div>
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
            <button
              type="button"
              onClick={() => {
                const group = document.getElementById('starter-group-theme');
                if (group?.getAttribute('aria-expanded') === 'false') group.click();
                group?.focus();
              }}
              className="text-[11px] font-medium px-2.5 py-1 rounded-md text-hs-text-body bg-hs-card border border-hs-border-strong hover:bg-hs-hover transition-colors"
            >
              {t('backgroundPicker.missing.pickAnother')}
            </button>
            <button
              type="button"
              onClick={() => updateScreen(selectedScreenId, {
                backgroundImage: '',
                ...(rotationSources.length ? { backgroundRotation: stopBackgroundRotation(currentScreen.backgroundRotation) } : {}),
              })}
              className="text-[11px] font-medium px-2.5 py-1 rounded-md text-hs-text-body bg-hs-card border border-hs-border-strong hover:bg-hs-hover transition-colors"
            >
              {t('backgroundPicker.missing.useSolid')}
            </button>
          </div>
        </div>
      )}
    </AccordionSection>

    <AccordionSection title={t('backgroundPicker.effectsTitle')}>
      <BackgroundShadeFields screenId={selectedScreenId} shade={currentScreen.shade} />
      <BackgroundEffectsFields screenId={selectedScreenId} effects={currentScreen.effects} />
    </AccordionSection>
    </>
  );
}
