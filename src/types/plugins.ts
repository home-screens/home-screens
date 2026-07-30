import type { ComponentType, ReactNode } from 'react';
import type { ModuleStyle } from '@/types/config';
import type { ProvidedStateKey } from '@/lib/shared-state-types';

/** Declaration for a secret a plugin requires (e.g. an API key) */
export interface PluginSecretDeclaration {
  key: string;            // identifier, e.g. "api_key"
  label: string;          // display name, e.g. "Spotify API Key"
  description?: string;   // help text
  required: boolean;      // show warning if not configured
  placeholder?: string;   // input hint
}

/** Schema for a plugin's manifest.json */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  minAppVersion: string;
  moduleType: string; // becomes "plugin:<moduleType>" in the app
  category: string; // built-in ModuleCategory or any custom string
  icon: string; // lucide icon name
  defaultConfig: Record<string, unknown>;
  defaultSize: { w: number; h: number };
  defaultStyle?: Partial<ModuleStyle>;
  configSchema?: PluginConfigSchema;
  /**
   * Declarative schema for plugin-level settings (connection URLs, poll
   * cadence) — values shared by every instance of the plugin, stored on the
   * plugin's `installed.json` record rather than any module's config. The
   * editor renders it in the plugin manager with the same widget renderer as
   * `configSchema`; values reach plugin code via `__HS_SDK__.getPluginSettings`
   * and are passed to the `stateProvider` component as a prop. A plugin's
   * ConfigSection can also write them inline (editor-only
   * `__HS_SDK__.setPluginSettings`, merge semantics) so connection setup can
   * live in the module panel without per-module storage. Secrets never go
   * here — they stay in the manifest `secrets` declarations.
   */
  settingsSchema?: PluginConfigSchema;
  exports: {
    component: string; // typically "default"
    configSection?: string; // optional named export
    /**
     * Optional headless state-provider component. The host mounts one
     * instance per plugin (in `PluginServiceLayer`, alive across screen
     * rotation) and hands it the demand-driven key set — every shared-state
     * key of this plugin's namespace referenced by any visibility condition
     * or Text-module token on the display. The component publishes exactly
     * those keys via `publishState` and renders null. Plugins that export
     * this no longer need `backgroundProvider` module instances.
     *
     * Contract obligations beyond "publish the demanded keys":
     *
     * - **Clear on shrink.** When a key drops out of `demandedKeys` (the
     *   user deleted or re-pointed the referencing condition), the provider
     *   must `clearState` it so conditions elsewhere fall back to their
     *   `whenUnknown` behavior instead of holding a stale value forever.
     *   Diff the previous key set against the new prop and clear the
     *   difference.
     *
     * - **Idle when empty.** The provider stays mounted even while
     *   `demandedKeys` is empty — the host cannot unmount it on demand
     *   shrinking to zero without skipping the clear pass above. Open
     *   connections and start polling only when `demandedKeys` is
     *   non-empty, and tear them down when it empties; a provider that
     *   polls unconditionally from a mount effect will hit its upstream
     *   forever on every install with zero conditions.
     */
    stateProvider?: string;
  };
  dataRequirements?: PluginDataRequirement[];
  prefetchUrl?: string | null;
  secrets?: PluginSecretDeclaration[];
  /**
   * Server-side auth adapter for APIs that need more than a static key:
   * OAuth2 flows or a named proprietary adapter (e.g. Garmin SSO). The host
   * runs the flow, stores tokens out-of-tree at `data/plugin-tokens/`, and
   * transparently injects/refreshes the access token on proxy requests.
   */
  auth?: PluginAuth;
  allowedDomains?: string[];  // e.g. ["api.spotify.com", "*.openweathermap.org"]
  permissions?: PluginPermission[];
  /**
   * Config migrations to run when the plugin is updated, keyed by the version
   * that *introduces* each change — rename a field in 1.1.0 and you key that
   * migration `"1.1.0"`. Updating from `oldVersion` runs every entry above
   * `oldVersion` and up to and including `version`, in ascending order.
   *
   * Mis-keying is not a harmless no-op: an entry keyed one version too low is
   * skipped for the update that ships it but still runs for anyone who skips
   * past that version, so the config ends up in a different shape depending on
   * how many releases a user happened to miss.
   */
  configMigrations?: Record<string, { renames?: Record<string, string>; defaults?: Record<string, unknown> }>;
  /**
   * Optional translation dictionaries shipped with the plugin.
   *
   * Keys are BCP-47 tags (e.g. `"en-US"`, `"de-DE"`). Values are paths to a
   * JSON dictionary file relative to the plugin root — so for a plugin
   * installed at `data/plugins/my-plugin/` a value of
   * `"translations/de-DE.json"` resolves to
   * `data/plugins/my-plugin/translations/de-DE.json`.
   *
   * At load time the plugin loader picks the first tag in the active
   * locale's fallback chain that has an entry here, fetches the file, and
   * registers it under the namespace `plugin:<pluginId>`. Plugin code can
   * then call `__HS_SDK__.translate('plugin:<pluginId>.someKey')` to look
   * strings up. The dictionary supports the same nested + plural-form
   * shape as the host's built-in namespaces.
   *
   * Absent or empty: backwards-compatible no-op — the plugin loads as
   * before and `translate('plugin:<pluginId>.foo')` returns the raw key.
   */
  translations?: Record<string, string>;
  /**
   * Shared-state keys this plugin publishes via `__HS_SDK__.publishState`,
   * advertised so the editor's visibility-condition picker can offer them.
   * Static keys only — the manifest is JSON. Config-driven keys (e.g. a
   * per-entity list) instead export a `deriveProvidedKeys(config)` function
   * from the IIFE bundle, which the loader passes to the module registry.
   */
  providesState?: ProvidedStateKey[];
}

