import type { ReactNode, Ref } from 'react';
import type { FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import type { ModuleStyle } from '@/types/config';
import { FullscreenStateContext } from './fullscreen-state-context';

/** The type size of a full-screen module's states, as a share of the canvas's short side: 28 px on a 1080-wide wall. */
const STATE_TYPE_SHARE = 0.026;

/**
 * The card style a full-screen module hands the shared states (`moduleGate`,
 * `ModuleLoadingState`, `ModuleEmptyState`, `ModuleSetupState`,
 * `LocationRequired`): the theme's ink, a see-through card, and a type size
 * from the canvas, so "Loading…" and "Not updating right now" read across a
 * room instead of at the editor's 16 px.
 */
export function fullscreenStateStyle(
  style: ModuleStyle,
  theme: Pick<FullscreenThemeTokens, 'text'>,
  dims: { w: number; h: number },
): ModuleStyle {
  return { ...style, textColor: theme.text, backgroundColor: 'transparent', fontSize: Math.round(Math.min(dims.w, dims.h) * STATE_TYPE_SHARE) };
}

/**
 * The ground every full-screen module's pre-content state sits on: the
 * theme's own background, filling the canvas, so a loading, failed or
 * not-set-up screen looks like the module it belongs to rather than a bare
 * line on black. Pair it with `fullscreenStateStyle` for the state inside.
 *
 * `backdrop` is for a module that paints its own ground over the theme (the
 * weather's sky): it is drawn behind the state, so the state's ink sits on
 * the same ground the module's real screen does.
 */
export function FullscreenStateShell({ theme, containerRef, backdrop, children, ...attrs }: {
  theme: Pick<FullscreenThemeTokens, 'bg' | 'bgImage'>;
  /** The module's measuring ref, so the canvas size is known while the state shows. */
  containerRef?: Ref<HTMLDivElement>;
  backdrop?: ReactNode;
  children: ReactNode;
  /** The caller's own marks for its tests. */
  [attr: `data-${string}`]: string | undefined;
}) {
  return (
    <div
      {...attrs}
      ref={containerRef}
      className="w-full h-full"
      style={{
        backgroundColor: theme.bg,
        backgroundImage: theme.bgImage ?? 'none',
        ...(backdrop ? { position: 'relative', overflow: 'hidden' } : null),
      }}
    >
      {backdrop}
      <FullscreenStateContext.Provider value>
        {backdrop ? <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>{children}</div> : children}
      </FullscreenStateContext.Provider>
    </div>
  );
}
