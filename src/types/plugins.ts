import type { ComponentType } from 'react';
import type { ModuleStyle } from '@/types/config';

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
}

export type PluginDataRequirement = 'location' | 'weather' | 'calendar';

/** Declared plugin capabilities — transparency for users, not runtime-enforced */
export type PluginPermission = 'network' | 'secrets' | 'events' | 'storage';

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