export type PluginDataRequirement = 'location' | 'weather' | 'calendar';

/** Declared plugin capabilities.
 *  Most are transparency-only ('network', 'secrets', 'events', 'storage', 'oauth').
 *  'localNetwork' is RUNTIME-ENFORCED: without it, the proxy rejects URLs
 *  that resolve to RFC1918 / mDNS / link-local addresses. With it, the
 *  relaxed check is applied — still blocks loopback and cloud-metadata IPs. */
export type PluginPermission = 'network' | 'secrets' | 'events' | 'storage' | 'localNetwork' | 'oauth';

/**
 * Server-side auth adapter declaration. The host implements every flow —
 * plugins never run server-side code; they declare which flow they need and
 * the host injects the resulting token into proxy requests.
 */
export type PluginAuth = OAuth2Auth | GarminAuth;

/**
 * Named proprietary adapter for Garmin Connect's mobile SSO flow
 * (email/password + optional MFA → DI bearer tokens). No URLs, scopes, or
 * client credentials — the flow is fixed and implemented by the host
 * (`src/lib/plugin-auth-garmin.ts`). Tokens are injected as an
 * `Authorization: Bearer` header on proxy requests to the plugin's
 * garmin.com allowedDomains entries.
 */
export interface GarminAuth {
  type: 'garmin';
}

/** Declarative OAuth2 configuration covering the three standard grant flows. */
export interface OAuth2Auth {
  type: 'oauth2';
  flow: 'authorization_code' | 'device_code' | 'client_credentials';
  authorizationUrl?: string;       // required for authorization_code and device_code
  tokenUrl: string;
  revokeUrl?: string;
  revokeTokenType?: 'access_token' | 'refresh_token'; // default 'access_token'
  scopes: string[];
  scopeSeparator?: string;         // default ' '
  pkce?: boolean;                  // default true for authorization_code
  clientAuthentication?: 'body' | 'header' | 'none'; // default 'body'
  tokenPlacement: 'header' | 'query';
  tokenParamName?: string;         // required for query placement
  tokenTargetDomains: string[];    // required, non-empty subset of allowedDomains that receive the token
  extraAuthParams?: Record<string, string>;
  extraTokenParams?: Record<string, string>;
  /** Handle non-standard token responses (dot paths into the response JSON). */
  tokenResponseTransform?: {
    accessTokenPath?: string;      // default "access_token"
    refreshTokenPath?: string;     // default "refresh_token"
    expiresInPath?: string;        // default "expires_in"
    expiresInUnit?: 'seconds' | 'milliseconds'; // default 'seconds'
  };
  secrets: {
    clientId: string;              // key name in plugin secrets[]
    clientSecret?: string;         // optional for public PKCE clients
  };
}

