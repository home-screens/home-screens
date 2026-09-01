import type { ReactElement } from 'react';
import { Settings2 } from 'lucide-react';
import { TEXT_OPACITY } from '@/lib/constants';
import { settingsPath } from '@/lib/settings-route';
import type { FetchError } from '@/lib/fetch-error';
import type { ModuleStyle } from '@/types/config';
import { useTranslate } from '@/i18n';
import ModuleWrapper from './ModuleWrapper';
import { EditorSettingsLink } from './EditorSettingsLink';
import { useModuleSurface } from './module-surface';

function SkeletonBars() {
  return (
    <div className="flex flex-col gap-2.5 w-full max-w-[70%]" aria-hidden="true">
      <div className="h-3 rounded-full bg-current opacity-[0.08] animate-pulse w-[85%]" />
      <div className="h-3 rounded-full bg-current opacity-[0.06] animate-pulse w-full" style={{ animationDelay: '150ms' }} />
      <div className="h-3 rounded-full bg-current opacity-[0.08] animate-pulse w-[60%]" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

/** The one plain sentence a setup card shows for a classified setup error. */
export function useSetupSentence(): (error: FetchError) => string {
  const t = useTranslate('modules');
  return (error) => {
    const setup = error.setup;
    if (!setup) return t('common.setup.needsSetup');
    if (setup.needs === 'invalidKey') return t('common.setup.keyNotWorking', { service: setup.service });
    if (setup.needs === 'connection') return t('common.setup.notConnected', { service: setup.service });
    return t('common.setup.needsKey', { service: setup.service });
  };
}

/**
 * Calm card for a module that is waiting on the household to finish setting
 * something up (a key, a connection). On the wall the footer says where to
 * go; in the editor it is a link to the API keys page. Never red: the person
 * reading the wall is usually not the person who can fix it.
 */
export function ModuleSetupState({ style, error, message }: { style: ModuleStyle; error?: FetchError | null; message?: string }) {
  const t = useTranslate('modules');
  const surface = useModuleSurface();
  const sentence = useSetupSentence();
  const text = message ?? (error ? sentence(error) : t('common.setup.needsSetup'));
  const page = error?.setup?.page ?? 'integrations';
  return (
    <ModuleWrapper style={style}>
      <div
        data-testid="module-setup-state"
        className="flex flex-col items-center justify-center gap-2 h-full px-4 text-center"
      >
        <Settings2 size="1.6em" style={{ opacity: TEXT_OPACITY.tertiary }} aria-hidden="true" />
        <p style={{ fontSize: '0.9em', opacity: TEXT_OPACITY.secondary }}>{text}</p>
        {surface === 'editor' ? (
          <EditorSettingsLink
            href={settingsPath({ kind: 'defaults', page })}
            style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.secondary }}
          >
            {page === 'weather' ? t('common.setup.openWeatherSettings') : t('common.setup.openSettings')}
          </EditorSettingsLink>
        ) : (
          <p style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.tertiary }}>{t('common.setup.finishInEditor')}</p>
        )}
      </div>
    </ModuleWrapper>
  );
}

/**
 * Quiet placeholder for a module whose data is not arriving right now. The
 * editor is where the person who can act on it is looking, so only there
 * the developer-facing detail is shown underneath.
 */
export function ModuleNotUpdatingState({ style, error }: { style: ModuleStyle; error?: FetchError | null }) {
  const t = useTranslate('modules');
  const surface = useModuleSurface();
  return (
    <ModuleWrapper style={style}>
      <div className="flex flex-col items-center justify-center gap-1 h-full px-4 text-center">
        <p data-testid="module-not-updating" className="text-sm" style={{ opacity: TEXT_OPACITY.dim }}>
          {t('common.notUpdating')}
        </p>
        {surface === 'editor' && error?.message && (
          <p data-testid="module-error-detail" className="text-xs break-words" style={{ opacity: TEXT_OPACITY.tertiary }}>
            {error.message}
          </p>
        )}
      </div>
    </ModuleWrapper>
  );
}

/**
 * Loading state, and the failure states for a module with no data yet.
 *
 * A classified `setup` error renders the setup card; a `transient` error
 * renders a quiet "not updating" line. The developer-facing message is never
 * printed on the wall. A plain string error (plugins built against the
 * string contract) is shown as-is, muted.
 */
export function ModuleLoadingState({ style, message, error }: { style: ModuleStyle; message: string; error?: FetchError | string | null }) {
  if (error && typeof error !== 'string') {
    return error.kind === 'setup'
      ? <ModuleSetupState style={style} error={error} />
      : <ModuleNotUpdatingState style={style} error={error} />;
  }
  return (
    <ModuleWrapper style={style}>
      <div className="flex items-center justify-center h-full px-4">
        {error ? (
          <p className="text-center text-sm" style={{ opacity: TEXT_OPACITY.dim }}>{error}</p>
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
  error?: FetchError | null;
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
