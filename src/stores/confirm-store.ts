import { create } from 'zustand';

/**
 * A yes-or-no question. Every caller says what the button does and whether
 * it can be taken back, so no question comes out as a red "Confirm" by
 * accident:
 * - `confirmLabel` names the action ("Delete", "Restore", "Move pictures").
 * - `variant` is `'danger'` for something that is gone for good and
 *   `'primary'` for everything else.
 */
export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant: 'danger' | 'primary';
  /**
   * Where the keyboard goes when the dialog closes, if what had focus before
   * is gone (a menu item from the menu that opened it).
   */
  returnFocus?: Element | null;
}

export interface ChoiceOption {
  value: string;
  label: string;
  variant?: 'primary' | 'secondary';
}

interface ChooseOptions {
  title?: string;
  message: string;
  choices: ChoiceOption[];
}

/**
 * What the dialog shows. An alert has one OK button and a translated
 * "Notice" title unless the caller gives one; both are filled in by
 * `ConfirmModal`, which has the dictionary.
 */
export type ConfirmDialog =
  | ({ kind: 'confirm' } & ConfirmOptions)
  | { kind: 'alert'; title?: string; message: string }
  | ({ kind: 'choose' } & ChooseOptions);

interface ConfirmState {
  open: boolean;
  /** The dialog on screen, kept after closing so nothing reads an empty one. */
  options: ConfirmDialog;
  resolve: ((value: boolean) => void) | null;
  resolveChoice: ((value: string | null) => void) | null;

  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (message: string, title?: string) => Promise<void>;
  /** Multi-way question. Resolves with the picked choice's value, or null
   *  when dismissed (Escape / Cancel). */
  choose: (options: ChooseOptions) => Promise<string | null>;
  respond: (value: boolean) => void;
  respondChoice: (value: string | null) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: { kind: 'alert', message: '' },
  resolve: null,
  resolveChoice: null,

  // One question at a time: a second one while another is open is answered
  // "no" at once, rather than silently replacing the first (whose answer was
  // then never given).
  confirm: (options) =>
    new Promise<boolean>((resolve) => {
      if (get().open) { resolve(false); return; }
      set({ open: true, options: { kind: 'confirm', ...options }, resolve, resolveChoice: null });
    }),

  choose: (options) =>
    new Promise<string | null>((resolveChoice) => {
      set({ open: true, options: { kind: 'choose', ...options }, resolve: null, resolveChoice });
    }),

  alert: (message, title) =>
    new Promise<void>((resolve) => {
      set({
        open: true,
        options: { kind: 'alert', title, message },
        resolve: () => resolve(),
        resolveChoice: null,
      });
    }),

  respond: (value) => {
    const { resolve } = get();
    resolve?.(value);
    set({ open: false, resolve: null });
  },

  respondChoice: (value) => {
    const { resolveChoice } = get();
    resolveChoice?.(value);
    set({ open: false, resolveChoice: null });
  },
}));
