import { create } from 'zustand';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
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

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions;
  isAlert: boolean;
  /** Non-null while a choose() dialog is open — the modal renders one button
   *  per choice instead of the confirm/cancel pair. */
  choices: ChoiceOption[] | null;
  resolve: ((value: boolean) => void) | null;
  resolveChoice: ((value: string | null) => void) | null;

  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  alert: (message: string, title?: string) => Promise<void>;
  /** Multi-way question. Resolves with the picked choice's value, or null
   *  when dismissed (Escape / Cancel). */
  choose: (options: ChooseOptions) => Promise<string | null>;
  respond: (value: boolean) => void;
  respondChoice: (value: string | null) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: { message: '' },
  isAlert: false,
  choices: null,
  resolve: null,
  resolveChoice: null,

  confirm: (opts) =>
    new Promise<boolean>((resolve) => {
      const options = typeof opts === 'string' ? { message: opts } : opts;
      set({ open: true, isAlert: false, options, choices: null, resolve, resolveChoice: null });
    }),

  choose: ({ title, message, choices }) =>
    new Promise<string | null>((resolveChoice) => {
      set({
        open: true,
        isAlert: false,
        options: { title, message },
        choices,
        resolve: null,
        resolveChoice,
      });
    }),

  alert: (message, title) =>
    new Promise<void>((resolve) => {
      set({
        open: true,
        isAlert: true,
        options: {
          title: title ?? 'Notice',
          message,
          confirmLabel: 'OK',
        },
        choices: null,
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
    set({ open: false, choices: null, resolveChoice: null });
  },
}));
