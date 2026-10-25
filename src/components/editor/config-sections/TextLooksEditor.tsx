'use client';

import { useMemo } from 'react';
import Button from '@/components/ui/Button';
import ColorPicker from '@/components/ui/ColorPicker';
import IconField from '@/components/ui/IconField';
import LabeledInput from '@/components/ui/LabeledInput';
import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import ConditionTreeEditor from '@/components/editor/ConditionTreeEditor';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { usePluginStore } from '@/stores/plugin-store';
import { useTranslate, useFormattingLocale, type TranslateFn } from '@/i18n';
import { useEditorSharedState, type EditorSharedState } from '@/hooks/useEditorSharedState';
import { useConditionClock } from '@/hooks/useConditionClock';
import { useStateKeyDescriptor } from '@/hooks/useStateKeySearch';
import { collectProvidedStateKeys } from '@/lib/provided-state-keys';
import { pluginHasStateKeySearch } from '@/lib/state-key-search';
import { validateModuleVisibility } from '@/lib/display-filter';
import { referencesStateKeys } from '@/lib/condition-verdicts';
import { describeConditions } from '@/lib/condition-summary';
import { lookSetsAnything, resolveTextLooks, type TextLookVerdict } from '@/lib/text-looks';
import { collectSourceKeys, type ScheduleClock } from '@/lib/schedule';
import type { ProvidedStateKey } from '@/lib/shared-state-types';
import type { LoadedPlugin } from '@/types/plugins';
import type { TextLook, VisibilityCondition } from '@/types/config';
import {
  RuleCard,
  RuleGroupLabel,
  moveRule,
  newRuleId,
  otherRuleNames,
  replaceRuleAt,
  useExpandedRules,
} from './RuleListCard';

/**
 * The Text module's Looks list: rules whose When half is the Visibility
 * panel's condition tree and whose Then half is a checklist of style changes.
 * Every edit writes the whole list back through `onChange`, so each change is
 * one autosave / one undo step. Evaluation for the status pills runs the same
 * `resolveTextLooks` the wall runs, over the display's last-reported snapshot
 * (or the editor's own bus when no display has reported).
 */

const KEY = 'configSections.textLooks';
const DEFAULT_LOOK_COLOR = '#3b82f6';
const DEFAULT_LOOK_BACKGROUND = 'rgba(59, 130, 246, 0.35)';
const DEFAULT_LOOK_FADE = 0.5;

/** A look's header verdict: the engine's four, plus "always" for a rule with no conditions that sets nothing yet. */
type PillVerdict = TextLookVerdict | 'always';

const PILL_CLASS: Record<PillVerdict, string> = {
  showing: 'bg-hs-success/15 text-hs-success border-hs-success/30',
  unmet: 'bg-hs-hover text-hs-text-dim border-hs-border-strong',
  unknown: 'bg-amber-600/15 text-amber-500 border-amber-600/30',
  overruled: 'bg-hs-hover text-hs-text-dim border-dashed border-hs-border-strong',
  always: 'bg-hs-hover text-hs-text-dim border-hs-border-strong',
};

