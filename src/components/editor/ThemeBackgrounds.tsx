'use client';

import { useEditorStore } from '@/stores/editor-store';
import { getActiveScreens, getActiveFullscreenTheme } from '@/lib/editor-multi-display';
import FullscreenThemePreview from '@/components/ui/FullscreenThemePreview';
import { themeTileClass } from '@/components/editor/settings/shared/FullscreenThemeTile';
import { useTranslate, tOrFallback } from '@/i18n';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { starterBackgroundsIn } from '@/lib/starter-backgrounds';
import { isRotationActive } from '@/lib/screen-background';

/** A wall that matches one full-screen theme. It is a single choice, not a media source. */
export default function ThemeBackgrounds({ selectedScreenId }: { selectedScreenId: string }) {
  const t = useTranslate('editor');
  const { config, selectedDisplayId, pickScreenBackground } = useEditorStore();
  const currentScreen = (config ? getActiveScreens(config, selectedDisplayId) : []).find((s) => s.id === selectedScreenId);
  if (!currentScreen || !config) return null;

  // The theme the selected display paints its fullscreen modules with: its
  // own override first, then the shared default, then the shipped default.
  const themeInUse = getActiveFullscreenTheme(config, selectedDisplayId) ?? 'linen';
  const walls = starterBackgroundsIn('theme');
  const ordered = [
    ...walls.filter((bg) => bg.themeId === themeInUse),
    ...walls.filter((bg) => bg.themeId !== themeInUse),
  ];
  const rotating = isRotationActive(currentScreen.backgroundRotation);

  return (
    <div className="grid grid-cols-2 gap-1.5" data-testid="theme-backgrounds">
      {ordered.map((bg) => {
        const theme = FULLSCREEN_THEMES.find((th) => th.id === bg.themeId);
        if (!theme) return null;
        const selected = currentScreen.backgroundImage === bg.path && !rotating;
        const inUse = theme.id === themeInUse;
        const group = tOrFallback(t, `settings.defaultDisplayPage.themeGroups.${theme.group}`, theme.group);
        return (
          <button
            key={bg.id}
            type="button"
            aria-label={t('backgroundPicker.useFixed', { name: theme.name })}
            aria-pressed={selected}
            onClick={() => pickScreenBackground(selectedScreenId, bg.path)}
            data-testid={`starter-background-${bg.id}`}
            data-in-use={inUse ? 'true' : undefined}
            className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-1.5 py-1.5 text-left transition-colors ${themeTileClass(selected)}`}
          >
            <FullscreenThemePreview tokens={theme.tokens} size="sm" />
            <div className="min-w-0 flex-1">
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
  );
}
