import { v4 as uuidv4 } from 'uuid';
import { arrayMove } from '@dnd-kit/sortable';
import type { DisplayRule } from '@/types/config';
import {
  getActiveScreens,
  getActiveRules,
  withRules,
} from '@/lib/editor-multi-display';
import { COALESCE_KEYS } from '@/stores/editor-save';
import type { EditorGet, MutateConfig, RuleActions } from './types';

/** Display-rule CRUD, ordering, and cross-display copy. */
export function createRuleSlice(
  get: EditorGet,
  mutateConfig: MutateConfig,
): RuleActions {
  return {
    addRule: (name: string) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => {
        // Default the action to the first screen so a new rule saves valid;
        // 'for' 60s is the doorbell-style shape most rules start from.
        const firstScreenId = getActiveScreens(config, selectedDisplayId)[0]?.id ?? '';
        const newRule: DisplayRule = {
          id: uuidv4(),
          name,
          when: [],
          action: { kind: 'showScreen', screenId: firstScreenId, mode: 'for', seconds: 60 },
        };
        return {
          config: withRules(config, selectedDisplayId, (rules) => [...rules, newRule]),
        };
      });
    },

    removeRule: (id: string) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => ({
        config: withRules(config, selectedDisplayId, (rules) => rules.filter((r) => r.id !== id)),
      }));
    },

    updateRule: (id: string, updates: Partial<DisplayRule>) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => ({
        config: withRules(config, selectedDisplayId, (rules) =>
          rules.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        ),
      }), { coalesce: COALESCE_KEYS.updateRule(id) });
    },

    reorderRules: (fromIndex: number, toIndex: number) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => ({
        config: withRules(config, selectedDisplayId, (rules) =>
          arrayMove(rules, fromIndex, toIndex),
        ),
      }), { coalesce: COALESCE_KEYS.reorderRules });
    },

    copyRuleToDisplay: (ruleId: string, targetDisplayId: string) => {
      const { config, selectedDisplayId } = get();
      // Multi-display only — legacy single-display installs have nowhere to copy.
      if (!config?.displays) return;
      const source = getActiveRules(config, selectedDisplayId).find((r) => r.id === ruleId);
      if (!source || !config.displays.some((d) => d.id === targetDisplayId)) return;

      mutateConfig((cfg) => {
        // Fresh id; blank a showScreen target since screens are per-display and
        // the source screen id won't exist on the target (empty screenId is the
        // established saveable-incomplete posture). enabled: undefined lands it on.
        const clone: DisplayRule = { ...structuredClone(source), id: uuidv4(), enabled: undefined };
        if (clone.action.kind === 'showScreen') {
          clone.action = { ...clone.action, screenId: '' };
        }
        // The guards above ensure the target display exists, so withRules
        // writes to its rules list, never the legacy fallback.
        return {
          config: withRules(cfg, targetDisplayId, (rules) => [...rules, clone]),
        };
      });
    },
  };
}
