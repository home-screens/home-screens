'use client';

import { useEffect, useRef, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { GRAB_HOLD_CHOICES, GRAB_LIMIT_CHOICES } from '@/lib/chore-bonus';
import { useTranslate } from '@/i18n';
import { radioGroupKeyDown, radioTabIndex } from '@/components/ui/radio-group-keys';
import type { ChoreSettings } from '@/types/config';

/**
 * Saving the household's grab rules from the editor: each pick saves at once
 * (`PUT /api/chores/settings`), a failure puts the old choice back, and only
 * the newest of two quick picks may land. `savedAt` drives a brief "Saved".
 * Used by Settings > Family and by the chore window's rules line.
 */
export function useGrabRulesSave(initial: ChoreSettings | null, onSaved?: (next: ChoreSettings) => void) {
  const [settings, setSettings] = useState<ChoreSettings | null>(initial);
  const [failed, setFailed] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  useEffect(() => {
    if (!savedAt) return;
    const id = setTimeout(() => setSavedAt(0), 2000);
    return () => clearTimeout(id);
  }, [savedAt]);
  const latest = useRef(0);
  // Saves go out one after another: two quick picks on a slow connection
  // could otherwise land in the wrong order and leave the older one saved.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // What the hub has last taken, to fall back to when a save fails.
  const confirmed = useRef<ChoreSettings | null>(initial);
  useEffect(() => { if (confirmed.current === null) confirmed.current = settings; }, [settings]);

  const save = (next: ChoreSettings) => {
    const id = ++latest.current;
    setSettings(next);
    setFailed(false);
    setSavedAt(0);
    const run = queue.current.then(async () => {
      try {
        const res = await editorFetch('/api/chores/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        confirmed.current = next;
        if (id !== latest.current) return;
        setSavedAt(Date.now());
        onSaved?.(next);
      } catch {
        if (id !== latest.current) return;
        setSettings(confirmed.current);
        setFailed(true);
      }
    });
    queue.current = run;
    return run;
  };

  return { settings, setSettings, save, failed, setFailed, savedAt };
}

const choice = (on: boolean) =>
  `w-full text-left rounded-md px-3 py-2 border transition-colors ${
    on ? 'border-hs-accent/60 bg-hs-accent-soft' : 'border-hs-border-strong/50 hover:bg-hs-hover'
  }`;

/** How many bonus chores one person can grab at once, as an arrow-key radio group with hints. */
export function GrabLimitChoice({ settings, onPick }: { settings: ChoreSettings; onPick: (next: ChoreSettings) => void }) {
  const t = useTranslate('editor');
  const tModules = useTranslate('modules');
  return (
    <div className="space-y-1.5">
      {/* The same words the settings search shows for this field. */}
      <div className="text-xs text-hs-text-muted">{t('settings.familyPage.chores.grabLimitLabel')}</div>
      <div
        role="radiogroup"
        aria-label={t('settings.familyPage.chores.grabLimitLabel')}
        onKeyDown={radioGroupKeyDown(GRAB_LIMIT_CHOICES, settings.grabLimit, (grabLimit) => onPick({ ...settings, grabLimit }))}
        className="grid grid-cols-2 gap-1.5"
      >
        {GRAB_LIMIT_CHOICES.map((limit) => (
          <button
            key={limit}
            type="button"
            role="radio"
            aria-checked={settings.grabLimit === limit}
            tabIndex={radioTabIndex(GRAB_LIMIT_CHOICES, settings.grabLimit, limit)}
            onClick={() => onPick({ ...settings, grabLimit: limit })}
            className={choice(settings.grabLimit === limit)}
          >
            <span className="block text-xs font-medium text-hs-text-body">{tModules(`chore-chart.settings.grabLimit.${limit}`)}</span>
            {(limit === 1 || limit === 0) && (
              <span className="block text-[11px] text-hs-text-faint">{tModules(`chore-chart.settings.grabLimitHint.${limit}`)}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/** When a grab of a bonus chore ends, as an arrow-key radio group with hints. */
export function GrabHoldChoice({ settings, onPick }: { settings: ChoreSettings; onPick: (next: ChoreSettings) => void }) {
  const t = useTranslate('editor');
  const tModules = useTranslate('modules');
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-hs-text-muted">{t('settings.familyPage.chores.grabHoldLabel')}</div>
      <div
        role="radiogroup"
        aria-label={t('settings.familyPage.chores.grabHoldLabel')}
        onKeyDown={radioGroupKeyDown(GRAB_HOLD_CHOICES, settings.grabHold, (grabHold) => onPick({ ...settings, grabHold }))}
        className="space-y-1.5"
      >
        {GRAB_HOLD_CHOICES.map((hold) => (
          <button
            key={hold}
            type="button"
            role="radio"
            aria-checked={settings.grabHold === hold}
            tabIndex={radioTabIndex(GRAB_HOLD_CHOICES, settings.grabHold, hold)}
            onClick={() => onPick({ ...settings, grabHold: hold })}
            className={choice(settings.grabHold === hold)}
          >
            <span className="block text-xs font-medium text-hs-text-body">{tModules(`chore-chart.settings.grabHold.${hold}`)}</span>
            <span className="block text-[11px] text-hs-text-faint">{tModules(`chore-chart.settings.grabHoldHint.${hold}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
