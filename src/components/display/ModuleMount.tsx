'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { ModuleInstance } from '@/types/config';
import { getModuleComponent } from '@/lib/module-components';
import { getModuleDefinition } from '@/lib/module-registry';
import { resolveModuleStyle } from '@/lib/module-style';
import { buildModuleProps, type ModuleDataSource } from '@/lib/module-props';
import ModuleErrorBoundary from '@/components/ModuleErrorBoundary';
import { OpenButtonSlot } from '@/components/modules/shared/OpenScreenButton';
import PluginPlaceholder from '@/components/modules/PluginPlaceholder';
import { useTranslate } from '@/i18n';
import OverlayBoundary from './OverlayBoundary';

interface ModuleMountProps {
  mod: ModuleInstance;
  source: ModuleDataSource;
  /** Where the module sits in its layer. */
  box: CSSProperties;
  /** Drawn by the layer above the rotating canvas. */
  pinned?: boolean;
  /**
   * Mounted for its data loop only, in a layer nobody sees: no tap target,
   * no stand-in while a plugin loads, and a failure draws nothing and is
   * tried again.
   */
  unseen?: boolean;
}

/**
 * One module instance on a wall: its component found, its props and style
 * resolved, and a boundary around it so a module that throws while drawing
 * fails alone. The canvas, the pinned layer and the background providers all
 * mount through here, so none of them can miss a step the others take.
 */
export default function ModuleMount({ mod, source, box, pinned, unseen }: ModuleMountProps) {
  const Component = getModuleComponent(mod.type);

  if (!Component) {
    // A plugin whose bundle has not registered yet. The layer re-renders when it does.
    if (unseen || !mod.type.startsWith('plugin:')) return null;
    return (
      <div data-module-id={mod.id} data-module-type={mod.type} data-pinned={pinned ? 'true' : undefined} style={{ ...box, overflow: 'hidden' }}>
        <PluginPlaceholder moduleType={mod.type} />
      </div>
    );
  }

  const style = resolveModuleStyle(mod.style, getModuleDefinition(mod.type));
  const drawn = <Component config={mod.config} style={style} {...buildModuleProps(mod, source)} />;

  if (unseen) {
    return (
      <div style={box}>
        <OverlayBoundary name={mod.type} what="background module">{drawn}</OverlayBoundary>
      </div>
    );
  }

  return (
    <div data-module-id={mod.id} data-module-type={mod.type} data-pinned={pinned ? 'true' : undefined} style={box}>
      <OpenButtonSlot mod={mod} style={style}>
        <DrawnModuleBoundary moduleType={mod.type}>{drawn}</DrawnModuleBoundary>
      </OpenButtonSlot>
    </div>
  );
}

/** The boundary of a module people see: a failure says so in the module's own box. */
function DrawnModuleBoundary({ moduleType, children }: { moduleType: string; children: ReactNode }) {
  // The `modules` namespace is preloaded by the display layout's I18nProvider.
  const tModules = useTranslate('modules');
  return (
    <ModuleErrorBoundary moduleType={moduleType} fallbackText={tModules('common.moduleFailed')}>
      {children}
    </ModuleErrorBoundary>
  );
}
