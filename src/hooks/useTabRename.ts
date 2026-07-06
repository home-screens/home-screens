'use client';

import { useState } from 'react';
import type { Screen } from '@/types/config';

/**
 * Manages inline rename state for the screen tabs. A commit only writes when
 * the trimmed value is non-empty and actually changed, so blurring an untouched
 * field is a no-op.
 */
export function useTabRename(
  screens: Screen[],
  updateScreen: (screenId: string, patch: Partial<Screen>) => void,
) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const beginEditing = (screenId: string, name: string) => {
    setEditingId(screenId);
    setEditValue(name);
  };

  const commitRename = (screenId: string) => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== screens.find((s) => s.id === screenId)?.name) {
      updateScreen(screenId, { name: trimmed });
    }
    setEditingId(null);
  };

  const cancelEditing = () => setEditingId(null);

  return { editingId, editValue, setEditValue, beginEditing, commitRename, cancelEditing };
}
