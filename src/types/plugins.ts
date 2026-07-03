import type { ComponentType } from 'react';
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
  exports: {
    component: string; // typically "default"
    configSection?: string; // optional named export
  };
  dataRequirements?: PluginDataRequirement[];
  prefetchUrl?: string | null;
  secrets?: PluginSecretDeclaration[];
  allowedDomains?: string[];  // e.g. ["api.spotify.com", "*.openweathermap.org"]
  permissions?: PluginPermission[];
  /** Maps fromVersion → { renames, defaults } for config migration on update */
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
 *  Most are transparency-only ('network', 'secrets', 'events', 'storage').
 *  'localNetwork' is RUNTIME-ENFORCED: without it, the proxy rejects URLs
 *  that resolve to RFC1918 / mDNS / link-local addresses. With it, the
 *  relaxed check is applied — still blocks loopback and cloud-metadata IPs. */
export type PluginPermission = 'network' | 'secrets' | 'events' | 'storage' | 'localNetwork';

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
  /** For source === 'external': the URL the tarball was downloaded from (with {version} intact). */
  externalUrl?: string;
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
}

/** Error state for a plugin that failed to load */
export interface PluginError {
  message: string;
  phase: 'load' | 'execute' | 'register';
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
  permissions?: PluginPermission[];
  versions: RegistryPluginVersion[];
}

export interface RegistryPluginVersion {
  version: string;
  minAppVersion: string;
  maxAppVersion?: string;
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
