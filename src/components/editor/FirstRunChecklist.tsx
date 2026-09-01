'use client';

import { useEffect, useState } from 'react';
import { Check, Circle, X } from 'lucide-react';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { getLocation } from '@/lib/location';
import { isScreenEmpty } from '@/lib/display-filter';
import { settingsPath } from '@/lib/settings-route';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
import StartFromTemplateButton from './StartFromTemplateButton';

const DISMISSED_KEY = 'hs-first-run-checklist-dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The four things a new install needs, shown in the property panel while
 * every screen on the selected display is still empty. It disappears on its
 * own once a module exists, and the close button hides it for good in this
 * browser (a checklist that comes back after being dismissed is nagging).
 *
 * "Done" state is read from what is actually configured — a real location, a
 * password on the hub — never from whether the link was clicked, so a user
 * who set things up from another device sees the right ticks.
 */
export default function FirstRunChecklist() {
  const t = useTranslate('editor');
  const config = useEditorStore((s) => s.config);
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  const selectedScreenId = useEditorStore((s) => s.selectedScreenId);
  const [dismissed, setDismissed] = useState(true);
  const [passwordSet, setPasswordSet] = useState<boolean | null>(null);

  // Read after mount so the server-rendered panel matches the first client
  // paint (localStorage is not available during render on the server).
  useEffect(() => { setDismissed(readDismissed()); }, []);

  // PropertyPanel mounts this on every deselect, so the checklist decides
  // whether it is needed BEFORE touching the network: a set-up hub must
  // never pay an /api/auth/status round-trip for a component that renders
  // nothing.
  const screens = config ? getActiveScreens(config, selectedDisplayId) : [];
  const needed = !dismissed && config != null && screens.every(isScreenEmpty);

  useEffect(() => {
    if (!needed) return;
    let cancelled = false;
    editorFetch('/api/auth/status')
      .then((r) => r.json())
      .then((d: { authEnabled?: boolean }) => { if (!cancelled) setPasswordSet(!!d.authEnabled); })
      .catch(() => { if (!cancelled) setPasswordSet(null); });
    return () => { cancelled = true; };
  }, [needed]);

  if (!needed || !config) return null;

  const locationSet = getLocation(config.settings) != null;
  const emptyScreenId = screens.find((s) => s.id === selectedScreenId)?.id ?? screens[0]?.id;

  const dismiss = () => {
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* private mode */ }
    setDismissed(true);
  };

  return (
    <section
      data-testid="first-run-checklist"
      className="rounded-lg border border-hs-accent/30 bg-hs-accent/5 p-3 mb-5"
      aria-label={t('firstRun.heading')}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <h3 className="text-sm font-semibold text-hs-text-body">{t('firstRun.heading')}</h3>
          <p className="text-xs text-hs-text-faint mt-0.5">{t('firstRun.intro')}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 text-hs-text-faint hover:text-hs-text-body"
          aria-label={t('firstRun.dismiss')}
          title={t('firstRun.dismiss')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <ol className="space-y-2">
        <ChecklistItem done={false} label={t('firstRun.steps.template')}>
          <StartFromTemplateButton
            replaceEmptyScreenId={emptyScreenId}
            label={t('firstRun.steps.templateButton')}
            size="sm"
            className="inline-flex items-center gap-1"
          />
        </ChecklistItem>
        <ChecklistItem done={locationSet} label={t('firstRun.steps.location')}>
          {!locationSet && (
            <a href={settingsPath({ kind: 'defaults', page: 'location' })} className="text-xs text-hs-accent hover:underline">
              {t('firstRun.steps.locationLink')}
            </a>
          )}
        </ChecklistItem>
        <ChecklistItem done={false} label={t('firstRun.steps.phone')}>
          <a href={settingsPath({ kind: 'defaults', page: 'phone' })} className="text-xs text-hs-accent hover:underline">
            {t('firstRun.steps.phoneLink')}
          </a>
        </ChecklistItem>
        <ChecklistItem done={passwordSet === true} label={t('firstRun.steps.password')}>
          {passwordSet !== true && (
            <a href={settingsPath({ kind: 'defaults', page: 'security' })} className="text-xs text-hs-accent hover:underline">
              {t('firstRun.steps.passwordLink')}
            </a>
          )}
        </ChecklistItem>
      </ol>
    </section>
  );
}

function ChecklistItem({ done, label, children }: { done: boolean; label: string; children?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {done
        ? <Check className="w-4 h-4 mt-0.5 shrink-0 text-hs-success" aria-hidden="true" />
        : <Circle className="w-4 h-4 mt-0.5 shrink-0 text-hs-text-faint" aria-hidden="true" />}
      <div className="min-w-0">
        <p className={`text-xs ${done ? 'text-hs-text-faint line-through' : 'text-hs-text-body'}`}>{label}</p>
        {children && <div className="mt-1">{children}</div>}
      </div>
    </li>
  );
}
