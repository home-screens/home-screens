/**
 * Augment the global Window interface with properties used by the plugin system.
 *
 * - `__HS_SDK__` is the host SDK object exposed by PluginGlobals for plugin IIFE bundles.
 * - `__HS_PLUGIN__` is set by plugin bundles during execution and read by the host.
 * - `React` and `ReactDOM` are exposed as globals so plugins can use them as externals.
 */
interface Window {
  // Optional because it does not exist until PluginGlobals' layout effect runs.
  // The shape itself lives in `@/types/plugins` (see HsSdk) so the display /
  // editor member split is enforced by the compiler on both installers.
  __HS_SDK__?: import('./plugins').HsSdk;
  __HS_PLUGIN__?: Record<string, unknown>;
  React?: typeof import('react');
  ReactDOM?: typeof import('react-dom');
}
