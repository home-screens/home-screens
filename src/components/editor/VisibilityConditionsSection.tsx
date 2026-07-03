'use client';

import { useId, useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import Toggle from '@/components/ui/Toggle';
import PropertyGroup from './PropertyGroup';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { useTranslate, type TranslateFn } from '@/i18n';
import { collectProvidedStateKeys } from '@/lib/provided-state-keys';
import { MAX_CONDITION_DEPTH, validateModuleVisibility } from '@/lib/display-filter';
import { SHARED_STATE_KEY_RE } from '@/lib/shared-state-types';
import type { ModuleInstance, ModuleVisibility, VisibilityCondition } from '@/types/config';

const CONDITION_KINDS = ['state', 'numeric', 'and', 'or', 'not'] as const;

function defaultCondition(kind: VisibilityCondition['kind'], defaultKey = ''): VisibilityCondition {
  switch (kind) {
    case 'state':
      return { kind: 'state', sourceKey: defaultKey, equals: '' };
    case 'numeric':
      return { kind: 'numeric', sourceKey: defaultKey };
    default:
      return { kind, conditions: [defaultCondition('state', defaultKey)] };
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

function SourceKeyInput({
  value,
  onChange,
  listId,
  t,
}: {
  value: string;
  onChange: (key: string) => void;
  listId: string;
  t: TranslateFn;
}) {
  const invalid = !SHARED_STATE_KEY_RE.test(value);
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-hs-text-muted">{t('visibilityConditions.sourceKeyLabel')}</span>
      <input
        type="text"
        value={value}
        list={listId}
        placeholder={t('visibilityConditions.sourceKeyPlaceholder')}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_CLASS} ${invalid ? 'border-hs-danger' : ''}`}
        aria-invalid={invalid || undefined}
      />
      {invalid && (
        <span className="text-[10px] text-hs-danger">{t('visibilityConditions.sourceKeyInvalid')}</span>
      )}
    </label>
  );
}

function ConditionEditor({
  condition,
  onChange,
  onRemove,
  defaultKey,
  listId,
  depth,
  t,
}: {
  condition: VisibilityCondition;
  onChange: (next: VisibilityCondition) => void;
  onRemove: () => void;
  defaultKey: string;
  listId: string;
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
            onChange(convertConditionKind(condition, e.target.value as VisibilityCondition['kind'], defaultKey))
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
            listId={listId}
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
              <input
                type="text"
                value={formatValueList(condition.equals ?? condition.notEquals)}
                placeholder={t('visibilityConditions.valuePlaceholder')}
                onChange={(e) => {
                  const parsed = parseValueList(e.target.value);
                  onChange(
                    condition.notEquals !== undefined
                      ? { kind: 'state', sourceKey: condition.sourceKey, notEquals: parsed }
                      : { kind: 'state', sourceKey: condition.sourceKey, equals: parsed },
                  );
                }}
                className={INPUT_CLASS}
              />
            </label>
          </div>
          <p className="text-[10px] text-hs-text-dim">{t('visibilityConditions.valueListHint')}</p>
        </div>
      )}

      {condition.kind === 'numeric' && (
        <div className="space-y-2">
          <SourceKeyInput
            value={condition.sourceKey}
            onChange={(sourceKey) => onChange({ ...condition, sourceKey })}
            listId={listId}
            t={t}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-hs-text-muted">{t('visibilityConditions.aboveLabel')}</span>
              <input
                type="number"
                value={condition.above ?? ''}
                onChange={(e) => onChange({ ...condition, above: parseBound(e.target.value) })}
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-hs-text-muted">{t('visibilityConditions.belowLabel')}</span>
              <input
                type="number"
                value={condition.below ?? ''}
                onChange={(e) => onChange({ ...condition, below: parseBound(e.target.value) })}
                className={INPUT_CLASS}
              />
            </label>
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
              defaultKey={defaultKey}
              listId={listId}
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
            onClick={() => onChange({ ...condition, conditions: [...condition.conditions, defaultCondition('state', defaultKey)] })}
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
  const listId = useId();
  const config = useEditorStore((s) => s.config);
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  const updateModule = useEditorStore((s) => s.updateModule);

  const providedKeys = useMemo(
    () => collectProvidedStateKeys(config ? getActiveScreens(config, selectedDisplayId) : []),
    [config, selectedDisplayId],
  );
  const defaultKey = providedKeys[0]?.key ?? '';

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
              <datalist id={listId}>
                {providedKeys.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.sampleValues?.length ? `${k.label} (${k.sampleValues.join(', ')})` : k.label}
                  </option>
                ))}
              </datalist>
              {visibility.conditions.map((condition, i) => (
                <ConditionEditor
                  key={i}
                  condition={condition}
                  depth={0}
                  defaultKey={defaultKey}
                  listId={listId}
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
                onClick={() => setConditions([...visibility.conditions, defaultCondition('state', defaultKey)])}
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
