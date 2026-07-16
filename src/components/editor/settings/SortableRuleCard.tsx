'use client';

import { useMemo, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, GripVertical, Pencil, Trash2, Check, X } from 'lucide-react';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import type { DisplaySharedState } from '@/hooks/useDisplaySharedState';
import { collectProvidedStateKeys } from '@/lib/provided-state-keys';
import { validateDisplayRules } from '@/lib/display-filter';
import ConditionTreeEditor from '@/components/editor/ConditionTreeEditor';
import Toggle from '@/components/ui/Toggle';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import type { TranslateFn } from '@/i18n';
import type { DisplayRule, RuleAction, VisibilityCondition } from '@/types/config';

/**
 * Seconds input that commits on blur/Enter — mirrors the condition inputs'
 * on-blur contract so half-typed numbers never hit the autosave pipeline
 * (a transient "6" while typing "60" would otherwise save and even fail
 * validation for `for`-mode seconds).
 */
function SecondsField({
  label,
  value,
  allowEmpty,
  onCommit,
}: {
  label: string;
  value: number | undefined;
  /** Empty commits as undefined (used by cooldown); otherwise empty reverts. */
  allowEmpty: boolean;
  onCommit: (next: number | undefined) => void;
}) {
  const toDraft = (v: number | undefined) => (v === undefined ? '' : String(v));
  const [draft, setDraft] = useState(toDraft(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(toDraft(value));
  }

  const commit = () => {
    if (draft.trim() === '') {
      if (allowEmpty) onCommit(undefined);
      else setDraft(toDraft(value));
      return;
    }
    const n = Number(draft);
    if (Number.isFinite(n) && n >= 0 && (allowEmpty || n > 0)) onCommit(n);
    else setDraft(toDraft(value));
  };

  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-hs-text-muted">{label}</span>
      <input
        type="number"
        min={allowEmpty ? 0 : 1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
        className={INPUT_CLASS}
      />
    </label>
  );
}

interface RuleCardProps {
  rule: DisplayRule;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  /** Selected display's last-reported shared state, polled once by RulesSection. */
  liveState: DisplaySharedState;
  t: TranslateFn;
}

export default function SortableRuleCard({ rule, index, isExpanded, onToggleExpand, liveState, t }: RuleCardProps) {
  const config = useEditorStore((s) => s.config);
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  const updateRule = useEditorStore((s) => s.updateRule);
  const removeRule = useEditorStore((s) => s.removeRule);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  };

  const screens = useMemo(
    () => (config ? getActiveScreens(config, selectedDisplayId) : []),
    [config, selectedDisplayId],
  );
  const providedKeys = useMemo(() => collectProvidedStateKeys(screens), [screens]);

  // Mirrors exactly what the config write gate will reject, so nothing
  // unsaveable goes unexplained (same posture as VisibilityConditionsSection).
  const validationError = useMemo(
    () => validateDisplayRules([rule], screens, 'rules'),
    [rule, screens],
  );

  if (!config) return null;

  const enabled = rule.enabled !== false;
  const action = rule.action;

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed) updateRule(rule.id, { name: trimmed });
    setRenaming(false);
  };

  const setConditions = (when: VisibilityCondition[]) => updateRule(rule.id, { when });
  const setAction = (next: RuleAction) => updateRule(rule.id, { action: next });

  const handleActionKind = (kind: RuleAction['kind']) => {
    if (kind === action.kind) return;
    setAction(
      kind === 'wake'
        ? { kind: 'wake' }
        : { kind: 'showScreen', screenId: screens[0]?.id ?? '', mode: 'for', seconds: 60 },
    );
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-hs-border-strong bg-hs-hover overflow-hidden"
    >
      {/* Collapsed header — always visible */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          className="cursor-grab touch-none text-hs-text-faint hover:text-hs-text-muted transition-colors"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <button type="button" onClick={onToggleExpand} className="shrink-0">
          <ChevronDown
            className={`w-4 h-4 text-hs-text-faint transition-transform ${isExpanded ? '' : '-rotate-90'}`}
          />
        </button>

        {renaming ? (
          <div className="flex flex-1 items-center gap-1.5 min-w-0">
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                if (e.key === 'Escape') setRenaming(false);
              }}
              autoFocus
              className="w-40 rounded border border-hs-border-strong bg-hs-panel px-2 py-0.5 text-sm text-hs-text-body outline-none focus:border-hs-accent"
            />
            <button type="button" onClick={commitRename} className="text-hs-success hover:text-hs-success/80">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => setRenaming(false)} className="text-hs-text-faint hover:text-hs-text-secondary">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex flex-1 items-center gap-2 min-w-0"
          >
            <span className={`text-sm font-medium truncate ${enabled ? 'text-hs-text-body' : 'text-hs-text-faint'}`}>
              {rule.name}
            </span>
            {!enabled && (
              <span className="text-[10px] uppercase tracking-wider text-hs-text-faint bg-hs-card px-1.5 py-0.5 rounded shrink-0">
                {t('settings.rulesPage.card.offBadge')}
              </span>
            )}
          </button>
        )}

        <span className="text-[11px] text-hs-text-faint tabular-nums shrink-0">#{index + 1}</span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setRenaming(true);
            setRenameValue(rule.name);
          }}
          className="text-hs-text-faint hover:text-hs-text-secondary transition-colors shrink-0"
          title={t('settings.rulesPage.card.renameTitle')}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={async (e) => {
            e.stopPropagation();
            const ok = await useConfirmStore.getState().confirm({
              title: t('settings.rulesPage.deleteDialog.title'),
              message: t('settings.rulesPage.deleteDialog.message', { name: rule.name }),
              confirmLabel: t('settings.rulesPage.deleteDialog.confirm'),
            });
            if (ok) removeRule(rule.id);
          }}
          className="text-hs-text-faint hover:text-hs-danger transition-colors shrink-0"
          title={t('settings.rulesPage.card.deleteTitle')}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-hs-border-strong/60">
          <Toggle
            label={t('settings.rulesPage.card.enabledLabel')}
            checked={enabled}
            onChange={(on) => updateRule(rule.id, { enabled: on ? undefined : false })}
          />

          {/* When — the shared condition tree */}
          <div>
            <span className="text-xs text-hs-text-muted mb-1.5 block">
              {t('settings.rulesPage.card.whenHeading')}
            </span>
            <div className="space-y-2">
              {rule.when.length === 0 && (
                <p className="text-xs text-hs-warning">
                  {t('settings.rulesPage.card.noConditionsHint')}
                </p>
              )}
              {validationError && (
                <div className="rounded border border-hs-danger/40 bg-hs-danger/10 p-2 space-y-1">
                  <p className="text-xs text-hs-danger">{t('settings.rulesPage.card.invalidHint')}</p>
                  <p className="text-[10px] text-hs-text-dim">{validationError}</p>
                </div>
              )}
              <ConditionTreeEditor
                conditions={rule.when}
                onChange={setConditions}
                options={providedKeys}
                liveState={liveState}
                t={t}
              />
              {rule.when.length > 1 && (
                <p className="text-[10px] text-hs-text-dim">
                  {t('settings.rulesPage.card.allMustMatchHint')}
                </p>
              )}
            </div>
          </div>

          {/* Then — the action */}
          <div className="border-t border-hs-border-strong pt-3 space-y-2">
            <span className="text-xs text-hs-text-muted block">
              {t('settings.rulesPage.card.thenHeading')}
            </span>
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-hs-text-muted">{t('settings.rulesPage.card.actionKindLabel')}</span>
              <select
                value={action.kind}
                onChange={(e) => handleActionKind(e.target.value as RuleAction['kind'])}
                className={INPUT_CLASS}
                aria-label={t('settings.rulesPage.card.actionKindLabel')}
              >
                <option value="showScreen">{t('settings.rulesPage.card.actionShowScreen')}</option>
                <option value="wake">{t('settings.rulesPage.card.actionWake')}</option>
              </select>
            </label>

            {action.kind === 'showScreen' && (
              <>
                <label className="flex flex-col gap-0.5">
                  <span className="text-xs text-hs-text-muted">{t('settings.rulesPage.card.screenLabel')}</span>
                  <select
                    value={action.screenId}
                    onChange={(e) => setAction({ ...action, screenId: e.target.value })}
                    className={INPUT_CLASS}
                    aria-label={t('settings.rulesPage.card.screenLabel')}
                  >
                    {action.screenId === '' && (
                      <option value="">{t('settings.rulesPage.card.screenNoneOption')}</option>
                    )}
                    {screens.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.enabled === false ? ` ${t('settings.rulesPage.card.screenDisabledSuffix')}` : ''}
                      </option>
                    ))}
                  </select>
                  {action.screenId === '' && (
                    <p className="text-[10px] text-hs-warning mt-0.5">
                      {t('settings.rulesPage.card.screenMissingWarning')}
                    </p>
                  )}
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-xs text-hs-text-muted">{t('settings.rulesPage.card.modeLabel')}</span>
                    <select
                      value={action.mode}
                      onChange={(e) =>
                        setAction(
                          e.target.value === 'while'
                            ? { kind: 'showScreen', screenId: action.screenId, mode: 'while' }
                            : { kind: 'showScreen', screenId: action.screenId, mode: 'for', seconds: action.seconds ?? 60 },
                        )
                      }
                      className={INPUT_CLASS}
                      aria-label={t('settings.rulesPage.card.modeLabel')}
                    >
                      <option value="while">{t('settings.rulesPage.card.modeWhile')}</option>
                      <option value="for">{t('settings.rulesPage.card.modeFor')}</option>
                    </select>
                  </label>
                  {action.mode === 'for' && (
                    <SecondsField
                      label={t('settings.rulesPage.card.secondsLabel')}
                      value={action.seconds}
                      allowEmpty={false}
                      onCommit={(seconds) => setAction({ ...action, seconds })}
                    />
                  )}
                </div>
              </>
            )}

            <SecondsField
              label={t('settings.rulesPage.card.cooldownLabel')}
              value={rule.cooldownSeconds}
              allowEmpty
              onCommit={(cooldownSeconds) => updateRule(rule.id, { cooldownSeconds })}
            />
            <p className="text-[10px] text-hs-text-dim">
              {t('settings.rulesPage.card.cooldownHelp')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
