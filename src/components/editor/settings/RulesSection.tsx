'use client';

import { useState } from 'react';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useEditorStore, getActiveRules } from '@/stores/editor-store';
import { useEditorSharedState } from '@/hooks/useEditorSharedState';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';
import { useSortableSensors } from '@/hooks/useDndSensors';
import SortableRuleCard from './SortableRuleCard';
import { logger } from '@/lib/logger';

const log = logger('rules');

/**
 * Settings → Rules: condition → action rules for the display.
 *
 * Rules follow the editor's `selectedDisplayId` exactly like ProfilesSection:
 * they reference the owning display's screens (a `showScreen` target is a
 * per-display screen id), so in multi-display mode the page edits whichever
 * display the editor is working on and shows an explicit display picker.
 * Single-display installs edit `config.rules` with no picker.
 */
interface RulesSectionProps {
  /** When rendered as an Automation-page tab, the parent owns the shared
   *  display picker and the active tab already names the section — suppress
   *  this section's own picker and heading (the description still renders). */
  embedded?: boolean;
}

export default function RulesSection({ embedded = false }: RulesSectionProps) {
  const t = useTranslate('editor');
  const config = useEditorStore((s) => s.config);
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  const setSelectedDisplay = useEditorStore((s) => s.setSelectedDisplay);
  const addRule = useEditorStore((s) => s.addRule);
  const reorderRules = useEditorStore((s) => s.reorderRules);
  const saveConfig = useEditorStore((s) => s.saveConfig);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Computed before the poll hook so its enabled flag can gate on it. Safe to
  // read `config` conditionally here — the hook order below is unconditional.
  const rules = config ? getActiveRules(config, selectedDisplayId) : [];

  // One poll for the whole section, threaded into every card — a per-card
  // hook would fire N identical /api/display/shared-state requests per tick
  // (same hoisting VisibilityConditionsSection does for its tree editor).
  // Gated on having at least one rule (like EditorCanvas gates on
  // anyConditionGated): the GET arms the display's fast re-reporting, so a
  // display with zero rules shouldn't hold it open.
  const liveState = useEditorSharedState(selectedDisplayId, rules.length > 0);

  const sensors = useSortableSensors();

  // Auto-save the config slices this page can mutate: `config.rules` in
  // legacy mode, `config.displays` for per-display owned rules. Debounced so
  // drag reorders and toggles collapse into a single PUT.
  useDebouncedSave({
    values: [config?.rules, config?.displays],
    debounceMs: 500,
    // The settings page has no `useAutoSave` safety net (that lives on
    // /editor), and the reorg put Rules behind an intra-page `?panel=` tab bar
    // that unmounts this section on one click. Without the flush, a toggle or
    // drag followed by a tab click inside 500ms cancelled the pending PUT and
    // the edit was gone on the next load, with no warning.
    flushOnUnmount: true,
    save: () => saveConfig(),
    onError: (err) => log.error('Rule auto-save failed:', err),
  });

  if (!config) return null;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    addRule(t('settings.rulesPage.newRuleName', { number: rules.length + 1 }));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = rules.findIndex((r) => r.id === active.id);
    const toIndex = rules.findIndex((r) => r.id === over.id);
    if (fromIndex !== -1 && toIndex !== -1) {
      reorderRules(fromIndex, toIndex);
    }
  };

  const allDisplays = config.displays ?? [];
  const isMultiDisplay = allDisplays.length > 0;

  return (
    <section>
      {!embedded && (
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.rulesPage.heading')}
        </h3>
      )}
      <p className="text-xs text-hs-text-faint mb-4">
        {t('settings.rulesPage.description')}
      </p>

      {isMultiDisplay && !embedded && (
        <div className="mb-4 rounded-lg border border-hs-accent/20 bg-hs-accent/[0.07] px-3 py-2.5">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-hs-accent-hover font-medium">
              {t('settings.rulesPage.displayPicker.label')}
            </span>
            <select
              value={selectedDisplayId ?? allDisplays[0]?.id ?? ''}
              onChange={(e) => setSelectedDisplay(e.target.value || null)}
              className="mt-1 block w-full rounded-md bg-hs-panel border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
            >
              {allDisplays.map((d) => (
                <option key={d.id} value={d.id}>
                  {t('settings.rulesPage.displayPicker.optionLabel', { name: d.name, id: d.id })}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-hs-text-faint mt-1.5">
              {t('settings.rulesPage.displayPicker.help')}
            </p>
          </label>
        </div>
      )}

      {rules.length === 0 && (
        <p className="text-xs text-hs-text-faint mb-4">
          {t('settings.rulesPage.emptyHint')}
        </p>
      )}

      {rules.length > 1 && (
        <div className="rounded-md bg-hs-card/60 border border-hs-border-strong/50 px-3 py-2 mb-4">
          <p className="text-xs text-hs-text-muted">
            <span className="font-medium text-hs-text-secondary">
              {t('settings.rulesPage.priority.labelPrefix')}
            </span>
            {t('settings.rulesPage.priority.helpSuffix')}
          </p>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={rules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {rules.map((rule, index) => (
              <SortableRuleCard
                key={rule.id}
                rule={rule}
                index={index}
                isExpanded={expandedIds.has(rule.id)}
                onToggleExpand={() => toggleExpand(rule.id)}
                liveState={liveState}
                t={t}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-3 mt-4">
        <Button variant="secondary" onClick={handleAdd}>
          {t('settings.rulesPage.addButton')}
        </Button>
      </div>
    </section>
  );
}
