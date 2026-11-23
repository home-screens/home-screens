/**
 * The questions asked before something goes, in one shape on every surface:
 * the title asks and names the thing (Delete “Kitchen”?), the body says what
 * happens, and the button answers with the verb.
 *
 * Which verb:
 * - Delete: gone for good. Screens, modules, chores, rules, profiles, notes,
 *   lists, meals, rewards, routines, pictures, your icons, timetable schools,
 *   subjects and timetables, backup copies, displays.
 * - Remove: taken off something, and it still exists. A person from a chore,
 *   an event from a calendar, a calendar from the list, done items from a list.
 * - Clear: empty a slot (a default time, the alerts on a display).
 *
 * Names sit in curly quotes, “like this”, from the shared titles in `core`
 * `confirm.*`, so every surface quotes them the same way.
 */

import type { TranslateFn } from '@/i18n/types';
import type { ModuleInstance } from '@/types/config';

export interface DeleteConfirmContent {
  title: string;
  message: string;
  confirmLabel: string;
  variant: 'danger';
}

/** The verb on the answer button. See the rule at the top of this file. */
export type ConfirmVerb = 'delete' | 'remove' | 'clear';

export type DeleteConfirmSpec = {
  verb: ConfirmVerb;
  /** What happens on yes, as a sentence. */
  consequence: string;
  /** A fuller answer than the bare verb, when the question alone leaves it unclear ("Remove calendar"). */
  confirmLabel?: string;
} & (
  /** What it is called; the title quotes it: Delete “Kitchen”? */
  | { name: string; question?: never }
  /**
   * The whole question, for something with no name of its own ("Delete this
   * note?") or a count ("Remove 3 done items from “Groceries”?"). A noun is
   * never slotted into a shared sentence: that does not translate.
   */
  | { question: string; name?: never }
);

/**
 * The one delete question: title, body and a named answer for the editor's
 * confirm dialog (spread into `confirm()`) or the phone's `ConfirmSheet`
 * (`title`, `description={message}`, `confirmLabel`). `tCore` reads `core`.
 */
export function buildDeleteConfirm(spec: DeleteConfirmSpec, tCore: TranslateFn): DeleteConfirmContent {
  return {
    title: spec.question ?? tCore(`confirm.${spec.verb}Title`, { name: spec.name }),
    message: spec.consequence,
    confirmLabel: spec.confirmLabel ?? tCore(`actions.${spec.verb}`),
    variant: 'danger',
  };
}

/** The same question as a phone `ConfirmSheet`'s props. */
export function sheetQuestion(content: DeleteConfirmContent): { title: string; description: string; confirmLabel: string } {
  return { title: content.title, description: content.message, confirmLabel: content.confirmLabel };
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
  return buildDeleteConfirm({
    verb: 'delete',
    name: screen.name,
    // A plural-form entry, so each locale picks its own branch rather than
    // having a count glued onto a sentence.
    consequence: openers.length > 0 ? t('screenTabs.deleteConfirmOpeners', { names: openers.join(', '), count: screen.modules.length }) : detail,
  }, tCore);
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
  return buildDeleteConfirm({ verb: 'delete', name: moduleLabel, consequence: t('propertyPanel.actions.confirmDeleteDetail') }, tCore);
}

/**
 * The question asked before pictures or videos leave the library, from
 * Settings > Pictures & videos (one tile or a selection) and from the picture
 * picker's tiles. The picker once deleted on one click: both now ask the same
 * thing in the same words.
 */
export function buildLibraryDeleteConfirm(names: readonly string[], t: TranslateFn, tCore: TranslateFn, clips = 0): DeleteConfirmContent {
  const count = names.length;
  const message = t('settings.mediaPage.deleteMessage', { count });
  return {
    // One picture is named, so the question says which: "Delete “IMG_1234.JPG”?".
    title: count === 1 ? tCore('confirm.deleteTitle', { name: names[0] }) : t('settings.mediaPage.deleteTitle', { count }),
    // A Live Photo's clip goes with its picture (`clips` of them), and the question says so.
    message: clips > 0 ? `${message} ${t('settings.mediaPage.clipsGoToo', { count: clips })}` : message,
    confirmLabel: t('settings.mediaPage.deleteConfirm'),
    variant: 'danger',
  };
}
