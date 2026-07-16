'use client';

// The condition-tree editor: kind dropdown, group nesting, source-key
// combobox, and value entry for `state` / `numeric` leaves. Extracted from
// VisibilityConditionsSection so the display-rules editor can reuse the whole
// tree UI verbatim; VisibilityConditionsSection keeps only the module-scoped
// chrome (enable toggle, whenUnknown, validation banner).
//
// Key entry is a searchable combobox: static suggestions from
// collectProvidedStateKeys (as before) merged with async, debounced results
// from every plugin exporting `searchStateKeys` — friendly names, grouped by
// plugin. Value entry becomes a selection when the picked key's descriptor
// enumerates its raw vocabulary ("Alert (on)" stores `on`), with a
// "Custom value…" escape hatch back to free text. Manually typed keys remain
// fully supported: the combobox is still a free-text input.

import { Fragment, useId, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { useFormattingLocale, formatRelativeTime, type TranslateFn } from '@/i18n';
import type { DisplaySharedState } from '@/hooks/useDisplaySharedState';
import { useStateKeySearch, useStateKeyDescriptor } from '@/hooks/useStateKeySearch';
import { conditionVerdict, type ConditionVerdict } from '@/lib/condition-verdicts';
import { MAX_CONDITION_DEPTH } from '@/lib/display-filter';
import { SHARED_STATE_KEY_RE, type ProvidedStateKey, type SharedStateEntry } from '@/lib/shared-state-types';
import type { StateKeyDescriptor } from '@/types/plugins';
import type { VisibilityCondition } from '@/types/config';

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

/** One row in the merged suggestion list. `section` renders as a group
 *  header ("Home Assistant · Kitchen") above the first row that carries it. */
interface KeySuggestion {
  key: string;
  /** Friendly first line: label, with the live value appended when known. */
  primary: string;
  /** Mono second line: the exact bus key. */
  secondary: string;
  section?: string;
}

/** Exported for tests. */
export function buildSuggestions(
  searched: readonly (StateKeyDescriptor & { pluginName: string })[],
  options: readonly ProvidedStateKey[],
  draft: string,
  known: boolean,
): KeySuggestion[] {
  const query = draft.trim().toLowerCase();
  const out: KeySuggestion[] = [];
  const seen = new Set<string>();
  // Search results first: the plugin already filtered them by the query and
  // ordered them by relevance; they carry friendly names and grouping.
  for (const d of searched) {
    if (seen.has(d.key)) continue;
    seen.add(d.key);
    const live = d.currentValue !== undefined
      ? ` — ${d.currentValue}${d.unit ? ` ${d.unit}` : ''}`
      : '';
    out.push({
      key: d.key,
      primary: `${d.label}${live}`,
      secondary: d.key,
      section: d.group ? `${d.pluginName} · ${d.group}` : d.pluginName,
    });
  }
  // Static suggestions (manifest providesState / deriveProvidedKeys), locally
  // filtered as before. A draft that exactly matches a known key shows the
  // full list so the user can still switch.
  for (const o of options) {
    if (seen.has(o.key)) continue;
    const matches = query === '' || known
      || o.key.toLowerCase().includes(query) || o.label.toLowerCase().includes(query);
    if (!matches) continue;
    seen.add(o.key);
    out.push({
      key: o.key,
      primary: o.sampleValues?.length ? `${o.label} (${o.sampleValues.join(', ')})` : o.label,
      secondary: o.key,
    });
  }
  return out;
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

  // Async friendly-name search across plugins exporting searchStateKeys,
  // debounced, active only while the dropdown is open.
  const { results: searched, searching } = useStateKeySearch(draft, open);

  // Empty is not invalid — it's an incomplete condition still being authored
  // (evaluates as unknown; whenUnknown governs until a key is picked).
  const invalid = draft !== '' && !SHARED_STATE_KEY_RE.test(draft);
  const known = options.some((o) => o.key === draft) || searched.some((d) => d.key === draft);
  // Charset-valid but not advertised by any provider on this display —
  // either the publishing module isn't configured yet (condition authored
  // first) or the key is a typo (e.g. missing the plugin: namespace). Both
  // leave the condition permanently "unknown", which default-hides the
  // module with no other feedback, so surface it here as a soft warning.
  const unknown = !invalid && draft !== '' && !known;
  // Live value straight from the display's last heartbeat — kills the
  // "which exact string do I match against?" guessing game.
  const liveEntry = liveState?.entries[draft];

  const suggestions = useMemo(
    () => buildSuggestions(searched, options, draft, known),
    [searched, options, draft, known],
  );
  const listOpen = open && (suggestions.length > 0 || searching);

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
            {suggestions.map((o, i) => {
              const sectionHeader = o.section && o.section !== suggestions[i - 1]?.section
                ? (
                  <li
                    role="presentation"
                    className="px-2 pb-0.5 pt-1.5 text-[9px] font-semibold uppercase tracking-wide text-hs-text-faint"
                  >
                    {o.section}
                  </li>
                )
                : null;
              return (
                // Fragment keyed by the suggestion key; the optional header
                // renders as a sibling row above the first entry of a group.
                <Fragment key={o.key}>
                  {sectionHeader}
                  <li
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
                    <div className="text-xs text-hs-text-muted">{o.primary}</div>
                    <div className="font-mono text-[10px] text-hs-text-dim">{o.secondary}</div>
                  </li>
                </Fragment>
              );
            })}
            {searching && (
              <li role="presentation" className="px-2 py-1 text-[10px] text-hs-text-dim">
                {t('visibilityConditions.searchingHint')}
              </li>
            )}
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

/** Sentinel select value for the free-text escape hatch. Not a legal raw
 *  value collision risk in practice; a plugin publishing this exact string
 *  as an enum option would merely force the text input, never corrupt data. */
const CUSTOM_VALUE = '__hs_custom__';

/**
 * Value entry for a `state` condition. When the key's descriptor enumerates
 * its raw vocabulary, this is a select of "Friendly (raw)" pairs that STORES
 * the raw value — the three-vocabularies trap (card label vs HA UI label vs
 * raw state) becomes unpickable. "Custom value…" reopens the free-text input
 * (comma lists for matches-any, values for producers not yet installed).
 * Without a descriptor it renders exactly the old free-text input.
 * Exported for tests.
 */
export function ConditionValueControl({
  value,
  onCommit,
  descriptor,
  t,
}: {
  value: string;
  onCommit: (raw: string) => void;
  descriptor: StateKeyDescriptor | null;
  t: TranslateFn;
}) {
  const options = descriptor?.valueType === 'enum' ? descriptor.valueOptions : undefined;
  const inOptions = options?.some((o) => o.value === value) ?? false;
  // Deliberate "Custom value…" pick; derived state alone can't hold it open
  // once the typed value happens to match an option.
  const [customMode, setCustomMode] = useState(false);
  // Reset in place when the condition is re-pointed at another key, so one
  // key's custom-mode choice never leaks into another's vocabulary. A React
  // key={sourceKey} remount would do the same but remounts mid-blur: the
  // source key commits exactly when the user tabs into this field, and the
  // swap would eat that focus and the first keystrokes with it.
  const [lastDescriptorKey, setLastDescriptorKey] = useState(descriptor?.key);
  if (descriptor?.key !== lastDescriptorKey) {
    setLastDescriptorKey(descriptor?.key);
    setCustomMode(false);
  }
  const showCustomInput = !!options && (customMode || (value !== '' && !inOptions));

  if (!options) {
    return (
      <ConditionValueInput
        value={value}
        placeholder={t('visibilityConditions.valuePlaceholder')}
        onCommit={onCommit}
      />
    );
  }

  const selectValue = showCustomInput ? CUSTOM_VALUE : value;
  return (
    <div className="flex flex-col gap-1">
      <select
        value={selectValue}
        aria-label={t('visibilityConditions.valueLabel')}
        onChange={(e) => {
          if (e.target.value === CUSTOM_VALUE) {
            setCustomMode(true);
            return;
          }
          setCustomMode(false);
          onCommit(e.target.value);
        }}
        className={INPUT_CLASS}
      >
        {/* Blank row so a still-empty condition doesn't misreport the first option as chosen. */}
        {value === '' && !showCustomInput && <option value="" />}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label && o.label !== o.value ? `${o.label} (${o.value})` : o.value}
          </option>
        ))}
        <option value={CUSTOM_VALUE}>{t('visibilityConditions.customValueOption')}</option>
      </select>
      {showCustomInput && (
        <ConditionValueInput
          value={value}
          placeholder={t('visibilityConditions.valuePlaceholder')}
          onCommit={onCommit}
        />
      )}
    </div>
  );
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

