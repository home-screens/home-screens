---
title: Plugins
nextjs:
  metadata:
    title: Plugins
    description: Build and install plugins for Home Screens — runtime-loaded modules with SDK, API proxy, and config UI. Extend your smart display without modifying core code.
    alternates:
      canonical: /docs/plugins
---

Plugins let you add new module types to Home Screens without modifying the core codebase. A plugin is a self-contained bundle that provides a React component, a manifest describing its metadata and configuration, and optionally a custom editor panel. Once installed, a plugin's module appears in the editor palette alongside built-in modules and can be placed on any screen.

---

## How Plugins Work

Plugins follow the same module registry pattern as built-in modules, but load dynamically at runtime instead of being compiled into the app. The key differences:

- **Module type namespacing** — plugin modules are registered as `plugin:<moduleType>` (e.g., `plugin:weather-radar`) to avoid collisions with built-in types.
- **IIFE bundles** — plugins ship as a single JavaScript bundle that assigns exports to `window.__HS_PLUGIN__`. React and ReactDOM are provided by the host as globals, so plugins don't need to bundle their own copies.
- **Declarative config** — plugins define their configuration UI via a JSON schema in the manifest (`configSchema`), or provide a custom React component for more complex editors.
- **Server-side proxy** — plugins call external APIs through a proxy endpoint that injects secrets, validates domains, and enforces rate limits.

### Loading Sequence

When the app starts, plugin loading follows this sequence:

1. Fetch the installed plugins list from `/api/plugins/installed`
2. For each enabled plugin, fetch its `manifest.json` and `dist/bundle.js` in parallel
3. Execute each bundle via inline `<script>` injection, reading exports from `window.__HS_PLUGIN__`
4. Register the plugin in the module registry and the Zustand plugin store
5. Run any pending config migrations (sequentially, to avoid concurrent config writes)
6. Load dev plugins from `localStorage` and start hot-reload polling

---

## Plugin Manifest

