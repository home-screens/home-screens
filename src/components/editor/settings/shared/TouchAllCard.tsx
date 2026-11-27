'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Undo2 } from 'lucide-react';
import TouchScreenList from './TouchScreenList';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate, type TranslateFn } from '@/i18n';
import type { ScreenConfiguration } from '@/types/config';
import {
  listTouchSwitches,
  newCardsStartTouchOff,
  planTouchAll,
  planTouchSwitches,
  touchAreaCounts,
  touchState,
  type TouchChange,
  type TouchSwitch,
} from '@/lib/touch-all';
import { resolveModuleLabel } from '@/lib/module-registry';
import { settingsPlaceText } from '@/lib/settings-route';
import { UNDO_WINDOW_MS } from '@/lib/undo-window';
import ModalFrame, { ModalBody, ModalFooter, ModalHeader, ModalPanel } from '@/components/ui/ModalFrame';
import SegmentedControl from '@/components/ui/SegmentedControl';
import StatusDot from '@/components/ui/StatusDot';
import Toast from '@/components/ui/Toast';
import FieldHint from '@/components/ui/FieldHint';

const K = 'settings.touchAll';

/** "3 turn on", "1 turns off": the dictionary keeps one and many apart. */
function countText(t: TranslateFn, key: string, count: number): string {
  return t(`${K}.${key}${count === 1 ? 'One' : 'Other'}`, { count });
}

interface TouchAllCardProps {
  config: ScreenConfiguration;
  /** The one display this box switches; leave out for every display. */
  displayId?: string;
  /** Called after a press or its Undo has reached the store, for a page that keeps its own copy of the settings. */
  onApplied?: () => void;
}

/** A press waiting on its question: everything in the box, or one display picked from the list. */
interface Asking {
  on: boolean;
  displayId?: string;
}

/**
 * Settings > Screen > Touch: All on and All off for every touch switch, on
 * every display or on one, and under them a list that flips one screen or one
 * switch at a time. The rules are in `src/lib/touch-all.ts`; this shows where
 * things stand, asks before a big press and offers Undo after it.
 */
