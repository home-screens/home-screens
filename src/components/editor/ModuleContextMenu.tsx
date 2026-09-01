'use client';

import { useRef } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import { useOutsidePointerDown } from '@/hooks/useOutsidePointerDown';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useTranslate } from '@/i18n';
import { stackExtremes, stackOrder } from '@/lib/module-utils';
import type { ModuleInstance } from '@/types/config';

export interface ModuleMenuState {
  moduleId: string;
  /** Viewport position of the menu. */
  x: number;
  y: number;
  /** Where the right-click landed, in canvas pixels, for "select behind". */
  canvasX: number;
  canvasY: number;
}

const ITEM = 'w-full px-3 py-1.5 text-left text-sm text-hs-text-body hover:bg-hs-card disabled:text-hs-text-faint disabled:cursor-default';

/**
 * Right-click menu for a module on the canvas: the layering, duplicate and
 * delete actions the property panel keeps at its bottom, plus the two things
 * only a menu can offer — "select the module behind" (the way to reach
 * something a bigger module covers, now that a plain click no longer cycles)
 * and hiding the module on the display without deleting it.
 */
export default function ModuleContextMenu({
  menu,
  screenId,
  modules,
  onClose,
}: {
  menu: ModuleMenuState;
  screenId: string;
  modules: ModuleInstance[];
  onClose: () => void;
}) {
  const t = useTranslate('editor');
  const ref = useRef<HTMLDivElement>(null);
  const { reorderModule, duplicateModule, updateModule, removeModule, selectModule } = useEditorStore();
  useOutsidePointerDown(true, [ref], onClose);
  useEscapeKey(onClose);

  const mod = modules.find((m) => m.id === menu.moduleId);
  if (!mod) return null;

  const { atFront, atBack } = stackExtremes(modules, mod.id);
  // Everything under the click point, topmost first; the module behind is
  // the one right after this module in that list.
  const hits = stackOrder(modules)
    .filter((m) =>
      menu.canvasX >= m.position.x && menu.canvasX <= m.position.x + m.size.w &&
      menu.canvasY >= m.position.y && menu.canvasY <= m.position.y + m.size.h,
    )
    .reverse();
  const behind = hits[hits.findIndex((m) => m.id === mod.id) + 1] ?? null;
  const hidden = mod.enabled === false;

  const run = (fn: () => void) => { fn(); onClose(); };

  return (
    <div
      ref={ref}
      role="menu"
      data-testid="module-context-menu"
      className="fixed z-50 w-52 rounded-lg border border-hs-border-strong bg-hs-panel py-1 shadow-xl"
      style={{ left: menu.x, top: menu.y }}
    >
      <button role="menuitem" className={ITEM} disabled={atFront} onClick={() => run(() => reorderModule(screenId, mod.id, 'front'))}>
        {t('propertyPanel.actions.bringToFront')}
      </button>
      <button role="menuitem" className={ITEM} disabled={atBack} onClick={() => run(() => reorderModule(screenId, mod.id, 'back'))}>
        {t('propertyPanel.actions.sendToBack')}
      </button>
      <button role="menuitem" className={ITEM} disabled={!behind} onClick={() => run(() => { if (behind) selectModule(behind.id); })}>
        {t('canvas.moduleMenu.selectBehind')}
      </button>
      <div className="my-1 border-t border-hs-border-strong/60" />
      <button role="menuitem" className={ITEM} onClick={() => run(() => duplicateModule(screenId, mod.id))}>
        {t('propertyPanel.actions.duplicate')}
      </button>
      <button role="menuitem" className={ITEM} onClick={() => run(() => updateModule(screenId, mod.id, { enabled: hidden ? undefined : false }))}>
        {hidden ? t('canvas.moduleMenu.show') : t('canvas.moduleMenu.hide')}
      </button>
      <div className="my-1 border-t border-hs-border-strong/60" />
      <button
        role="menuitem"
        className="w-full px-3 py-1.5 text-left text-sm text-hs-danger hover:bg-hs-card"
        onClick={async () => {
          onClose();
          if (await useConfirmStore.getState().confirm(t('propertyPanel.actions.confirmDelete'))) {
            removeModule(screenId, mod.id);
          }
        }}
      >
        {t('propertyPanel.actions.delete')}
      </button>
    </div>
  );
}