/** JSON Schema with UI widget annotations for declarative config rendering */
export interface PluginConfigSchema {
  type: 'object';
  properties: Record<string, PluginConfigProperty>;
}

export interface PluginConfigProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  title?: string;
  description?: string;       // rendered as help text below the control
  default?: unknown;
  minimum?: number;
  maximum?: number;
  enum?: (string | number)[];
  enumLabels?: string[];
  'ui:widget'?:
    | 'slider' | 'toggle' | 'text' | 'select' | 'color' | 'number'  // existing
    | 'textarea'          // multi-line text input
    | 'multiselect'       // checkbox group from enum values
    | 'time';             // HH:MM time picker
  'ui:step'?: number;
  'ui:group'?: string;        // visual section grouping header
  'ui:showWhen'?: {           // conditional visibility
    field: string;            // other config field key
    equals: string | number | boolean;  // show this field when field === equals
  };
  'ui:placeholder'?: string;  // input placeholder text
  // For type: 'array'
  items?: PluginConfigProperty;           // schema for each array element
  // For type: 'object'
  properties?: Record<string, PluginConfigProperty>;  // nested properties
}

/** Record for an installed plugin in data/plugins/installed.json */
export interface InstalledPlugin {
  id: string;
  version: string;
  installedAt: string;
  enabled: boolean;
  moduleType: string; // raw type from manifest (without "plugin:" prefix)
  /** Set during update — the version being replaced, cleared after config migration */
  previousVersion?: string;
  /** Where the plugin came from. Undefined ⇒ 'marketplace' (legacy entries). */
  source?: 'marketplace' | 'external';
  /**
   * User opted into beta versions of this plugin (set when installing a beta
   * version, cleared when installing a stable one). Absent = stable channel.
   * Deliberately narrower than RegistryPlugin.channel / RegistryPluginVersion.channel
   * (both `'stable' | 'beta'`) — an install record only ever needs to say
   * "currently opted into beta" or not; there's no separate persisted 'stable'
   * state to represent.
   */
  channel?: 'beta';
  /** For source === 'external': the URL the tarball was downloaded from (with {version} intact). */
  externalUrl?: string;
  /**
   * Plugin-level settings, shaped by the manifest's `settingsSchema`.
   * Stored here (not in config.json) so they survive plugin upgrades and
   * ride the existing `/api/plugins/installed` payload to the display.
   */
  settings?: Record<string, unknown>;
}

export interface InstalledPluginsFile {
  schemaVersion: number;
  plugins: InstalledPlugin[];
}

/** Runtime state of a loaded plugin in the Zustand store */
export interface LoadedPlugin {
  component: ComponentType<Record<string, unknown>>;
  manifest: PluginManifest;
  configSection?: ComponentType<PluginConfigSectionProps>;
  stateProvider?: ComponentType<StateProviderProps>;
  searchStateKeys?: SearchStateKeys;
}

/** One selectable raw value for an enum-like state key. `label` carries the
 *  friendly vocabulary ("Alert"); `value` is the raw string conditions must
 *  store ("on"). The editor renders "Alert (on)" and stores "on". */
export interface StateKeyValueOption {
  value: string;
  label?: string;
}

/**
 * A state key described by a plugin's `searchStateKeys` export, rich enough
 * for the editor's condition builder to offer selection instead of
 * transcription: friendly label, grouping, and the raw value vocabulary.
 */
export interface StateKeyDescriptor {
  /** FULL bus key, prefixed (`plugin:<id>:<rest>`). */
  key: string;
  /** Friendly name: "Back Door Sensor". */
  label: string;
  /** Grouping header inside the plugin's results: an area or domain. */
  group?: string;
  valueType: 'enum' | 'numeric' | 'string';
  /** For `enum`: the selectable raw values (with optional friendly labels). */
  valueOptions?: StateKeyValueOption[];
  /** For `numeric`: unit hint, e.g. "°F". */
  unit?: string;
  /** Live raw value if cheaply known (shown as a hint, never stored). */
  currentValue?: string;
}

