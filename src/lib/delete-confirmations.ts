import type { TranslateFn } from '@/i18n/types';
import type { ModuleInstance } from '@/types/config';

export interface DeleteConfirmContent {
  title: string;
  message: string;
  confirmLabel: string;
  variant: 'danger';
}

/**
 * The question asked before a screen goes, and the word on the button that
 * answers it.
 *
 * Shared by the "x" on a screen tab and the "..." menu's Delete, which are one
 * action reached two ways: they used to show the same question above buttons
 * reading Remove and Delete. The question also names how many modules go with
 * the screen, which the dialog never used to say.
 */
export function buildScreenDeleteConfirm(
  screen: { name: string; modules: ModuleInstance[] },
  t: TranslateFn,
  tCore: TranslateFn,
  /** The modules on other screens whose open button opens this one ("Kitchen: Meal Planner"); their buttons go with it. */
  openers: readonly string[] = [],
): DeleteConfirmContent {
  const detail = t('screenTabs.deleteConfirmDetail', { count: screen.modules.length });
  return {
    title: t('screenTabs.deleteConfirmTitle', { name: screen.name }),
    // A plural-form entry, so each locale picks its own branch rather than
    // having a count glued onto a sentence.
    message: openers.length > 0 ? t('screenTabs.deleteConfirmOpeners', { names: openers.join(', '), count: screen.modules.length }) : detail,
    confirmLabel: tCore('actions.delete'),
    variant: 'danger',
  };
}

/**
 * The same question for one module, named rather than "this module": the three
 * ways to delete one (the panel button, the right-click menu, the Delete key)
 * all ask it, and only the keyboard one gives no other hint about which module
 * is about to go.
 */
export function buildModuleDeleteConfirm(
  moduleLabel: string,
  t: TranslateFn,
  tCore: TranslateFn,
): DeleteConfirmContent {
  return {
    title: t('propertyPanel.actions.confirmDeleteTitle', { name: moduleLabel }),
    message: t('propertyPanel.actions.confirmDeleteDetail'),
    confirmLabel: tCore('actions.delete'),
    variant: 'danger',
  };
}
