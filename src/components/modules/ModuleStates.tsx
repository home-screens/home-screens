import type { ReactElement } from 'react';
import { TEXT_OPACITY } from '@/lib/constants';
import type { ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';

function SkeletonBars() {
  return (
    <div className="flex flex-col gap-2.5 w-full max-w-[70%]" aria-hidden="true">
      <div className="h-3 rounded-full bg-current opacity-[0.08] animate-pulse w-[85%]" />
      <div className="h-3 rounded-full bg-current opacity-[0.06] animate-pulse w-full" style={{ animationDelay: '150ms' }} />
      <div className="h-3 rounded-full bg-current opacity-[0.08] animate-pulse w-[60%]" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

export function ModuleLoadingState({ style, message, error }: { style: ModuleStyle; message: string; error?: string | null }) {
  return (
    <ModuleWrapper style={style}>
      <div className="flex items-center justify-center h-full px-4">
        {error ? (
          <p className="text-center text-sm text-red-400/80">{error}</p>
        ) : (
          <div className="flex flex-col items-center gap-3 w-full">
            <SkeletonBars />
            <p className="text-center text-xs" style={{ opacity: TEXT_OPACITY.tertiary }} aria-live="polite">{message}</p>
          </div>
        )}
      </div>
    </ModuleWrapper>
  );
}

export function ModuleEmptyState({ style, message }: { style: ModuleStyle; message: string }) {
  return (
    <ModuleWrapper style={style}>
      <div className="flex items-center justify-center h-full">
        <p className="text-center" style={{ opacity: TEXT_OPACITY.dim }}>{message}</p>
      </div>
    </ModuleWrapper>
  );
}

/**
 * Standard state gate for modules driven by `useFetchData`. Enforces one
 * ordering everywhere: loading (data still null; fetch errors render inside
 * the loading state) → empty → content. Returns the state element to render,
 * or null when the module should render its content.
 *
 * Not a hook — call it after data derivation and early-return the result:
 *
 *   const gate = moduleGate({
 *     style, data, error,
 *     loadingMessage: t('news.loading'),
 *     empty: items.length === 0 && t('news.empty'),
 *   });
 *   if (gate) return gate;
 *
 * Pass `empty` as `<isEmpty> && <message>` so the condition and its message
 * stay together at the call site. Checks that must render before the loading
 * skeleton (e.g. "nothing configured yet") belong before the gate, not in it.
 *
 * Modules that read `data` fields after the gate should early-return with
 * `if (gate || !data) return gate;` — the `!data` re-check is unreachable at
 * runtime (the gate already returned for null data) but gives TypeScript the
 * non-null narrowing without `data!` assertions.
 */
export function moduleGate({ style, data, error, loadingMessage, empty }: {
  style: ModuleStyle;
  /** The useFetchData result; null/undefined renders the loading state. */
  data: unknown;
  error?: string | null;
  loadingMessage: string;
  empty?: string | false;
}): ReactElement | null {
  if (data === null || data === undefined) {
    return <ModuleLoadingState style={style} message={loadingMessage} error={error} />;
  }
  if (empty) {
    return <ModuleEmptyState style={style} message={empty} />;
  }
  return null;
}