function LookVerdictPill({ verdict, t }: { verdict: PillVerdict; t: TranslateFn }) {
  return (
    <span
      data-look-verdict={verdict}
      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${PILL_CLASS[verdict]}`}
      title={t(`${KEY}.verdictTitles.${verdict}`)}
    >
      {t(`${KEY}.verdicts.${verdict}`)}
    </span>
  );
}

/** The colors a look sets, as small squares in the card header. */
function LookSwatches({ look }: { look: TextLook }) {
  const colors = [look.textColor, look.borderColor, look.backgroundColor].filter((c): c is string => !!c);
  if (colors.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true" data-look-swatches="">
      {colors.map((c, i) => (
        <span key={i} className="h-3 w-3 rounded-sm border border-hs-border-strong" style={{ backgroundColor: c }} />
      ))}
    </span>
  );
}

function LookFields({
  look, onChange, options, liveState, plugins, now, t,
}: {
  look: TextLook;
  onChange: (next: TextLook) => void;
  options: readonly ProvidedStateKey[];
  liveState: EditorSharedState;
  plugins: Map<string, LoadedPlugin>;
  now: ScheduleClock;
  t: TranslateFn;
}) {
  const patch = (p: Partial<TextLook>) => onChange({ ...look, ...p });
  const validationError = useMemo(
    () => validateModuleVisibility({ conditions: look.when }, 'looks'),
    [look.when],
  );
  const fadePercent = Math.round((look.opacity ?? 1) * 100);

  return (
    <>
      <RuleGroupLabel>{t(`${KEY}.when`)}</RuleGroupLabel>
      <div className="space-y-2">
        {look.when.length === 0 && (
          <p className="text-xs text-hs-text-dim">{t(`${KEY}.noConditionsHint`)}</p>
        )}
        {validationError && (
          <div className="rounded border border-hs-danger/40 bg-hs-danger/10 p-2 space-y-1">
            <p className="text-xs text-hs-danger">{t('visibilityConditions.invalidHint')}</p>
            <p className="text-[10px] text-hs-text-dim">{validationError}</p>
          </div>
        )}
        <ConditionTreeEditor
          conditions={look.when}
          onChange={(when) => patch({ when })}
          options={options}
          liveState={liveState}
          plugins={plugins}
          unknownKeyHint={t(`${KEY}.sourceKeyUnknown`)}
          now={now}
          t={t}
        />
        {look.when.length > 1 && (
          <p className="text-[10px] text-hs-text-dim">{t(`${KEY}.allMustMatchHint`)}</p>
        )}
      </div>

      <RuleGroupLabel>{t(`${KEY}.then`)}</RuleGroupLabel>
      <div className="flex flex-col gap-1.5" data-look-then="">
        <Toggle
          label={t(`${KEY}.textColor`)}
          checked={look.textColor != null}
          onChange={(v) => patch({ textColor: v ? DEFAULT_LOOK_COLOR : undefined })}
        />
        {look.textColor != null && (
          <ColorPicker label={t(`${KEY}.color`)} value={look.textColor} onChange={(v) => patch({ textColor: v })} />
        )}
        <Toggle
          label={t(`${KEY}.borderColor`)}
          checked={look.borderColor != null}
          onChange={(v) => patch({ borderColor: v ? DEFAULT_LOOK_COLOR : undefined })}
        />
        {look.borderColor != null && (
          <ColorPicker label={t(`${KEY}.color`)} value={look.borderColor} onChange={(v) => patch({ borderColor: v })} />
        )}
        <Toggle
          label={t(`${KEY}.background`)}
          checked={look.backgroundColor != null}
          onChange={(v) => patch({ backgroundColor: v ? DEFAULT_LOOK_BACKGROUND : undefined })}
        />
        {look.backgroundColor != null && (
          <ColorPicker
            label={t(`${KEY}.color`)}
            value={look.backgroundColor}
            onChange={(v) => patch({ backgroundColor: v })}
            showAlpha
            alphaLabel={t('propertyPanel.fields.colorAlpha')}
          />
        )}
        <Toggle
          label={t(`${KEY}.icon`)}
          checked={look.icon != null}
          onChange={(v) => patch({ icon: v ? '⚠️' : undefined })}
        />
        {look.icon != null && (
          <IconField label={t(`${KEY}.iconLabel`)} value={look.icon} onChange={(v) => patch({ icon: v ?? '' })} />
        )}
        <Toggle
          label={t(`${KEY}.showTextAs`)}
          checked={look.text != null}
          onChange={(v) => patch({ text: v ? '' : undefined })}
        />
        {look.text != null && (
          <div className="flex flex-col gap-0.5">
            <LabeledInput
              label={t(`${KEY}.words`)}
              value={look.text}
              onChange={(v) => patch({ text: v })}
              placeholder={t(`${KEY}.wordsPlaceholder`)}
            />
            <p className="text-[10px] text-hs-text-dim">{t(`${KEY}.wordsHint`)}</p>
          </div>
        )}
        <Toggle
          label={t(`${KEY}.fade`)}
          checked={look.opacity != null}
          onChange={(v) => patch({ opacity: v ? DEFAULT_LOOK_FADE : undefined })}
        />
        {look.opacity != null && (
          <Slider
            label={t(`${KEY}.fadeAmount`)}
            value={fadePercent}
            min={10}
            max={100}
            step={5}
            displayValue={`${fadePercent}%`}
            onChange={(v) => patch({ opacity: v / 100 })}
          />
        )}
        {!lookSetsAnything(look) && (
          <p className="text-[11px] text-hs-warning" data-look-sets-nothing="">{t(`${KEY}.nothingSetHint`)}</p>
        )}
      </div>
    </>
  );
}

/** One card: header summary, swatches and verdict pill, plus the fields when open. */
function LookCard({
  look, index, total, otherNames, expanded, verdict, onToggle, onRename, onMove, onRemove, onChange,
  options, liveState, plugins, now, t,
}: {
  look: TextLook;
  index: number;
  total: number;
  otherNames: string[];
  expanded: boolean;
  /** null when no live values are trustworthy and the look reads a key. */
  verdict: PillVerdict | null;
  onToggle: () => void;
  onRename: (name: string | undefined) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  onChange: (next: TextLook) => void;
  options: readonly ProvidedStateKey[];
  liveState: EditorSharedState;
  plugins: Map<string, LoadedPlugin>;
  now: ScheduleClock;
  t: TranslateFn;
}) {
  const formattingLocale = useFormattingLocale();
  const timeFormat = useEditorStore((s) => s.config?.settings.timeFormat);
  // The first key the look reads gets its friendly name from the plugin
  // search (a Home Assistant entity reads "Bedroom temperature", not its id).
  // One lookup per card; the cache behind the hook collapses repeats.
  const firstKey = useMemo(() => {
    const keys = new Set<string>();
    collectSourceKeys(look.when, keys);
    keys.delete('');
    return keys.values().next().value ?? '';
  }, [look.when]);
  const descriptor = useStateKeyDescriptor(firstKey);
  const summary = useMemo(() => describeConditions(look.when, {
    t,
    formattingLocale,
    timeFormat,
    labelFor: (key) => {
      if (descriptor && descriptor.key === key) return descriptor.label;
      return options.find((o) => o.key === key)?.label;
    },
  }), [look.when, t, formattingLocale, timeFormat, descriptor, options]);

  return (
    <RuleCard
      index={index}
      total={total}
      name={look.name}
      expanded={expanded}
      onToggle={onToggle}
      onRename={onRename}
      otherNames={otherNames}
      onMove={onMove}
      onRemove={onRemove}
      defaultName={t('draggableModule.status.lookUnnamed', { n: index + 1 })}
      summary={summary}
      trailing={(
        <>
          <LookSwatches look={look} />
          {verdict && <LookVerdictPill verdict={verdict} t={t} />}
        </>
      )}
    >
      <LookFields
        look={look}
        onChange={onChange}
        options={options}
        liveState={liveState}
        plugins={plugins}
        now={now}
        t={t}
      />
    </RuleCard>
  );
}

export function TextLooksEditor({ looks, onChange }: {
  looks: TextLook[] | undefined;
  onChange: (looks: TextLook[] | undefined) => void;
}) {
  const t = useTranslate('editor');
  const list = useMemo(() => looks ?? [], [looks]);
  const setList = (next: TextLook[]) => onChange(next.length > 0 ? next : undefined);

  const config = useEditorStore((s) => s.config);
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  const plugins = usePluginStore((s) => s.plugins);

  // Same known-keys source as the Visibility panel and the content's token
  // picker, so the three never disagree about which keys exist here.
  const providedKeys = useMemo(
    () => (config
      ? collectProvidedStateKeys(getActiveScreens(config, selectedDisplayId), { t, settings: config.settings })
      : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plugins triggers the recompute; collectProvidedStateKeys reads the registry, not the map. Matches VisibilityConditionsSection.
    [config, selectedDisplayId, plugins, t],
  );
  const searchAvailable = useMemo(
    () => Array.from(plugins.values()).some(pluginHasStateKeySearch),
    [plugins],
  );

  // Every condition across every look, for the live-value poll gate, the
  // clock tick and the "no verdict" decision. Polling only starts once a look
  // reads a key, for the same reason the Visibility panel gates its poll.
  const allConditions = useMemo<VisibilityCondition[]>(() => list.flatMap((l) => l.when), [list]);
  const readsKeys = referencesStateKeys(allConditions);
  const liveState = useEditorSharedState(selectedDisplayId, readsKeys);
  const householdTimezone = useEditorHouseholdTimezone();
  const now = useConditionClock(allConditions, householdTimezone);
  const result = useMemo(
    () => resolveTextLooks(list, liveState.states, now),
    [list, liveState.states, now],
  );

  const { expanded, toggle, expand } = useExpandedRules();
  // The same name the canvas chip gives an unnamed look ("Look 2"), so one
  // look is never "Rule 2" in this list and "Look 2" on the canvas.
  const lookTitle = (n: number) => t('draggableModule.status.lookUnnamed', { n });

  const pillFor = (look: TextLook): PillVerdict | null => {
    if (look.when.length === 0 && !lookSetsAnything(look)) return 'always';
    const verdict = result.verdicts.get(look.id) ?? null;
    // With no live values at all, the evaluator leaves a key-reading look and
    // everything under it undecided. That is no verdict, not "waiting": a
    // Waiting pill is for a key a display has not published yet. Looks above
    // that point are judged on the household clock and keep their pill.
    if (verdict === 'unknown' && liveState.states === null) return null;
    return verdict;
  };

  return (
    <div className="flex flex-col gap-2" data-text-looks="">
      <p className="text-[11px] text-hs-text-muted">{t(`${KEY}.hint`)}</p>
      {providedKeys.length === 0 && !searchAvailable && (
        <p className="text-xs text-hs-warning">{t('visibilityConditions.noProvidersHint')}</p>
      )}
      {list.length === 0 && (
        <p className="text-xs text-hs-text-dim">{t(`${KEY}.empty`)}</p>
      )}
      {list.map((look, i) => (
        <LookCard
          key={look.id}
          look={look}
          index={i}
          total={list.length}
          otherNames={otherRuleNames(list, i, lookTitle)}
          expanded={expanded.has(look.id)}
          verdict={pillFor(look)}
          onToggle={() => toggle(look.id)}
          onRename={(name) => setList(replaceRuleAt(list, i, { ...look, name }))}
          onMove={(to) => setList(moveRule(list, i, to))}
          onRemove={() => setList(list.filter((l) => l.id !== look.id))}
          onChange={(next) => setList(replaceRuleAt(list, i, next))}
          options={providedKeys}
          liveState={liveState}
          plugins={plugins}
          now={now}
          t={t}
        />
      ))}
      <Button variant="secondary" size="sm" onClick={() => {
        const id = newRuleId();
        setList([...list, { id, when: [] }]);
        expand(id);
      }}>
        {t(`${KEY}.addLook`)}
      </Button>
    </div>
  );
}