/**
 * Live pass/fail chip for one condition node, computed by the SAME
 * three-valued evaluator the display-rule engine uses over the display's
 * last-reported snapshot. Rendered only when a fresh snapshot exists —
 * offline displays show nothing rather than a stale verdict. Exported for
 * tests.
 */
export function ConditionVerdictChip({
  verdict,
  t,
}: {
  verdict: ConditionVerdict;
  t: TranslateFn;
}) {
  const className =
    verdict === 'met'
      ? 'bg-hs-success/15 text-hs-success border-hs-success/30'
      : verdict === 'unmet'
        ? 'bg-amber-600/15 text-amber-500 border-amber-600/30'
        : 'bg-hs-hover text-hs-text-dim border-hs-border-strong';
  return (
    <span
      data-condition-verdict={verdict}
      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${className}`}
      title={t(`visibilityConditions.verdicts.${verdict}Title`)}
    >
      {t(`visibilityConditions.verdicts.${verdict}`)}
    </span>
  );
}

function ConditionEditor({
  condition,
  onChange,
  onRemove,
  options,
  liveState,
  verdictStates,
  depth,
  t,
}: {
  condition: VisibilityCondition;
  onChange: (next: VisibilityCondition) => void;
  onRemove: () => void;
  options: readonly ProvidedStateKey[];
  liveState?: DisplaySharedState;
  verdictStates: ReadonlyMap<string, SharedStateEntry> | null;
  depth: number;
  t: TranslateFn;
}) {
  const isGroup = condition.kind === 'and' || condition.kind === 'or' || condition.kind === 'not';
  const allowGroups = depth < MAX_CONDITION_DEPTH - 1;
  // Hook order: called for every kind (groups pass '', resolving to null).
  const descriptor = useStateKeyDescriptor(isGroup ? '' : condition.sourceKey);

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
        {verdictStates && (
          <ConditionVerdictChip verdict={conditionVerdict(condition, verdictStates)} t={t} />
        )}
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
              <ConditionValueControl
                value={formatValueList(condition.equals ?? condition.notEquals)}
                descriptor={descriptor}
                t={t}
                onCommit={(raw) => {
                  // A string from the key's own vocabulary is one raw value by
                  // definition — never comma-split it, even if it contains one.
                  const parsed = descriptor?.valueOptions?.some((o) => o.value === raw)
                    ? raw
                    : parseValueList(raw);
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
          {descriptor?.currentValue !== undefined && (
            <p className="text-[10px] text-hs-text-dim">
              {t('visibilityConditions.currentValueHint', {
                value: `${descriptor.currentValue}${descriptor.unit ? ` ${descriptor.unit}` : ''}`,
              })}
            </p>
          )}
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
              verdictStates={verdictStates}
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

/**
 * The reusable condition-tree editor: a list of root conditions (implicit
 * AND) with add/remove/convert/nest. Callers own everything around it —
 * enable toggles, whenUnknown, validation banners, empty-state hints.
 */
export default function ConditionTreeEditor({
  conditions,
  onChange,
  options,
  liveState,
  t,
}: {
  conditions: VisibilityCondition[];
  onChange: (next: VisibilityCondition[]) => void;
  options: readonly ProvidedStateKey[];
  liveState?: DisplaySharedState;
  t: TranslateFn;
}) {
  // One states map per snapshot for the whole tree; null (no fresh report)
  // renders every node without a verdict chip. Freshness is owned by the
  // poll loop in useDisplaySharedState, which re-evaluates it every tick.
  const verdictStates = liveState?.states ?? null;
  return (
    <>
      {conditions.map((condition, i) => (
        <ConditionEditor
          key={i}
          condition={condition}
          depth={0}
          options={options}
          liveState={liveState}
          verdictStates={verdictStates}
          t={t}
          onChange={(next) => {
            const updated = conditions.slice();
            updated[i] = next;
            onChange(updated);
          }}
          onRemove={() => onChange(conditions.filter((_, j) => j !== i))}
        />
      ))}
      <button
        type="button"
        onClick={() => onChange([...conditions, defaultCondition('state')])}
        className="flex items-center gap-1 text-xs text-hs-accent hover:underline"
      >
        <Plus size={12} /> {t('visibilityConditions.addCondition')}
      </button>
    </>
  );
}
