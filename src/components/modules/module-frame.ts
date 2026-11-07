'use client';

import { createContext, useContext } from 'react';

/**
 * What the module's box on the screen draws beside the module itself, so
 * the module's card frame (`ModuleWrapper`) can make room for it. Today
 * that is the open button (`OpenButtonSlot`): a pill at the bottom of the
 * box that the card keeps its content clear of. Zero everywhere else, so a
 * module with no button renders exactly as it always has.
 */
export interface ModuleFrame {
  /** Pixels at the bottom of the card its content must stay clear of. */
  reserveBottomPx: number;
}

const NO_FRAME: ModuleFrame = { reserveBottomPx: 0 };

const ModuleFrameContext = createContext<ModuleFrame>(NO_FRAME);

export const ModuleFrameProvider = ModuleFrameContext.Provider;

export function useModuleFrame(): ModuleFrame {
  return useContext(ModuleFrameContext);
}
