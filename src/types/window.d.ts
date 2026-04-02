/**
 * Augment the global Window interface with properties used by the plugin system.
 *
 * - `__HS_SDK__` is the host SDK object exposed by PluginGlobals for plugin IIFE bundles.
 * - `__HS_PLUGIN__` is set by plugin bundles during execution and read by the host.
 * - `React` and `ReactDOM` are exposed as globals so plugins can use them as externals.
 */
interface Window {
  __HS_SDK__?: Record<string, unknown>;
  __HS_PLUGIN__?: Record<string, unknown>;
  React?: typeof import('react');
  ReactDOM?: typeof import('react-dom');
}
