'use client';

import { useAutoSave } from '@/hooks/useAutoSave';

/**
 * The editor's auto-save, mounted from the (editor) layout so it runs for
 * every editor route and survives the moves between them. See `useAutoSave`.
 */
export default function EditorAutoSave() {
  useAutoSave();
  return null;
}