/**
 * Optional plugin export (conventional named export, resolved from the IIFE
 * bundle like `deriveProvidedKeys`): search everything the plugin can publish,
 * in friendly terms, for the editor's condition-builder combobox. Editor-only
 * — never called on the display path. Implementations should serve results
 * from a short-TTL cache (the editor debounces but a keystroke burst still
 * fans out) and must tolerate being called with an empty query (return the
 * most useful `limit` keys). Errors/timeouts degrade to the static
 * suggestions path, so throwing is safe but wasteful.
 *
 * FULL-KEY RESOLUTION IS PART OF THE CONTRACT: the host also calls this with
 * a complete prefixed bus key (`plugin:<id>:<rest>`) as the query to resolve
 * a committed condition back to its descriptor (`useStateKeySearch`'s
 * lookupDescriptor). Implementations must match on the bus key itself, not
 * just friendly labels — a label-only fuzzy matcher silently costs users the
 * enum value select and unit hints on every saved condition.
 */
export type SearchStateKeys = (
  query: string,
  opts: { limit: number; settings: Record<string, unknown> },
) => Promise<StateKeyDescriptor[]>;

/**
 * Props the host passes to a plugin's `stateProvider` component. Keys arrive
 * UNPREFIXED (the part after `plugin:<id>:`), matching what the plugin passes
 * to `publishState`. See the `exports.stateProvider` typedoc for the full
 * contract: clear keys that drop out of `demandedKeys`, and stay idle (no
 * polling, no open connections) while the array is empty.
 *
 * BOUNDARY: a provider only receives plugin-level `settings`, never module
 * instance config. Plugins whose keys can only be resolved from per-module
 * config (each instance names its own endpoint or dataset) cannot implement
 * this contract — that category should keep using `backgroundProvider`
 * instances plus `deriveProvidedKeys(config)`, which remain fully supported.
 * Do not contort the key grammar to smuggle per-module config through
 * `demandedKeys`.
 */
export interface StateProviderProps {
  /** Deduped, sorted, referentially stable across renders when unchanged.
   *  May be empty — the provider stays mounted and must idle, not poll. */
  demandedKeys: string[];
  /** Plugin-level settings (manifest `settingsSchema` values). */
  settings: Record<string, unknown>;
}

/** Error state for a plugin that failed to load */
export interface PluginError {
  message: string;
  phase: 'load' | 'execute' | 'register';
}

/**
 * The `window.__HS_SDK__` contract.
 *
 * Two components install into one object: `PluginGlobals` (mounted in both the
 * display and editor layouts) installs everything below except the two members
 * marked editor-only, which `PluginGlobalsEditor` adds on top in the editor
 * layout so the editor store stays out of the display bundle.
 *
 * That split used to live only in prose, with the object typed as
 * `Record<string, unknown>` — so nothing caught a member added to one surface
 * only, renamed, or given a different signature, and the failure surfaced as a
 * TypeError inside a third-party bundle at runtime. Declaring it here makes the
 * display/editor split a property of the type instead.
 *
 * Members are declared as `typeof import(...)` wherever they forward a host
 * function unchanged, so a signature change on the host side is a compile error
 * here rather than a silent contract break for plugin authors. The `import
 * type` form is fully erased, so this stays a types-only module.
 *
 * `startAuth` and `setPluginSettings` are NOT optional: the display installs
 * rejecting stubs so presence is invariant across surfaces and only behavior
 * differs. A plugin calling them on a kiosk gets a resolved rejection, not a
 * TypeError that would take the whole display tree down.
 */
export interface HsSdk {
  // ── CSS class strings for consistent editor form styling ──────────
  INPUT_CLASS: string;
  NESTED_INPUT_CLASS: string;

  // ── UI components (the same ones built-in modules use) ────────────
  Slider: typeof import('@/components/ui/Slider').default;
  ColorPicker: typeof import('@/components/ui/ColorPicker').default;
  Toggle: typeof import('@/components/ui/Toggle').default;
  SectionHeading: typeof import('@/components/ui/SectionHeading').default;
  ModuleLoadingState: (props: {
    loading?: boolean;
    error?: string;
    children: ReactNode;
  }) => ReactNode;

