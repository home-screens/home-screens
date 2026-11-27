'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate, type TranslateFn } from '@/i18n';
import type { ScreenConfiguration } from '@/types/config';
import {
  listTouchSwitches,
  newCardsStartTouchOff,
  planTouchAll,
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

function whereText(item: TouchSwitch, t: TranslateFn): string | null {
  if (item.module) {
    const values = { module: resolveModuleLabel(item.module.type, t), screen: item.module.screenName, display: item.displayName ?? '' };
    return t(item.displayName ? `${K}.whereModuleDisplay` : `${K}.whereModule`, values);
  }
  return item.displayName ?? null;
}

function SwitchRows({ items, t }: { items: readonly TouchSwitch[]; t: TranslateFn }) {
  return (
    <ul>
      {items.map((item) => {
        const where = whereText(item, t);
        return (
          <li key={item.key} className="flex items-baseline justify-between gap-3 py-1 text-xs">
            <span className="min-w-0 text-hs-text-secondary">
              {t(item.labelKey)}
              {where && <span className="ml-2 text-[11px] text-hs-text-faint">{where}</span>}
            </span>
            <span className={item.on ? 'shrink-0 text-hs-text-muted' : 'shrink-0 text-hs-text-faint'}>
              {t(item.on ? `${K}.valueOn` : `${K}.valueOff`)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

interface TouchAllCardProps {
  config: ScreenConfiguration;
  /** The one display this box switches; leave out for every display. */
  displayId?: string;
  /** Called after a press or its Undo has reached the store, for a page that keeps its own copy of the settings. */
  onApplied?: () => void;
}

/**
 * Settings > Screen > Touch: All on and All off for every touch switch, on
 * every display or on one. The rules are in `src/lib/touch-all.ts`; this
 * shows where things stand, asks before a press and offers Undo after it.
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
  const display = displayId ? config.displays?.find((d) => d.id === displayId) : undefined;
  const displays = !displayId ? config.displays ?? [] : [];

  const [asking, setAsking] = useState<'on' | 'off' | null>(null);
  const [showOther, setShowOther] = useState(false);
  const [done, setDone] = useState<{ on: boolean; flipped: number; changes: TouchChange[] } | null>(null);

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

  const press = (on: boolean) => {
    const changes = planTouchAll(config, scope, on);
    setAsking(null);
    if (changes.length === 0) return;
    const flipped = switches.filter((s) => s.on !== on).length;
    // Nothing to see flipped (only how new modules start): no toast to undo.
    setDone(flipped > 0 ? { on, flipped, changes } : null);
    void commit(changes, 'forward');
  };

  // In a mix, the shorter list is the one worth reading: the few things that
  // differ from the rest. The other is one click away.
  const offItems = switches.filter((s) => !s.on);
  const onItems = switches.filter((s) => s.on);
  const fewer = offItems.length <= onItems.length ? offItems : onItems;
  const more = fewer === offItems ? onItems : offItems;

  const askingOn = asking === 'on';
  const areaRows = asking ? touchAreaCounts(switches, askingOn) : [];
  const changing = asking ? switches.filter((s) => s.on !== askingOn).length : 0;
  const addingNeedsSetup =
    askingOn && !config.settings.calendar?.eventEntry?.enabled && switches.some((s) => s.area === 'calendar');
  const name = display?.name ?? '';

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
            onChange={(v) => setAsking(v === 'on' ? 'on' : 'off')}
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

        {state === 'some' && displays.length > 1 && (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-hs-text-muted" data-testid="touch-all-displays">
            {displays.map((d) => {
              const own = switches.filter((s) => s.displayId === d.id);
              if (own.length === 0) return null;
              const on = own.filter((s) => s.on).length;
              return (
                <li key={d.id}>
                  {on === own.length
                    ? t(`${K}.displayAllOn`, { name: d.name })
                    : on === 0
                      ? t(`${K}.displayAllOff`, { name: d.name })
                      : t(`${K}.displaySome`, { name: d.name, on, total: own.length })}
                </li>
              );
            })}
          </ul>
        )}

        {state === 'some' && (
          <div className="mt-3 border-t border-hs-border pt-2" data-testid="touch-all-list">
            <SwitchRows items={fewer} t={t} />
            {showOther && <SwitchRows items={more} t={t} />}
            <button
              type="button"
              className="mt-1.5 text-[11px] text-hs-accent hover:text-hs-accent-hover"
              onClick={() => setShowOther((v) => !v)}
            >
              {showOther
                ? t(`${K}.showFewer`)
                : countText(t, more === onItems ? 'showOn' : 'showOff', more.length)}
            </button>
          </div>
        )}
      </div>

      {asking && (
        <ModalFrame labelledBy={titleId} onClose={() => setAsking(null)} className="max-w-md">
          <ModalPanel>
            <ModalHeader titleId={titleId} title={t(`${K}.${asking}Title`)} onClose={() => setAsking(null)} />
            <ModalBody>
              <p className="text-sm leading-relaxed text-hs-text-secondary">
                {t(`${K}.${asking}Body${displayId ? 'Display' : ''}`, { name })}
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
                onClick: () => press(askingOn),
                testId: 'touch-all-confirm',
              }}
            />
          </ModalPanel>
        </ModalFrame>
      )}

      {done && (
        <Toast
          testId="touch-all-toast"
          message={`${t(`${K}.toast${done.on ? 'On' : 'Off'}${displayId ? 'Display' : ''}`, { name })} ${countText(t, 'changed', done.flipped)}`}
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
