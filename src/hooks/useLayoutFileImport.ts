'use client';

import { useCallback, useRef } from 'react';
import { validateLayoutExport } from '@/lib/layout-export';
import { useConfirmStore } from '@/stores/confirm-store';
import { useTranslate } from '@/i18n';
import type { LayoutExport } from '@/types/layout-export';

/**
 * Shared "pick a layout .json off disk" plumbing for every place that offers
 * layout import (the screen tabs + menu and the Backups & data page). Owns the
 * hidden file input, parses and validates the upload, and hands a good layout
 * to the caller so it can open the import preview.
 */
export function useLayoutFileImport(onLayout: (layout: LayoutExport) => void) {
  const t = useTranslate('editor');
  const inputRef = useRef<HTMLInputElement>(null);

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        const validation = validateLayoutExport(data);
        if (!validation.valid) {
          useConfirmStore.getState().alert(
            t('layoutImport.alerts.invalidLayoutFile', {
              errors: validation.errors.join('\n'),
            }),
          );
          return;
        }
        onLayout(data as LayoutExport);
      } catch {
        useConfirmStore.getState().alert(t('layoutImport.alerts.invalidJsonFile'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [onLayout, t]);

  return { inputRef, openFilePicker, handleFileChange };
}