  // ── Hooks ─────────────────────────────────────────────────────────
  useFetchData: typeof import('@/hooks/useFetchData').useFetchData;

  // ── Utilities ─────────────────────────────────────────────────────
  displayCache: {
    get: typeof import('@/lib/display-cache').displayCache['get'];
    set: typeof import('@/lib/display-cache').displayCache['set'];
    prefetch: typeof import('@/lib/display-cache').displayCache['prefetch'];
  };
  getHostSettings: typeof import('@/lib/plugin-host-settings').getHostSettings;
  getPluginSettings: (pluginId: string) => Record<string, unknown>;
  emit: typeof import('@/lib/plugin-events').pluginEventBus.emit;
  on: (channel: string, handler: (data: unknown) => void) => () => void;

  // ── Shared-state bus ──────────────────────────────────────────────
  publishState: (pluginId: string, key: string, value: string) => void;
  clearState: (pluginId: string, key: string) => void;
  reportProviderHealth: (
    pluginId: string,
    status: import('@/lib/provider-health-store').ProviderHealthStatus,
  ) => void;

  // ── Server-side proxy + auth ──────────────────────────────────────
  pluginFetch: (
    pluginId: string,
    options: {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      payload?: string;
      secretInjections?: {
        header?: Record<string, string>;
        query?: Record<string, string>;
      };
      cacheTtlMs?: number;
      skipAuth?: boolean;
    },
  ) => Promise<Response>;
  getAuthStatus: (pluginId: string) => Promise<{ connected: boolean; expiresAt?: number }>;
  /** Editor-only behavior. On the display this resolves to a no-op. */
  startAuth: (pluginId: string) => void;
  /** Editor-only behavior. On the display this rejects with `ok: false`. */
  setPluginSettings: (
    pluginId: string,
    updates: Record<string, unknown>,
  ) => Promise<{ ok: boolean; error?: string }>;

  // ── i18n ──────────────────────────────────────────────────────────
  locale: string;
  translate: (key: string, vars?: Record<string, string | number>) => string;
  formatDate: (date: Date | number, pattern: string) => string;
  formatNumber: (n: number, opts?: Intl.NumberFormatOptions) => string;

  // ── Editor-only: absent entirely on the display ───────────────────
  /** Installed by PluginGlobalsEditor. Undefined on a kiosk. */
  AccordionSection?: typeof import('@/components/editor/AccordionSection').default;
  /** Installed by PluginGlobalsEditor. Undefined on a kiosk. */
  useModuleConfig?: <T = Record<string, unknown>>(
    moduleId: string,
    screenId: string,
  ) => { config: T; set: (updates: Partial<T>) => void };
}

/** Props injected into a plugin's custom ConfigSection component */
export interface PluginConfigSectionProps {
  config: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
  moduleId: string;
  screenId: string;
}

/** Entry in the external plugin registry (plugins.json) */
export interface RegistryPlugin {
  id: string;
  name: string;
  description: string;
  author: string;
  repo: string;
  license: string;
  category: string; // built-in ModuleCategory or any custom string
  tags: string[];
  icon: string;
  verified: boolean;
  /**
   * Registry-level channel; 'beta' hides this plugin from Browse unless the
   * user opts in. Absent = stable.
   */
  channel?: 'stable' | 'beta';
  permissions?: PluginPermission[];
  versions: RegistryPluginVersion[];
}

export interface RegistryPluginVersion {
  version: string;
  minAppVersion: string;
  maxAppVersion?: string;
  /**
   * Per-version channel; lets a stable plugin ship a beta build (e.g.
   * '1.2.0-beta.1') without changing the plugin's own channel. Absent = stable.
   */
  channel?: 'stable' | 'beta';
  releaseDate: string;
  downloadUrl: string;
  sha256: string;
  changelog?: string;
}

export interface PluginRegistry {
  schemaVersion: number;
  lastUpdated: string;
  plugins: RegistryPlugin[];
}