export default function TouchAllCard({ config, displayId, onApplied }: TouchAllCardProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const applyTouchChanges = useEditorStore((s) => s.applyTouchChanges);
  const saveConfig = useEditorStore((s) => s.saveConfig);
  const titleId = useId();

  const scope = useMemo(() => ({ displayId }), [displayId]);
  const switches = useMemo(() => listTouchSwitches(config, scope), [config, scope]);
  const state = touchState(switches);
  const onCount = switches.filter((s) => s.on).length;
  const severalDisplays = !displayId && (config.displays?.length ?? 0) > 1;

  const [asking, setAsking] = useState<Asking | null>(null);
  const [done, setDone] = useState<{ message: string; changes: TouchChange[] } | null>(null);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [done]);

  const commit = useCallback(
    async (changes: readonly TouchChange[], direction: 'forward' | 'back') => {
      applyTouchChanges(changes, direction);
      onApplied?.();
      await saveConfig();
    },
    [applyTouchChanges, onApplied, saveConfig],
  );

  // What the question on screen is about: the whole box, or the one display
  // whose On / Off was pressed in the list.
  const askedDisplayId = asking?.displayId ?? displayId;
  const askedSwitches = asking?.displayId ? switches.filter((s) => s.displayId === asking.displayId) : switches;
  const askedName = askedDisplayId ? config.displays?.find((d) => d.id === askedDisplayId)?.name ?? '' : '';

  const press = () => {
    if (!asking) return;
    const { on } = asking;
    const changes = planTouchAll(config, { displayId: askedDisplayId }, on);
    const flipped = askedSwitches.filter((s) => s.on !== on).length;
    setAsking(null);
    if (changes.length === 0) return;
    // Nothing to see flipped (only how new modules start): no toast to undo.
    setDone(
      flipped > 0
        ? {
            message: `${t(`${K}.toast${on ? 'On' : 'Off'}${askedDisplayId ? 'Display' : ''}`, { name: askedName })} ${countText(t, 'changed', flipped)}`,
            changes,
          }
        : null,
    );
    void commit(changes, 'forward');
  };

  const flip = (items: readonly TouchSwitch[], on: boolean, undoName?: string) => {
    const changes = planTouchSwitches(config, items, on);
    if (changes.length === 0) return;
    const flipped = items.filter((s) => s.on !== on).length;
    setDone(
      undoName
        ? { message: `${t(`${K}.toast${on ? 'On' : 'Off'}Display`, { name: undoName })} ${countText(t, 'changed', flipped)}`, changes }
        : null,
    );
    void commit(changes, 'forward');
  };

  const askingOn = asking?.on ?? false;
  const areaRows = asking ? touchAreaCounts(askedSwitches, askingOn) : [];
  const changing = asking ? askedSwitches.filter((s) => s.on !== askingOn).length : 0;
  const addingNeedsSetup =
    askingOn && !config.settings.calendar?.eventEntry?.enabled && askedSwitches.some((s) => s.area === 'calendar');
  const askWord = askingOn ? 'on' : 'off';

  const stateText =
    state === 'none'
      ? t(`${K}.stateNone`)
      : t(`${K}.state${state === 'on' ? 'On' : state === 'off' ? 'Off' : 'Some'}${displayId && state !== 'some' ? 'Display' : ''}`);

  return (
    <div className="mb-5" data-field-id="display.touchAll" data-testid="touch-all-card">
      <div className="rounded-lg border border-hs-border bg-hs-panel/40 px-4 py-3.5">
        <h3 className="text-sm font-semibold text-hs-text-primary">{t(displayId ? `${K}.titleDisplay` : `${K}.title`)}</h3>
        <FieldHint className="mt-0.5 mb-3">{t(displayId ? `${K}.helpDisplay` : `${K}.help`)}</FieldHint>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SegmentedControl<string>
            fit="content"
            label={t(`${K}.title`)}
            value={state === 'on' ? 'on' : state === 'off' ? 'off' : ''}
            disabled={state === 'none'}
            onChange={(v) => setAsking({ on: v === 'on' })}
            options={[
              { value: 'on', label: t(`${K}.allOn`), testId: 'touch-all-on' },
              { value: 'off', label: t(`${K}.allOff`), testId: 'touch-all-off' },
            ]}
          />
          <div className="min-w-0 text-xs text-hs-text-secondary" data-testid="touch-all-state" data-state={state}>
            <span className="inline-flex items-center gap-1.5">
              <StatusDot tone={state === 'on' ? 'success' : state === 'some' ? 'warning' : 'neutral'} />
              {stateText}
            </span>
            {state !== 'none' && (
              <div className="mt-0.5 text-[11px] text-hs-text-faint">
                {t(`${K}.count`, { on: onCount, total: switches.length })}
                {newCardsStartTouchOff(config, displayId) && ` ${t(`${K}.newCardsOff`)}`}
              </div>
            )}
          </div>
        </div>

        {state !== 'none' && (
          <TouchScreenList
            switches={switches}
            showDisplays={severalDisplays}
            onFlip={flip}
            onAskDisplay={(id, on) => setAsking({ on, displayId: id })}
          />
        )}
      </div>

      {asking && (
        <ModalFrame labelledBy={titleId} onClose={() => setAsking(null)} className="max-w-md">
          <ModalPanel>
            <ModalHeader titleId={titleId} title={t(`${K}.${askWord}Title`)} onClose={() => setAsking(null)} />
            <ModalBody>
              <p className="text-sm leading-relaxed text-hs-text-secondary">
                {t(`${K}.${askWord}Body${askedDisplayId ? 'Display' : ''}`, { name: askedName })}
              </p>
              <ul className="mt-3 divide-y divide-hs-border rounded-lg border border-hs-border bg-hs-input" data-testid="touch-all-areas">
                {areaRows.map((row) => (
                  <li key={row.area} className="flex items-baseline justify-between gap-3 px-3 py-2 text-xs">
                    <span className="text-hs-text-secondary">{t(`${K}.areas.${row.area}`)}</span>
                    <span className="shrink-0 text-hs-text-faint">
                      {row.changing === 0
                        ? t(askingOn ? `${K}.alreadyOn` : `${K}.alreadyOff`)
                        : countText(t, askingOn ? 'turnOn' : 'turnOff', row.changing)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-relaxed text-hs-text-muted">
                <strong className="font-semibold text-hs-text-body">
                  {changing === 0
                    ? t(askingOn ? `${K}.totalOnNone` : `${K}.totalOffNone`)
                    : countText(t, askingOn ? 'totalOn' : 'totalOff', changing)}
                </strong>{' '}
                {askingOn
                  ? addingNeedsSetup && t(`${K}.onNote`, { place: settingsPlaceText(tCore, 'calendar') })
                  : t(`${K}.offNote`, {
                      control: resolveModuleLabel('display-control', t),
                      timer: resolveModuleLabel('quick-timer', t),
                      web: resolveModuleLabel('iframe', t),
                    })}
              </p>
            </ModalBody>
            <ModalFooter
              onCancel={() => setAsking(null)}
              primary={{
                label: t(askingOn ? `${K}.confirmOn` : `${K}.confirmOff`),
                onClick: press,
                testId: 'touch-all-confirm',
              }}
            />
          </ModalPanel>
        </ModalFrame>
      )}

      {done && (
        <Toast
          testId="touch-all-toast"
          message={done.message}
          action={{
            label: t(`${K}.undo`),
            icon: Undo2,
            onClick: () => {
              const { changes } = done;
              setDone(null);
              void commit(changes, 'back');
            },
          }}
          onDismiss={() => setDone(null)}
          dismissLabel={t(`${K}.dismiss`)}
        />
      )}
    </div>
  );
}