Every plugin must include a `manifest.json` at its root. This file defines metadata, configuration, permissions, and exports.

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "A brief description of what this plugin does.",
  "author": "Your Name",
  "license": "MIT",
  "minAppVersion": "0.18.0",
  "moduleType": "my-widget",
  "category": "Personal",
  "icon": "sparkles",
  "defaultConfig": {
    "message": "Hello, world!",
    "refreshInterval": 60
  },
  "defaultSize": { "w": 400, "h": 300 },
  "exports": {
    "component": "default",
    "configSection": "ConfigSection"
  }
}
```

### Required Fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique plugin identifier. Alphanumeric, hyphens, and underscores only. |
| `name` | string | Human-readable display name shown in the editor palette. |
| `version` | string | Semver version string (e.g., `"1.2.0"`). |
| `description` | string | Short description of the plugin. |
| `author` | string | Plugin author name. |
| `license` | string | SPDX license identifier (e.g., `"MIT"`). |
| `minAppVersion` | string | Minimum Home Screens version required. |
| `moduleType` | string | The module type name. Registered as `plugin:<moduleType>` in the app. |
| `category` | string | Module palette category (e.g., `"Weather & Environment"`, `"Personal"`, or any custom string). |
| `icon` | string | Lucide icon name (e.g., `"sparkles"`, `"cloud-rain"`). |
| `defaultConfig` | object | Default configuration values for new instances of this module. |
| `defaultSize` | object | Default grid size as `{ w: number, h: number }` in pixels. |
| `exports` | object | Maps export names: `component` (required) and `configSection` (optional). |

### Optional Fields

| Field | Type | Description |
|---|---|---|
| `defaultStyle` | object | Partial `ModuleStyle` overrides (e.g., `{ "fontSize": 26 }`). |
| `configSchema` | object | JSON Schema with UI widget annotations for declarative config rendering (see below). |
| `dataRequirements` | array | Data the plugin needs from the host: `"location"`, `"weather"`, `"calendar"`. |
| `prefetchUrl` | string | URL to prefetch on the display for faster initial load. Registered with a 5-minute TTL. |
| `secrets` | array | API keys and credentials the plugin requires (see [Plugin Secrets](#plugin-secrets)). |
| `allowedDomains` | array | Domains the plugin proxy can reach (e.g., `["api.example.com", "*.openweathermap.org"]`). Required for `pluginFetch` to work. |
| `permissions` | array | Declared capabilities: `"network"`, `"secrets"`, `"events"`, `"storage"`. Informational for users. |
| `configMigrations` | object | Version-keyed migration rules for renaming or adding config fields on update. |

### Config Schema

The `configSchema` field uses a JSON Schema dialect with UI widget annotations. The editor renders config controls automatically from this schema, so many plugins don't need a custom `ConfigSection` component at all.

```json
{
  "configSchema": {
    "type": "object",
    "properties": {
      "message": {
        "type": "string",
        "title": "Message",
        "description": "Text to display in the widget.",
        "ui:widget": "text",
        "ui:placeholder": "Enter a message..."
      },
      "refreshInterval": {
        "type": "number",
        "title": "Refresh Interval",
        "description": "How often to refresh data, in seconds.",
        "minimum": 10,
        "maximum": 3600,
        "ui:widget": "slider",
        "ui:step": 10
      },
      "theme": {
        "type": "string",
        "title": "Theme",
        "enum": ["light", "dark", "auto"],
        "enumLabels": ["Light", "Dark", "Auto"],
        "ui:widget": "select"
      },
      "showHeader": {
        "type": "boolean",
        "title": "Show Header",
        "ui:widget": "toggle"
      },
      "headerColor": {
        "type": "string",
        "title": "Header Color",
        "ui:widget": "color",
        "ui:showWhen": { "field": "showHeader", "equals": true }
      },
      "advancedMode": {
        "type": "boolean",
        "title": "Advanced Mode",
        "ui:group": "Advanced"
      },
      "notes": {
        "type": "string",
        "title": "Notes",
        "ui:widget": "textarea"
      }
    }
  }
}
```

**Available widgets:** `text`, `textarea`, `number`, `slider`, `toggle`, `select`, `multiselect`, `color`, `time`

**Layout annotations:**

- `ui:group` — groups fields under a visual section heading
- `ui:showWhen` — conditionally shows a field based on another field's value
- `ui:placeholder` — placeholder text for text/textarea inputs
- `ui:step` — step increment for slider/number inputs

**Nested types:** Properties with `type: "array"` use an `items` sub-schema; properties with `type: "object"` use nested `properties`.

---

## Installing Plugins

### From the Registry

Plugins are distributed through a central registry hosted at `home-screens/home-screens-plugins` on GitHub. The editor's plugin browser fetches the registry and shows available plugins with their descriptions, permissions, and version history.

To install a plugin:

1. Open the editor and navigate to the plugin browser
2. Browse or search for the plugin you want
3. Click **Install** and select a version

Behind the scenes, the install process:

1. Fetches the registry index from GitHub (`plugins.json`)
2. Downloads the plugin tarball from the version's `downloadUrl`
3. Verifies the SHA-256 checksum against the registry entry
4. Extracts the tarball to `data/plugins/<pluginId>/`
5. Validates the extracted `manifest.json`
6. Records the installation in `data/plugins/installed.json`

### From a URL

You can also install a plugin directly from any HTTPS tarball URL — useful for private plugins, pre-release builds, or forks that are not in the public registry. Click **Install from URL…** in the plugin browser's Browse tab and paste the tarball URL.

- The URL may include a `{version}` placeholder (e.g. `https://example.com/my-plugin-{version}.tgz`) so the editor can swap versions on later updates without asking you to re-enter the full URL.
- Externally installed plugins show an **External** pill in the Installed tab and get a per-plugin **Update** button that re-downloads from the stored URL.
- URL installs run through the same extract/validate pipeline as marketplace installs. They **cannot overwrite** a plugin ID already installed from the marketplace (checked again after acquiring the per-ID lock to close the TOCTOU race).

### API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/plugins/registry` | GET | Fetch the plugin registry (cached 5 minutes) |
| `/api/plugins/installed` | GET | List installed plugins with a content hash for change detection |
| `/api/plugins/install` | POST | Install a plugin from the registry (`{ pluginId, version }`) |
| `/api/plugins/install-external` | POST | Install a plugin from any HTTPS tarball URL (`{ tarballUrl, version? }`) — the URL may include a `{version}` placeholder |
| `/api/plugins/install` | DELETE | Uninstall a plugin (`{ pluginId }`) |
| `/api/plugins/install` | PATCH | Enable/disable a plugin or clear migration state (`{ pluginId, enabled?, clearPrevVersion? }`) |
| `/api/plugins/manifest/<id>` | GET | Read a plugin's manifest |
| `/api/plugins/bundle/<id>` | GET | Serve a plugin's JavaScript bundle |

