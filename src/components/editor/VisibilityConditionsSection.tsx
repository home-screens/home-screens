'use client';

import { useId, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import Toggle from '@/components/ui/Toggle';
import PropertyGroup from './PropertyGroup';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { useTranslate, useFormattingLocale, formatRelativeTime, type TranslateFn } from '@/i18n';
import { useDisplaySharedState, type DisplaySharedState } from '@/hooks/useDisplaySharedState';
import { collectProvidedStateKeys } from '@/lib/provided-state-keys';
import { MAX_CONDITION_DEPTH, validateModuleVisibility } from '@/lib/display-filter';
import { SHARED_STATE_KEY_RE, type ProvidedStateKey } from '@/lib/shared-state-types';
import type { ModuleInstance, ModuleVisibility, VisibilityCondition } from '@/types/config';

const CONDITION_KINDS = ['state', 'numeric', 'and', 'or', 'not'] as const;

/**
 * New conditions start blank — an empty sourceKey is saveable (the validator
 * allows it; the runtime treats it as unknown, so whenUnknown governs) and
 * forces a deliberate key choice instead of silently prefilling the first
 * advertised provider key, which read as "copied from my other condition".
 */
function defaultCondition(kind: VisibilityCondition['kind']): VisibilityCondition {
  switch (kind) {
    case 'state':
      return { kind: 'state', sourceKey: '', equals: '' };
    case 'numeric':
      return { kind: 'numeric', sourceKey: '' };
    default:
      return { kind, conditions: [defaultCondition('state')] };
  }
}

function firstLeafSourceKey(conditions: VisibilityCondition[]): string | undefined {
  for (const c of conditions) {
    if (c.kind === 'state' || c.kind === 'numeric') return c.sourceKey;
    const nested = firstLeafSourceKey(c.conditions);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

/**
 * Convert a condition to another kind without destroying entered data:
 * group ↔ group keeps children, leaf → group wraps the existing leaf as the
 * first child, group → leaf recovers the first leaf descendant's sourceKey.
 * Exported for tests.
 */
export function convertConditionKind(
  prev: VisibilityCondition,
  kind: VisibilityCondition['kind'],
  defaultKey: string,
): VisibilityCondition {
  if (kind === prev.kind) return prev;
  const prevIsLeaf = prev.kind === 'state' || prev.kind === 'numeric';
  if (kind === 'and' || kind === 'or' || kind === 'not') {
    return { kind, conditions: prevIsLeaf ? [prev] : prev.conditions };
  }
  const sourceKey = prevIsLeaf
    ? prev.sourceKey
    : firstLeafSourceKey(prev.conditions) ?? defaultKey;
  return kind === 'state'
    ? { kind: 'state', sourceKey, equals: '' }
    : { kind: 'numeric', sourceKey };
}

/** "open" ↔ 'open'; "open, alert" ↔ ['open', 'alert'] (HA array = matches-any). */
function parseValueList(raw: string): string | string[] {
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts : (parts[0] ?? '');
}

function formatValueList(value: string | string[] | undefined): string {
  if (value === undefined) return '';
  return Array.isArray(value) ? value.join(', ') : value;
}

/** Non-finite parses (empty, `1e999`) become "no bound" instead of an unsaveable Infinity. */
function parseBound(raw: string): number | undefined {
  if (raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Keystroke state stays local to the input; the store (and therefore the
 * 800ms autosave → 3s display poll pipeline) only sees the value on blur or
 * Enter. Mid-edit keys like "plugin:home-assis" are charset-valid and
 * saveable, so per-keystroke commits made the display hide the edited module
 * until typing finished — visible as flicker on the kiosk.
 */
function useCommitOnBlur(value: string, commit: (next: string) => void) {
  const [draft, setDraft] = useState(value);
  // Reset the draft when the committed value changes underneath us — the
  // inputs are reused across condition/module selection (keyed by index).
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }
  // For deliberate selections (dropdown pick) that should commit immediately
  // rather than wait for blur.
  const commitNow = (next: string) => {
    setDraft(next);
    if (next !== value) commit(next);
  };
  return {
    draft,
    commitNow,
    inputProps: {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
      onBlur: () => {
        if (draft !== value) commit(draft);
      },
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      },
    },
  };
}

/** Exported for tests. */
export function SourceKeyInput({
  value,
  onChange,
  options,
  liveState,
  t,
}: {
  value: string;
  onChange: (key: string) => void;
  options: readonly ProvidedStateKey[];
  liveState?: DisplaySharedState;
  t: TranslateFn;
}) {
  const formattingLocale = useFormattingLocale();
  const listboxId = useId();
  const { draft, commitNow, inputProps } = useCommitOnBlur(value, onChange);
  // Custom suggestion dropdown instead of a native <datalist>: browsers only
  // open a datalist on arrow-down/double-click once the field has been
  // touched (and there is no API to force it), so the suggestions were
  // effectively invisible. This one opens on focus and while typing.
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  // Empty is not invalid — it's an incomplete condition still being authored
  // (evaluates as unknown; whenUnknown governs until a key is picked).
  const invalid = draft !== '' && !SHARED_STATE_KEY_RE.test(draft);
  const known = options.some((o) => o.key === draft);
  // Charset-valid but not advertised by any provider on this display —
  // either the publishing module isn't configured yet (condition authored
  // first) or the key is a typo (e.g. missing the plugin: namespace). Both
  // leave the condition permanently "unknown", which default-hides the
  // module with no other feedback, so surface it here as a soft warning.
  const unknown = !invalid && draft !== '' && !known;
  // Live value straight from the display's last heartbeat — kills the
  // "which exact string do I match against?" guessing game.
  const liveEntry = liveState?.entries[draft];

  // A draft that exactly matches a provided key (typical right after a pick)
  // shows the full list so the user can still switch; otherwise filter.
  const query = draft.trim().toLowerCase();
  const suggestions = query === '' || known
    ? options
    : options.filter(
        (o) => o.key.toLowerCase().includes(query) || o.label.toLowerCase().includes(query),
      );
  const listOpen = open && suggestions.length > 0;

  const close = () => {
    setOpen(false);
    setHighlight(-1);
  };
  const pick = (key: string) => {
    commitNow(key);
    close();
  };

  return (
    // A div, not a label: a wrapping label forwards clicks anywhere in the
    // block (caption, hint, live-value line) to the input, which focuses it
    // and pops the dropdown. Only the text box itself should engage it, so
    // the input is named via aria-label instead.
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-hs-text-muted">{t('visibilityConditions.sourceKeyLabel')}</span>
      <span className="text-[10px] text-hs-text-dim">{t('visibilityConditions.sourceKeyHint')}</span>
      <div className="relative">
        <input
          type="text"
          placeholder={t('visibilityConditions.sourceKeyPlaceholder')}
          aria-label={t('visibilityConditions.sourceKeyLabel')}
          {...inputProps}
          onFocus={() => {
            setOpen(true);
            setHighlight(-1);
          }}
          onChange={(e) => {
            inputProps.onChange(e);
            setOpen(true);
            setHighlight(-1);
          }}
          onBlur={() => {
            close();
            inputProps.onBlur();
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && suggestions.length > 0) {
              e.preventDefault();
              setOpen(true);
              setHighlight((h) => (h + 1) % suggestions.length);
              return;
            }
            if (e.key === 'ArrowUp' && suggestions.length > 0) {
              e.preventDefault();
              setOpen(true);
              setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
              return;
            }
            if (e.key === 'Escape') {
              close();
              return;
            }
            if (e.key === 'Enter' && listOpen && highlight >= 0 && suggestions[highlight]) {
              e.preventDefault();
              pick(suggestions[highlight].key);
              return;
            }
            inputProps.onKeyDown(e);
          }}
          className={`${INPUT_CLASS} w-full ${invalid ? 'border-hs-danger' : ''}`}
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
        />
        {listOpen && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={t('visibilityConditions.sourceKeyLabel')}
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded border border-hs-border-strong bg-hs-card py-1 shadow-lg"
          >
            {suggestions.map((o, i) => (
              <li
                key={o.key}
                role="option"
                aria-selected={i === highlight}
                // preventDefault on mousedown keeps the input focused — a
                // blur here would commit the half-typed draft and unmount
                // the list before the click could land on the option.
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  pick(o.key);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`cursor-pointer px-2 py-1 ${i === highlight ? 'bg-hs-hover' : ''}`}
              >
                <div className="font-mono text-xs text-hs-text-muted">{o.key}</div>
                <div className="text-[10px] text-hs-text-dim">
                  {o.sampleValues?.length ? `${o.label} (${o.sampleValues.join(', ')})` : o.label}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {invalid && (
        <span className="text-[10px] text-hs-danger">{t('visibilityConditions.sourceKeyInvalid')}</span>
      )}
      {liveEntry && (
        <span className="text-[10px] text-hs-text-dim">
          {t('visibilityConditions.liveValueLabel')}{' '}
          <code className="rounded bg-hs-hover px-1 font-mono text-hs-text-muted">
            {liveEntry.value === '' ? '""' : liveEntry.value}
          </code>
          {' · '}
          {formatRelativeTime(
            // Display and hub clocks can be skewed; never show a future age.
            Math.min(liveEntry.updatedAt, Date.now()),
            Date.now(),
            { locale: formattingLocale },
          )}
        </span>
      )}
      {unknown && !liveEntry && (
        <span className="text-[10px] text-hs-warning">{t('visibilityConditions.sourceKeyUnknown')}</span>
      )}
    </div>
  );
}

/** Exported for tests. */
export function ConditionValueInput({
  value,
  onCommit,
  placeholder,
}: {
  value: string;
  onCommit: (raw: string) => void;
  placeholder: string;
}) {
  const { inputProps } = useCommitOnBlur(value, onCommit);
  return <input type="text" placeholder={placeholder} {...inputProps} className={INPUT_CLASS} />;
}

/**
 * Numeric bound (above/below) input, blur-committed like every other
 * condition input: a half-typed value ("-", "1e") parses to "no bound",
 * which per-keystroke commits would push through autosave and transiently
 * flip the gated module's visibility on the display. Exported for tests.
 */
export function ConditionBoundInput({
  value,
  onCommit,
  label,
}: {
  value: number | undefined;
  onCommit: (bound: number | undefined) => void;
  label: string;
}) {
  const { inputProps } = useCommitOnBlur(
    value === undefined ? '' : String(value),
    (raw) => onCommit(parseBound(raw)),
  );
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-hs-text-muted">{label}</span>
      <input type="number" {...inputProps} className={INPUT_CLASS} />
    </label>
  );
}

/**
 * True when the committed match value(s) miss the live value only by letter
 * case — the exact failure mode of matching a card label ("Clear") against a
 * raw HA state ("clear"). Exported for tests.
 */
export function isCaseOnlyMismatch(
  expected: string | string[] | undefined,
  liveValue: string | undefined,
): boolean {
  if (expected === undefined || liveValue === undefined) return false;
  const list = Array.isArray(expected) ? expected : [expected];
  if (list.includes(liveValue)) return false;
  const lower = liveValue.toLowerCase();
  return list.some((v) => v.toLowerCase() === lower);
}

function ConditionEditor({
  condition,
  onChange,
  onRemove,
  options,
  liveState,
  depth,
  t,
}: {
  condition: VisibilityCondition;
  onChange: (next: VisibilityCondition) => void;
  onRemove: () => void;
  options: readonly ProvidedStateKey[];
  liveState?: DisplaySharedState;
  depth: number;
  t: TranslateFn;
}) {
  const isGroup = condition.kind === 'and' || condition.kind === 'or' || condition.kind === 'not';
  const allowGroups = depth < MAX_CONDITION_DEPTH - 1;

  return (
    <div className="rounded border border-hs-border-strong bg-hs-card p-2 space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={condition.kind}
          onChange={(e) =>
            onChange(convertConditionKind(condition, e.target.value as VisibilityCondition['kind'], ''))
          }
          className={`${INPUT_CLASS} flex-1`}
          aria-label={t('visibilityConditions.kindLabel')}
        >
          {CONDITION_KINDS.filter((k) => allowGroups || k === 'state' || k === 'numeric').map((k) => (
            <option key={k} value={k}>{t(`visibilityConditions.kinds.${k}`)}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded text-hs-text-faint hover:text-hs-danger hover:bg-hs-hover"
          aria-label={t('visibilityConditions.removeCondition')}
        >
          <X size={14} />
        </button>
      </div>

      {condition.kind === 'state' && (
        <div className="space-y-2">
          <SourceKeyInput
            value={condition.sourceKey}
            onChange={(sourceKey) => onChange({ ...condition, sourceKey })}
            options={options}
            liveState={liveState}
            t={t}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-hs-text-muted">{t('visibilityConditions.matchLabel')}</span>
              <select
                value={condition.notEquals !== undefined ? 'notEquals' : 'equals'}
                onChange={(e) => {
                  const raw = formatValueList(condition.equals ?? condition.notEquals);
                  onChange(
                    e.target.value === 'equals'
                      ? { kind: 'state', sourceKey: condition.sourceKey, equals: parseValueList(raw) }
                      : { kind: 'state', sourceKey: condition.sourceKey, notEquals: parseValueList(raw) },
                  );
                }}
                className={INPUT_CLASS}
              >
                <option value="equals">{t('visibilityConditions.matchEquals')}</option>
                <option value="notEquals">{t('visibilityConditions.matchNotEquals')}</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-hs-text-muted">{t('visibilityConditions.valueLabel')}</span>
              <ConditionValueInput
                value={formatValueList(condition.equals ?? condition.notEquals)}
                placeholder={t('visibilityConditions.valuePlaceholder')}
                onCommit={(raw) => {
                  const parsed = parseValueList(raw);
                  onChange(
                    condition.notEquals !== undefined
                      ? { kind: 'state', sourceKey: condition.sourceKey, notEquals: parsed }
                      : { kind: 'state', sourceKey: condition.sourceKey, equals: parsed },
                  );
                }}
              />
            </label>
          </div>
          {isCaseOnlyMismatch(
            condition.equals ?? condition.notEquals,
            liveState?.entries[condition.sourceKey]?.value,
          ) && (
            <p className="text-[10px] text-hs-warning">
              {t('visibilityConditions.caseMismatchWarning', {
                value: liveState!.entries[condition.sourceKey]!.value,
              })}
            </p>
          )}
          <p className="text-[10px] text-hs-text-dim">{t('visibilityConditions.valueListHint')}</p>
        </div>
      )}

      {condition.kind === 'numeric' && (
        <div className="space-y-2">
          <SourceKeyInput
            value={condition.sourceKey}
            onChange={(sourceKey) => onChange({ ...condition, sourceKey })}
            options={options}
            liveState={liveState}
            t={t}
          />
          <div className="grid grid-cols-2 gap-2">
            <ConditionBoundInput
              label={t('visibilityConditions.aboveLabel')}
              value={condition.above}
              onCommit={(above) => onChange({ ...condition, above })}
            />
            <ConditionBoundInput
              label={t('visibilityConditions.belowLabel')}
              value={condition.below}
              onCommit={(below) => onChange({ ...condition, below })}
            />
          </div>
        </div>
      )}

      {isGroup && (
        <div className="space-y-2 pl-2 border-l border-hs-border-strong">
          {condition.conditions.map((child, i) => (
            <ConditionEditor
              key={i}
              condition={child}
              depth={depth + 1}
              options={options}
              liveState={liveState}
              t={t}
              onChange={(next) => {
                const conditions = condition.conditions.slice();
                conditions[i] = next;
                onChange({ ...condition, conditions });
              }}
              onRemove={() => {
                const conditions = condition.conditions.filter((_, j) => j !== i);
                // A group must keep at least one child — removing the last removes the group.
                if (conditions.length === 0) onRemove();
                else onChange({ ...condition, conditions });
              }}
            />
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...condition, conditions: [...condition.conditions, defaultCondition('state')] })}
            className="flex items-center gap-1 text-xs text-hs-accent hover:underline"
          >
            <Plus size={12} /> {t('visibilityConditions.addCondition')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function VisibilityConditionsSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const config = useEditorStore((s) => s.config);
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  const updateModule = useEditorStore((s) => s.updateModule);
  // Live values from the selected display's last heartbeat, for the
  // current-value hint and case-mismatch warning on condition inputs.
  const liveState = useDisplaySharedState(selectedDisplayId);

  const providedKeys = useMemo(
    () => collectProvidedStateKeys(config ? getActiveScreens(config, selectedDisplayId) : []),
    [config, selectedDisplayId],
  );

  const visibility = mod.visibility;
  const enabled = !!visibility;

  // Mirrors exactly what the config write gate will reject — a safety net on
  // top of the per-field checks, so nothing unsaveable goes unexplained.
  const validationError = useMemo(
    () => validateModuleVisibility(visibility, 'visibility'),
    [visibility],
  );

  const setVisibility = (next: ModuleVisibility | undefined) =>
    updateModule(screenId, mod.id, { visibility: next });

  const setConditions = (conditions: VisibilityCondition[]) =>
    setVisibility({ ...(visibility ?? {}), conditions });

  return (
    <div className="space-y-3">
      <PropertyGroup title={t('visibilityConditions.statusTitle')} accent={1}>
        <Toggle
          label={t('visibilityConditions.enableLabel')}
          checked={enabled}
          onChange={(on) =>
            // Empty conditions = always visible; a valid, saveable starting point.
            setVisibility(on ? { conditions: [] } : undefined)
          }
        />
        <p className="text-xs text-hs-text-dim mt-1">{t('visibilityConditions.enableHelp')}</p>
      </PropertyGroup>

      {enabled && visibility && (
        <>
          <PropertyGroup title={t('visibilityConditions.conditionsTitle')} accent={2}>
            <div className="space-y-2">
              {providedKeys.length === 0 && (
                <p className="text-xs text-hs-warning">{t('visibilityConditions.noProvidersHint')}</p>
              )}
              {visibility.conditions.length === 0 && (
                <p className="text-xs text-hs-text-dim">{t('visibilityConditions.noConditionsHint')}</p>
              )}
              {validationError && (
                <div className="rounded border border-hs-danger/40 bg-hs-danger/10 p-2 space-y-1">
                  <p className="text-xs text-hs-danger">{t('visibilityConditions.invalidHint')}</p>
                  <p className="text-[10px] text-hs-text-dim">{validationError}</p>
                </div>
              )}
              {visibility.conditions.map((condition, i) => (
                <ConditionEditor
                  key={i}
                  condition={condition}
                  depth={0}
                  options={providedKeys}
                  liveState={liveState}
                  t={t}
                  onChange={(next) => {
                    const conditions = visibility.conditions.slice();
                    conditions[i] = next;
                    setConditions(conditions);
                  }}
                  onRemove={() => setConditions(visibility.conditions.filter((_, j) => j !== i))}
                />
              ))}
              <button
                type="button"
                onClick={() => setConditions([...visibility.conditions, defaultCondition('state')])}
                className="flex items-center gap-1 text-xs text-hs-accent hover:underline"
              >
                <Plus size={12} /> {t('visibilityConditions.addCondition')}
              </button>
              {visibility.conditions.length > 1 && (
                <p className="text-[10px] text-hs-text-dim">{t('visibilityConditions.allMustMatchHint')}</p>
              )}
            </div>
          </PropertyGroup>

          <PropertyGroup title={t('visibilityConditions.whenUnknownTitle')} accent={3}>
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-hs-text-muted">{t('visibilityConditions.whenUnknownLabel')}</span>
              <select
                value={visibility.whenUnknown ?? 'hide'}
                onChange={(e) =>
                  setVisibility({
                    ...visibility,
                    whenUnknown: e.target.value === 'show' ? 'show' : undefined,
                  })
                }
                className={INPUT_CLASS}
              >
                <option value="hide">{t('visibilityConditions.whenUnknownHide')}</option>
                <option value="show">{t('visibilityConditions.whenUnknownShow')}</option>
              </select>
            </label>
          </PropertyGroup>
        </>
      )}
    </div>
  );
}
