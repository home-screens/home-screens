'use client';

import { useEffect, useState } from 'react';
import { Check, Circle, X } from 'lucide-react';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { getLocation } from '@/lib/location';
import { resolveFirstRunChecklist } from '@/lib/first-run-checklist';
import { settingsPath } from '@/lib/settings-route';
import { useFetchData } from '@/hooks/useFetchData';
import { familyUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
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

const AUTH_STATUS_URL = '/api/auth/status';
/** These two answer "did you finish setting up", not live data. */
const SETUP_ANSWER_TTL_MS = 60_000;

/**
 * Latched once the install plainly needs no checklist, so the two questions
 * below stop being asked for the rest of the page's life.
 *
 * It is never set back to false: it only ever means "this browser has already
 * seen every step done", and an install that goes backwards (a password
 * removed) does not need the first-run card back.
 */
let setupSettled = false;

function markSetupSettled(): void {
  setupSettled = true;
}

/**
 * The five things a new install needs, shown in the property panel until they
 * are done or the person closes it. The close button hides it for good in this
 * browser (a checklist that comes back after being dismissed is nagging).
 *
 * "Done" state is read from what is actually configured (a module on the
 * display, people in the household, a real location, a password on the hub) and
 * never from whether the link was clicked, so a user who set things up from
 * another device sees the right ticks. `resolveFirstRunChecklist` holds that
 * rule.
 */
export default function FirstRunChecklist() {
  const t = useTranslate('editor');
  const config = useEditorStore((s) => s.config);
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  const selectedScreenId = useEditorStore((s) => s.selectedScreenId);
  const [dismissed, setDismissed] = useState(true);

  // Read after mount so the server-rendered panel matches the first client
  // paint (localStorage is not available during render on the server).
  useEffect(() => { setDismissed(readDismissed()); }, []);

  // A dismissed or finished checklist asks the hub nothing. Otherwise both
  // answers are needed to decide whether to render at all, so they cannot wait
  // behind that decision.
  //
  // Both go through the shared fetch cache rather than a cache of their own.
  // PropertyPanel remounts this component on every deselect and the cache
  // absorbs that, but the reason it has to be the shared one is the other
  // direction: the toolbar's Settings button and the Back button on the
  // settings page are both `router.push`, so the document never reloads. A
  // cache of our own survived adding the first family member and left the step
  // unticked until a manual refresh. This one is invalidated by the roster's
  // own save (`publishFamilyData`) and revalidates on a TTL besides.
  const asksHub = !dismissed && config != null && !setupSettled;
  const [family] = useFetchData<{ members?: unknown[] }>(
    asksHub ? familyUrl() : '', FETCH_KEY_REGISTRY.family.ttlMs,
  );
  const [auth] = useFetchData<{ authEnabled?: boolean }>(
    asksHub ? AUTH_STATUS_URL : '', SETUP_ANSWER_TTL_MS,
  );
  const familySet = family ? Array.isArray(family.members) && family.members.length > 0 : null;
  const passwordSet = auth ? !!auth.authEnabled : null;

  const screens = config ? getActiveScreens(config, selectedDisplayId) : null;
  const townSet = config ? getLocation(config.settings) != null : false;
  const zoneSet = !!config?.settings?.timezone;
  const { show, steps, onlyZoneMissing } = resolveFirstRunChecklist({
    dismissed, screens, townSet, zoneSet, familySet, passwordSet,
  });

  // Every step this card can check is done, so stop asking the hub for the rest
  // of this page. Latching rather than deriving keeps the two questions from
  // restarting the moment `asksHub` turns them off and their answers reset to
  // unknown.
  const allStepsDone = steps.template && steps.location
    && familySet === true && passwordSet === true;
  useEffect(() => { if (allStepsDone) markSetupSettled(); }, [allStepsDone]);

  if (!show || !config || !screens) return null;

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
        <ChecklistItem done={steps.template} label={t('firstRun.steps.template')}>
          {!steps.template && (
            <StartFromTemplateButton
              replaceEmptyScreenId={emptyScreenId}
              label={t('firstRun.steps.templateButton')}
              size="sm"
              className="inline-flex items-center gap-1"
            />
          )}
        </ChecklistItem>
        {/* Second, because chores, rewards, meals and the calendar's name tags
            all read the roster: an owner who never adds it gets a display that
            can only ever show the weather. */}
        <ChecklistItem done={steps.family} label={t('firstRun.steps.family')}>
          {!steps.family && (
            <a href={settingsPath({ kind: 'defaults', page: 'family' })} className="text-xs text-hs-accent hover:underline">
              {t('firstRun.steps.familyLink')}
            </a>
          )}
        </ChecklistItem>
        <ChecklistItem
          done={steps.location}
          label={t('firstRun.steps.location')}
          // The town alone looks finished to a parent who just typed it, so
          // say what is left.
          note={onlyZoneMissing ? t('firstRun.steps.locationZoneMissing') : undefined}
        >
          {!steps.location && (
            <a href={settingsPath({ kind: 'defaults', page: 'location' })} className="text-xs text-hs-accent hover:underline">
              {t('firstRun.steps.locationLink')}
            </a>
          )}
        </ChecklistItem>
        {/* No tick: nothing on the hub records that the phone surface was
            opened, and a tick from clicking the link would be a guess. */}
        <ChecklistItem done={steps.phone} label={t('firstRun.steps.phone')}>
          <a href={settingsPath({ kind: 'defaults', page: 'phone' })} className="text-xs text-hs-accent hover:underline">
            {t('firstRun.steps.phoneLink')}
          </a>
        </ChecklistItem>
        <ChecklistItem done={steps.password} label={t('firstRun.steps.password')}>
          {!steps.password && (
            <a href={settingsPath({ kind: 'defaults', page: 'security' })} className="text-xs text-hs-accent hover:underline">
              {t('firstRun.steps.passwordLink')}
            </a>
          )}
        </ChecklistItem>
      </ol>
    </section>
  );
}

function ChecklistItem({ done, label, note, children }: { done: boolean; label: string; note?: string; children?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {done
        ? <Check className="w-4 h-4 mt-0.5 shrink-0 text-hs-success" aria-hidden="true" />
        : <Circle className="w-4 h-4 mt-0.5 shrink-0 text-hs-text-faint" aria-hidden="true" />}
      <div className="min-w-0">
        <p className={`text-xs ${done ? 'text-hs-text-faint line-through' : 'text-hs-text-body'}`}>{label}</p>
        {note && <p className="text-xs text-hs-warning mt-0.5">{note}</p>}
        {children && <div className="mt-1">{children}</div>}
      </div>
    </li>
  );
}