---

## Developing a Plugin

The fastest way to get started is to clone the official plugin template:

```bash
git clone https://github.com/home-screens/home-screens-plugin-template my-plugin
cd my-plugin
npm install
```

The template includes a working manifest, a minimal React component, an esbuild config, and dev mode scripts. See the [plugin template repository](https://github.com/home-screens/home-screens-plugin-template) for full setup instructions.

For a real-world example of a fully functional plugin built from an existing built-in module, see the [Standings plugin](https://github.com/home-screens/home-screens-plugin-standings). It demonstrates API proxy usage, custom config sections, multiple view modes, and the complete plugin lifecycle — a good reference for building anything non-trivial.

### Project Structure

A minimal plugin project looks like this:

```
my-plugin/
  manifest.json          # Plugin metadata and config schema
  src/
    index.tsx            # Main component + optional ConfigSection
  dist/
    bundle.js            # Built IIFE bundle (output)
```

### Writing the Component

Your plugin's main component receives its config as props. Use the host SDK (`window.__HS_SDK__`) for shared utilities:

```tsx
const { useFetchData, ModuleLoadingState, getHostSettings, pluginFetch, emit } = window.__HS_SDK__;

export default function MyWidget({ config }: { config: { message: string; refreshInterval: number } }) {
  const settings = getHostSettings();
  const [data, error] = useFetchData(
    `/api/plugins/proxy/my-plugin`,
    config.refreshInterval * 1000
  );

  return (
    <ModuleLoadingState loading={!data} error={error}>
      <div style={{ padding: 16 }}>
        <h2>{config.message}</h2>
        <p>Timezone: {settings.timezone}</p>
      </div>
    </ModuleLoadingState>
  );
}
```

### Plugin SDK (`window.__HS_SDK__`)

The host exposes a shared SDK on `window.__HS_SDK__` that plugins should use instead of bundling their own copies. Available in both display and editor contexts:

| Member | Type | Description |
|---|---|---|
| `useFetchData` | hook | `useFetchData(url, intervalMs)` — polls an API endpoint at a set interval |
| `ModuleLoadingState` | component | Renders loading/error states with consistent styling |
| `Slider` | component | Slider input control |
| `ColorPicker` | component | Color picker control |
| `Toggle` | component | Toggle switch control |
| `SectionHeading` | component | Section heading for editor panels |
| `displayCache` | object | `{ get, set, prefetch }` — client-side data cache |
| `getHostSettings` | function | Returns `{ timezone, units, latitude, longitude, displayWidth, displayHeight, appVersion }` |
| `emit` | function | Emit events to the host (see [Plugin Events](#plugin-events)) |
| `on` | function | Subscribe to host-published events such as `weather.conditions`, `weather.alerts`, and `time.period` (see [Subscribing to Host Events](#subscribing-to-host-events)) |
| `pluginFetch` | function | Server-side proxy for API calls (see [API Proxy](#plugin-api-proxy)) |
| `INPUT_CLASS` | string | CSS class for editor form inputs (consistent styling) |
| `NESTED_INPUT_CLASS` | string | CSS class for nested/compact editor inputs |

**Editor-only members** (available when running in the editor, not on the display):

| Member | Type | Description |
|---|---|---|
| `AccordionSection` | component | Collapsible section for editor property panels |
| `useModuleConfig` | hook | `useModuleConfig(moduleId, screenId)` — returns `{ config, set }` for reading and updating module config |

### Building the Bundle

Your build tool must produce a single IIFE that assigns exports to `window.__HS_PLUGIN__`. React and ReactDOM should be treated as externals (they're provided by the host).

Example with esbuild:

```bash
esbuild src/index.tsx \
  --bundle \
  --format=iife \
  --global-name=__HS_PLUGIN__ \
  --external:react \
  --external:react-dom \
  --outfile=dist/bundle.js
```

The host reads `window.__HS_PLUGIN__[manifest.exports.component]` (typically `"default"`) to find the display component, and optionally `window.__HS_PLUGIN__[manifest.exports.configSection]` for a custom editor panel.

### Custom Config Section

For editor UIs that go beyond what `configSchema` can express, export a `ConfigSection` component:

```tsx
const { AccordionSection, useModuleConfig, INPUT_CLASS } = window.__HS_SDK__;

export function ConfigSection({ moduleId, screenId }: { moduleId: string; screenId: string }) {
  const { config, set } = useModuleConfig(moduleId, screenId);

  return (
    <AccordionSection title="My Plugin Settings">
      <label className="block text-xs text-neutral-400 mb-1">Message</label>
      <input
        className={INPUT_CLASS}
        value={config.message ?? ''}
        onChange={(e) => set({ message: e.target.value })}
      />
    </AccordionSection>
  );
}
```

Reference the export in your manifest:

```json
{
  "exports": {
    "component": "default",
    "configSection": "ConfigSection"
  }
}
```

### Dev Mode

During development, you can load a plugin directly from a local dev server without going through the registry. This lets you iterate quickly with hot reloading.

1. **Start a local server** that serves `manifest.json` and `dist/bundle.js` from the root (e.g., `http://localhost:5555/manifest.json`)

2. **Register the dev plugin** in the editor using the dev plugin panel, or programmatically:

   ```js
   const { loadDevPlugin } = await import('@/lib/plugin-loader');
   await loadDevPlugin('http://localhost:5555');
   ```

When a dev plugin is loaded:

- The manifest is fetched from `<url>/manifest.json`
- The bundle is fetched from `<url>/dist/bundle.js`
- The manifest is registered server-side via `POST /api/plugins/dev` so the proxy can find it
- The plugin is registered client-side in the module registry and Zustand store
- The dev mapping is stored in `localStorage` (not in the config file)
- **Hot reload polling** starts automatically, checking the bundle's ETag every 2 seconds and reloading when it changes

Dev plugins override installed versions of the same plugin. To unload a dev plugin, call `unloadDevPlugin(pluginId)`.

---

## Plugin API Proxy

Plugins should never embed API keys in their client-side bundle. Instead, they use `pluginFetch` to make requests through a server-side proxy that injects secrets and enforces security policies.

### How It Works

```
Plugin component                    Server proxy                     External API
       |                                |                                |
       |-- pluginFetch(id, options) --> |                                |
       |                                |-- validate domain ----------> |
       |                                |-- resolve {{secret}} -------> |
       |                                |-- fetch upstream -----------> |
       |                                |<--- response -----------------|
       |<--- proxied response ---------|                                |
```

### Usage

```tsx
const { pluginFetch } = window.__HS_SDK__;

// Simple GET request
const res = await pluginFetch('my-plugin', {
  url: 'https://api.example.com/data',
  secretInjections: {
    header: { 'Authorization': 'Bearer {{api_key}}' }
  },
  cacheTtlMs: 300000  // cache for 5 minutes
});
const data = await res.json();

// POST request with query parameter secrets
const res = await pluginFetch('my-plugin', {
  url: 'https://api.example.com/search',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  payload: JSON.stringify({ query: 'test' }),
  secretInjections: {
    query: { 'apikey': '{{api_key}}' }
  }
});
```

### `pluginFetch` Options

| Option | Type | Default | Description |
|---|---|---|---|
| `url` | string | (required) | The upstream URL to fetch. Must match a domain in `allowedDomains`. |
| `method` | string | `"GET"` | HTTP method. Allowed: `GET`, `POST`, `PUT`, `PATCH`. |
| `headers` | object | `{}` | Headers to send to the upstream server. |
| `payload` | string | — | Request body for POST/PUT/PATCH requests. |
| `secretInjections` | object | — | Secret placeholders to resolve (see below). |
| `cacheTtlMs` | number | `60000` | Cache TTL for GET responses (0 to disable, max 1 hour). |

### Secret Injection

The `secretInjections` object supports two targets:

- **`header`** — key-value pairs added to the upstream request headers. Values containing `{{secret_key}}` placeholders are resolved from the plugin's secret store before sending.
- **`query`** — key-value pairs added as query parameters. Placeholders are resolved the same way.

For example, if a plugin declares a secret with key `api_key` and the user has configured it to `"sk-abc123"`, then `"Bearer {{api_key}}"` resolves to `"Bearer sk-abc123"` on the server. The raw secret value never reaches the client.

### Proxy Constraints

- **Domain allowlist** — the proxy only forwards requests to domains declared in the manifest's `allowedDomains`. Wildcard prefixes are supported (e.g., `*.example.com` matches `api.example.com`).
- **Rate limiting** — 60 requests per minute per plugin. Returns HTTP 429 when exceeded.
- **Response size** — maximum 5 MB per response.
- **Timeout** — upstream requests time out after 15 seconds.
- **Caching** — GET responses with text/JSON/XML content types are cached per URL + headers hash, with the TTL specified by `cacheTtlMs`.

---

## Plugin Secrets

Plugins that need API keys or credentials declare them in the manifest's `secrets` array. Users configure the actual values through the editor UI. Secrets are stored on disk in the plugin's own directory (`data/plugins/<pluginId>/secrets.json`), separate from the main app secrets.

### Declaring Secrets

```json
{
  "secrets": [
    {
      "key": "api_key",
      "label": "API Key",
      "description": "Your API key from example.com. Get one at https://example.com/keys.",
      "required": true,
      "placeholder": "sk-..."
    },
    {
      "key": "webhook_url",
      "label": "Webhook URL",
      "description": "Optional webhook for push notifications.",
      "required": false
    }
  ]
}
```

### Secret Declaration Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `key` | string | yes | Identifier for the secret. Alphanumeric, hyphens, and underscores only. Used in `{{key}}` placeholders. |
| `label` | string | yes | Display name shown in the editor. |
| `description` | string | no | Help text shown below the input field. |
| `required` | boolean | yes | When `true`, the editor shows a warning if this secret is not configured. |
| `placeholder` | string | no | Placeholder text for the input field. |

### Secrets API

| Endpoint | Method | Description |
|---|---|---|
| `/api/plugins/secrets/<pluginId>` | GET | Returns configured status per secret key (boolean, never raw values) |
| `/api/plugins/secrets/<pluginId>` | PUT | Set a secret (`{ key, value }`) |
| `/api/plugins/secrets/<pluginId>` | DELETE | Remove a secret (`{ key }`) |

The GET endpoint only returns whether each declared secret has a value configured -- it never exposes the raw secret values. Setting a secret validates the key against the manifest's declarations; you cannot store arbitrary keys that aren't declared.

---

## Plugin Events

Plugins can communicate with the host application through an event bus. Two-way traffic is allowed but asymmetric: plugins use `emit` to send commands to the host (navigate, refresh, log) and `on` to subscribe to read-only data channels the host publishes (weather, time-of-day). Plugins **cannot** publish to the subscription channels — those are write-only for the host.

#### Emitting Events

```tsx
const { emit } = window.__HS_SDK__;

// Navigate to the next screen
emit({ type: 'navigate', direction: 'next' });

// Navigate to a specific screen
emit({ type: 'navigate', direction: 'screen', screenIndex: 2 });

// Request a data refresh
emit({ type: 'refresh' });

// Log a message (appears in the browser console with [plugin] prefix)
emit({ type: 'log', level: 'info', message: 'Data loaded successfully' });
```

#### Event Types

| Type | Fields | Description |
|---|---|---|
| `navigate` | `direction`: `"next"`, `"prev"`, or `"screen"`; `screenIndex?`: number | Navigate between screens |
| `refresh` | — | Request the display to refresh its data |
| `log` | `level`: `"info"`, `"warn"`, or `"error"`; `message`: string | Log a message to the browser console |

Unknown event types are silently dropped. Event handlers are wrapped in try-catch to ensure a misbehaving plugin can never crash the host.

#### Subscribing to Host Events

Plugins can subscribe to data the host publishes through `window.__HS_SDK__.on(channel, handler)`. The call returns an unsubscribe function that you should call from your component's cleanup effect to avoid leaking handlers across plugin reloads.

```tsx
const { on } = window.__HS_SDK__;

useEffect(() => {
  const unsubscribe = on('weather.conditions', (event) => {
    // event: { condition, temp, units, icon, summary, humidity?, feelsLike? }
    console.log('Current weather:', event.condition, event.temp);
  });
  return unsubscribe;
}, []);
```

The subscription replays the **last cached value** immediately when you subscribe, so a plugin that mounts after the first weather fetch still sees the current state right away. If the host has never published to the channel yet, the handler simply waits for the next event.

**Channels:**

| Channel | Event shape | When it fires |
|---|---|---|
| `weather.conditions` | `{ condition, temp, units, icon, summary, humidity?, feelsLike? }` where `condition` is one of `clear`, `clouds`, `rain`, `drizzle`, `snow`, `thunderstorm`, `fog`, `wind` | Whenever the host's global weather provider returns a new fetch. The host also publishes from the editor's preview fetch so weather-aware plugins work in the editor preview, not just on the display. |
| `weather.alerts` | `{ alerts: Array<{ headline, severity, event, expires? }> }` where `severity` is `minor`, `moderate`, `severe`, or `extreme` | Whenever the weather provider returns alerts. An empty array is published when alerts clear. |
| `time.period` | `{ period: 'morning' \| 'afternoon' \| 'evening' \| 'night', hour, timezone }` | On the display side at each period transition (4×/day), not every hour. |

Handlers run in insertion order and are isolated from each other — an exception thrown by one handler does not prevent later handlers from running. The host never pushes an event back to `emit`, so plugins cannot use the subscription API to hear their own messages.

---

## Plugin Lifecycle

### Install

1. The tarball is downloaded from the registry's `downloadUrl`
2. Its SHA-256 hash is verified against the registry entry
3. The tarball is extracted to `data/plugins/<pluginId>/`
4. The `manifest.json` is validated
5. An entry is added to `data/plugins/installed.json` with `enabled: true`
6. On the next page load or plugin reload, the bundle is fetched and executed

### Update

1. The new version's tarball is downloaded and verified
2. Files are extracted over the existing plugin directory
3. The `installed.json` entry is updated with the new version and `previousVersion` is set to the old version
4. On the next load, the plugin loader detects `previousVersion` and runs config migrations
5. **Config migrations** apply in version order:
   - `renames` — move config values from old keys to new keys
   - `defaults` — set default values for newly added config keys
   - After explicit migrations, a deep merge with `defaultConfig` adds any remaining new keys
6. After successful migration, `previousVersion` is cleared via PATCH. If migration fails, it retries on the next load.

### Config Migrations

Declare migrations in the manifest keyed by the version they migrate *from*:

```json
{
  "configMigrations": {
    "1.0.0": {
      "renames": { "oldFieldName": "newFieldName" },
      "defaults": { "newFeatureEnabled": true }
    },
    "1.1.0": {
      "defaults": { "anotherNewField": "default-value" }
    }
  }
}
```

When updating from version 1.0.0 to 1.2.0, migrations for versions between the old and new version are applied in ascending order, followed by a deep merge with the new `defaultConfig`.

### Enable / Disable

Plugins can be enabled or disabled without uninstalling. Disabled plugins remain on disk but are skipped during the loading sequence. Toggle via:

```
PATCH /api/plugins/install
{ "pluginId": "my-plugin", "enabled": false }
```

### Uninstall

1. All plugin secrets are deleted from `data/plugins/<pluginId>/secrets.json`
2. The plugin directory `data/plugins/<pluginId>/` is removed
3. The entry is removed from `data/plugins/installed.json`
4. The module is unregistered from the module registry and Zustand store

Any module instances of that plugin type remaining in the config will render as empty/missing modules until removed by the user.

---

## Host Settings

Plugins can read the host's display configuration via `getHostSettings()`. This returns a snapshot of the current settings, which updates when the config changes.

```tsx
const { getHostSettings } = window.__HS_SDK__;

const settings = getHostSettings();
// {
//   timezone: "America/New_York",
//   units: "imperial",
//   latitude: 40.7128,
//   longitude: -74.0060,
//   displayWidth: 1080,
//   displayHeight: 1920,
//   appVersion: "0.19.1"
// }
```

This is useful for plugins that need to adapt to the user's location, timezone, unit preferences, or display dimensions without requiring separate configuration.

---

## Security Model

### Domain Allowlisting

Every plugin must declare the external domains it needs to reach in `allowedDomains`. The proxy rejects any request to a domain not on this list. Wildcard prefixes (`*.example.com`) match the domain itself and all subdomains.

A plugin with an empty or missing `allowedDomains` array cannot make any proxy requests.

### Secret Isolation

Each plugin's secrets are stored in its own directory (`data/plugins/<pluginId>/secrets.json`), separate from other plugins and the main app's secrets. A plugin can only access secrets that are declared in its own manifest. The secrets API validates every key against the manifest before allowing reads or writes.

Secret values are never sent to the client. The proxy resolves `{{placeholder}}` templates server-side and only the final HTTP response reaches the browser.

### Bundle Execution

Plugin bundles execute in the browser's main thread via inline `<script>` injection. They share the same JavaScript context as the host application. The host reads the plugin's exports from `window.__HS_PLUGIN__` immediately after execution and then cleans up the global.

Plugins have access to the full browser environment but should only interact with the host through the documented SDK (`window.__HS_SDK__`). The `permissions` field in the manifest is informational -- it tells users what capabilities a plugin uses but is not runtime-enforced.

### Rate Limiting

The proxy enforces a per-plugin rate limit of 60 requests per minute with a sliding window. This prevents a misbehaving plugin from overwhelming external APIs or the server itself.

### Integrity Verification

Plugins installed from the registry are verified via SHA-256 checksums. The download hash must match the hash recorded in the registry entry. If verification fails, the plugin is not installed.

### Plugin ID Sanitization

Plugin IDs are sanitized to contain only alphanumeric characters, hyphens, and underscores. This prevents directory traversal attacks when constructing filesystem paths for plugin data.

---

## Registry Format

The plugin registry is a JSON file hosted on GitHub. It lists all available plugins with their metadata and version history.

```json
{
  "schemaVersion": 1,
  "lastUpdated": "2026-03-20T12:00:00Z",
  "plugins": [
    {
      "id": "my-plugin",
      "name": "My Plugin",
      "description": "A brief description.",
      "author": "Author Name",
      "repo": "https://github.com/author/my-plugin",
      "license": "MIT",
      "category": "Personal",
      "tags": ["utility", "data"],
      "icon": "sparkles",
      "verified": true,
      "permissions": ["network", "secrets"],
      "versions": [
        {
          "version": "1.0.0",
          "minAppVersion": "0.18.0",
          "releaseDate": "2026-03-15",
          "downloadUrl": "https://github.com/author/my-plugin/releases/download/v1.0.0/my-plugin-1.0.0.tar.gz",
          "sha256": "abc123...",
          "changelog": "Initial release."
        }
      ]
    }
  ]
}
```

### Version Entry Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | string | yes | Semver version string |
| `minAppVersion` | string | yes | Minimum Home Screens version required |
| `maxAppVersion` | string | no | Maximum compatible Home Screens version |
| `releaseDate` | string | yes | ISO 8601 date string |
| `downloadUrl` | string | yes | URL to the `.tar.gz` archive |
| `sha256` | string | yes | SHA-256 hash of the archive for integrity verification |
| `changelog` | string | no | Human-readable changelog for this version |

The `verified` flag on a registry plugin indicates it has been reviewed. The registry is cached server-side for 5 minutes.

---

## File Layout

Installed plugins live under `data/plugins/`:

```
data/plugins/
  installed.json                 # Registry of all installed plugins
  my-plugin/
    manifest.json                # Plugin manifest
    dist/
      bundle.js                  # IIFE JavaScript bundle
    secrets.json                 # Plugin-specific secrets (never committed)
  another-plugin/
    manifest.json
    dist/
      bundle.js
    secrets.json
```

The `installed.json` file tracks installation state:

```json
{
  "schemaVersion": 1,
  "plugins": [
    {
      "id": "my-plugin",
      "version": "1.0.0",
      "installedAt": "2026-03-15T10:30:00.000Z",
      "enabled": true,
      "moduleType": "my-widget"
    }
  ]
}
```

---

## Resources

- [Plugin Template](https://github.com/home-screens/home-screens-plugin-template) — starter repo with manifest, build config, and dev mode scripts. Clone this to create a new plugin.
- [Standings Plugin](https://github.com/home-screens/home-screens-plugin-standings) — fully functional example plugin extracted from a built-in module. Demonstrates API proxy, custom config sections, multiple views, and config migrations.
