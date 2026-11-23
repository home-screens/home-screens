import type { ReactElement } from 'react';
import { Settings2 } from 'lucide-react';
import { TEXT_OPACITY } from '@/lib/constants';
import { settingsPath } from '@/lib/settings-route';
import type { FetchError } from '@/lib/fetch-error';
import type { ModuleStyle, ModuleType } from '@/types/config';
import { getModuleDefinition } from '@/lib/module-registry';
import { useTranslate } from '@/i18n';
import ModuleWrapper from './ModuleWrapper';
import { EditorSettingsLink } from './EditorSettingsLink';
import { useModuleSurface } from './module-surface';
import { useFullscreenState } from './shared/fullscreen-state-context';

/** Three pulsing bars, in ems of the card's type, so a big-type card draws big bars. */
function SkeletonBars() {
  const bar = { height: '0.75em' };
  return (
    <div className="flex flex-col w-full max-w-[70%]" style={{ gap: '0.6em' }} aria-hidden="true">
      <div className="rounded-full bg-current opacity-[0.08] animate-pulse w-[85%]" style={bar} />
      <div className="rounded-full bg-current opacity-[0.06] animate-pulse w-full" style={{ ...bar, animationDelay: '150ms' }} />
      <div className="rounded-full bg-current opacity-[0.08] animate-pulse w-[60%]" style={{ ...bar, animationDelay: '300ms' }} />
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
 * Quiet placeholder for a module whose data is not arriving right now, or
 * never arrived: one wording on every card (`common.notUpdating`), sized in
 * ems of the card's type like the empty and setup states. The editor is where
 * the person who can act on it is looking, so only there the
 * developer-facing detail is shown underneath.
 */
export function ModuleNotUpdatingState({ style, error }: { style: ModuleStyle; error?: FetchError | null }) {
  const t = useTranslate('modules');
  const surface = useModuleSurface();
  const roomy = useFullscreenState();
  return (
    <ModuleWrapper style={style}>
      <div className="flex flex-col items-center justify-center h-full px-4 text-center" style={{ gap: '0.25em' }}>
        <p data-testid="module-not-updating" style={{ fontSize: '0.875em', opacity: roomy ? TEXT_OPACITY.secondary : TEXT_OPACITY.dim }}>
          {t('common.notUpdating')}
        </p>
        {surface === 'editor' && error?.message && (
          <p data-testid="module-error-detail" className="break-words" style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.tertiary }}>
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
 * string contract) is shown as-is, muted. `stalled` is for data that has been
 * on its way too long with no error to show: it reads "not updating" too.
 */
export function ModuleLoadingState({ style, message, error, stalled = false }: {
  style: ModuleStyle;
  message: string;
  error?: FetchError | string | null;
  stalled?: boolean;
}) {
  if (error && typeof error !== 'string') {
    return error.kind === 'setup'
      ? <ModuleSetupState style={style} error={error} />
      : <ModuleNotUpdatingState style={style} error={error} />;
  }
  if (stalled && !error) return <ModuleNotUpdatingState style={style} />;
  return (
    <ModuleWrapper style={style}>
      {error ? (
        <div className="flex items-center justify-center h-full px-4">
          <p className="text-center" style={{ fontSize: '0.875em', opacity: TEXT_OPACITY.dim }}>{error}</p>
        </div>
      ) : (
        <ModuleLoadingBody message={message} />
      )}
    </ModuleWrapper>
  );
}

/**
 * The loading state's body, without the card: the skeleton bars and the
 * caption, in ems of the type around it. For a view that loads inside a
 * card already drawn (the meal card's grocery list); everything else goes
 * through `ModuleLoadingState`.
 */
export function ModuleLoadingBody({ message }: { message: string }) {
  // Read across a room on a full-screen module, so a stronger ink there.
  const roomy = useFullscreenState();
  return (
    <div className="flex items-center justify-center h-full px-4">
      <div data-testid="module-loading" className="flex flex-col items-center w-full" style={{ gap: '0.75em' }}>
        <SkeletonBars />
        <p className="text-center" style={{ fontSize: '0.75em', opacity: roomy ? TEXT_OPACITY.secondary : TEXT_OPACITY.tertiary }} aria-live="polite">{message}</p>
      </div>
    </div>
  );
}

/**
 * The body of an empty state, without the card. Pass `type` for a module
 * that has nothing configured yet: it then renders the one placeholder shape
 * every unconfigured module shares (a muted icon, the module's name, and one
 * plain line saying what to add), so a fresh module reads as "waiting for
 * setup" rather than a broken box. Without `type` it is a single muted line,
 * for data-driven empties ("No headlines") that already have context.
 *
 * Views that render inside their module's own card (the clock's elapsed
 * view) use this directly; everything else goes through `ModuleEmptyState`.
 */
export function ModuleEmptyBody({ type, message }: { type?: ModuleType; message: string }) {
  const t = useTranslate('modules');
  const def = type ? getModuleDefinition(type) : undefined;
  const Icon = def?.icon;
  // The wall loads only the modules namespace, so the palette's translated
  // label (editor namespace) is mirrored as `<type>.name`; the registry
  // label covers a type that has no entry yet.
  const nameKey = `${type}.name`;
  const translated = type ? t(nameKey) : '';
  const name = def ? (translated === nameKey ? def.label : translated) : '';
  return (
    <div
      data-testid="module-empty-state"
      className="flex flex-col items-center justify-center h-full px-4 text-center"
      style={{ gap: '0.5em' }}
    >
      {Icon && <Icon size="3.25em" strokeWidth={1.4} style={{ opacity: TEXT_OPACITY.tertiary }} aria-hidden="true" />}
      {name && <p style={{ fontSize: '1.5em', fontWeight: 600, lineHeight: 1.2, opacity: TEXT_OPACITY.heading }}>{name}</p>}
      <p style={{ fontSize: type ? '1.2em' : undefined, lineHeight: 1.35, opacity: TEXT_OPACITY.dim }}>{message}</p>
    </div>
  );
}

/** `ModuleEmptyBody` inside the module card. */
export function ModuleEmptyState({ style, type, message }: { style: ModuleStyle; type?: ModuleType; message: string }) {
  return (
    <ModuleWrapper style={style}>
      <ModuleEmptyBody type={type} message={message} />
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
