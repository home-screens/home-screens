import { uuid } from '@/lib/uuid';

type SetFn = (updates: Record<string, unknown>) => void;

interface WithId {
  id: string;
}

/**
 * Generic hook for list CRUD operations (add/remove/update by id or index).
 * Used by CountdownConfigSection, TodoConfigSection, TrafficConfigSection, etc.
 */
export function useListEditor<T extends WithId>(
  items: T[],
  key: string,
  set: SetFn,
  defaultItem: Omit<T, 'id'>
) {
  const add = () => {
    set({ [key]: [...items, { id: uuid(), ...defaultItem }] });
  };

  const remove = (id: string) => {
    set({ [key]: items.filter((item) => item.id !== id) });
  };

  const update = (id: string, updates: Partial<T>) => {
    set({ [key]: items.map((item) => (item.id === id ? { ...item, ...updates } : item)) });
  };

  return { add, remove, update };
}

/**
 * Generic hook for list CRUD operations using index-based access (no id field).
 * Used by TrafficConfigSection where items don't have ids.
 */
export function useIndexListEditor<T>(
  items: T[],
  key: string,
  set: SetFn,
  defaultItem: T
) {
  const add = () => {
    set({ [key]: [...items, defaultItem] });
  };

  const remove = (idx: number) => {
    set({ [key]: items.filter((_, i) => i !== idx) });
  };

  const update = (idx: number, updates: Partial<T>) => {
    set({ [key]: items.map((item, i) => (i === idx ? { ...item, ...updates } : item)) });
  };

  return { add, remove, update };
}
