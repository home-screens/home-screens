'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Sun, Moon, Monitor } from 'lucide-react';
import { useTranslate } from '@/i18n';
import HomeScreensLogo from '@/components/brand/HomeScreensLogo';
import { getThemeChoice, setThemeChoice, type ThemeChoice } from '@/lib/theme';
import type { SaveStatus } from '@/hooks/useSettingsAutosave';

interface SettingsHeaderProps {
  onBack: () => void;
  /** Local auto-save flag from `useSettingsAutosave` (Defaults pages). */
  saving: boolean;
  saveMessage: SaveStatus;
  /** Store's live save flags, which also cover per-display subtab saves. */
  storeIsSaving: boolean;
  storeSaveError: string | null;
}

export default function SettingsHeader({
  onBack,
  saving,
  saveMessage,
  storeIsSaving,
  storeSaveError,
}: SettingsHeaderProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');

  // Header status indicator: visible whenever a save is in flight or
  // a recently-completed save is still being acknowledged. Replaces
  // the old per-tab Save button now that every settings surface
  // auto-saves. The indicator is presence-only in the steady state —
  // no visual clutter when the user isn't actively editing.
  //
  // The isSaving source-of-truth is the store, not the local `saving`
  // state. This way both the Defaults-page auto-save effect AND the
  // per-display subtab direct-save paths light up the same indicator.
  // Error state falls back to storeSaveError so per-display save
  // failures don't disappear just because local state said "Saved".
  const isActivelySaving = saving || storeIsSaving;
  const hasFailure = saveMessage === 'failed' || !!storeSaveError;
  const statusIndicator = isActivelySaving ? (
    <span className="text-xs text-hs-text-muted flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-hs-warning animate-pulse" />
      {tCore('status.saving')}
    </span>
  ) : hasFailure ? (
    <span className="text-xs text-hs-danger flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-hs-danger" />
      {t('common.saveFailed')}
    </span>
  ) : saveMessage === 'saved' ? (
    <span className="text-xs text-hs-success flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-hs-success" />
      {t('common.saved')}
    </span>
  ) : null;

  return (
    <div className="flex items-center justify-between border-b border-hs-border-strong bg-hs-panel px-4 py-2.5">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-hs-text-muted hover:text-hs-text-body transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('settings.header.backToEditor')}
        </button>
        <div className="h-6 w-px bg-hs-card" />
        <button onClick={onBack}>
          <HomeScreensLogo contextLabel={t('settings.header.contextLabel')} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        {statusIndicator}
        <ThemeToggle />
      </div>
    </div>
  );
}

const THEME_CYCLE: ThemeChoice[] = ['dark', 'light', 'system'];
const THEME_ICON = { dark: Moon, light: Sun, system: Monitor } as const;

function ThemeToggle() {
  const t = useTranslate('editor');
  const [choice, setChoice] = useState<ThemeChoice>('dark');
  useEffect(() => { setChoice(getThemeChoice()); }, []);

  const cycle = () => {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(choice) + 1) % THEME_CYCLE.length];
    setChoice(next);
    setThemeChoice(next);
  };

  const Icon = THEME_ICON[choice];
  const label = t(`settings.header.theme.${choice}`);

  return (
    <button
      onClick={cycle}
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-hs-text-muted hover:text-hs-text-body hover:bg-hs-hover transition-colors"
      title={t('settings.header.theme.titleFormat', { label })}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </button>
  );
}
