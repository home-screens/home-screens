'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Trash2, ToggleLeft, ToggleRight, AlertTriangle, CheckCircle, Shield, Code2, Loader2, PackageSearch } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { editorFetch } from '@/lib/editor-fetch';
import { usePluginStore } from '@/stores/plugin-store';
import Button from '@/components/ui/Button';
import type { RegistryPlugin, InstalledPlugin, PluginRegistry, PluginPermission, PluginSecretDeclaration } from '@/types/plugins';
import type { DevPlugin } from '@/lib/plugin-loader';

interface PluginStorePanelProps {
  onClose: () => void;
}

type Tab = 'browse' | 'installed' | 'updates' | 'developer';

/** Human-readable labels for permission declarations */
const PERMISSION_LABELS: Record<PluginPermission, string> = {
  network: 'Network access',
  secrets: 'Secret storage',
  events: 'Host events',
  storage: 'Local storage',
};

export default function PluginStorePanel({ onClose }: PluginStorePanelProps) {
  const [tab, setTab] = useState<Tab>('browse');
  const [registry, setRegistry] = useState<RegistryPlugin[]>([]);
  const [installed, setInstalled] = useState<InstalledPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [confirmPlugin, setConfirmPlugin] = useState<RegistryPlugin | null>(null);
  const pluginErrors = usePluginStore((s) => s.errors);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [regRes, instRes] = await Promise.all([
        editorFetch('/api/plugins/registry').catch(() => null),
        editorFetch('/api/plugins/installed').catch(() => null),
      ]);
      if (regRes?.ok) {
        const data: PluginRegistry = await regRes.json();
        setRegistry(data.plugins ?? []);
      }
      if (instRes?.ok) {
        const data = await instRes.json();
        setInstalled(data.plugins ?? []);
      }
    } catch (err) {
      console.debug('Failed to fetch plugin data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const installedIds = new Set(installed.map((p) => p.id));

  const runAction = async (pluginId: string, method: string, body: Record<string, unknown>) => {
    setActionInProgress(pluginId);
    setActionError(null);
    try {
      const res = await editorFetch('/api/plugins/install', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      await fetchData();
      usePluginStore.getState().loadPlugins();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleInstallRequest = (plugin: RegistryPlugin) => {
    setConfirmPlugin(plugin);
  };

  const handleInstallConfirm = async (pluginId: string, version: string) => {
    await runAction(pluginId, 'POST', { pluginId, version });
    setConfirmPlugin(null);
  };

  const handleUninstall = (pluginId: string) =>
    runAction(pluginId, 'DELETE', { pluginId });

  const handleToggle = (pluginId: string, enabled: boolean) =>
    runAction(pluginId, 'PATCH', { pluginId, enabled });

  const filteredRegistry = registry.filter((p) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return p.name.toLowerCase().includes(s)
      || p.description.toLowerCase().includes(s)
      || p.tags?.some((t) => t.toLowerCase().includes(s));
  });

  const updatable = installed.filter((inst) => {
    const reg = registry.find((r) => r.id === inst.id);
    if (!reg) return false;
    const latest = reg.versions[0];
    return latest && latest.version !== inst.version;
  });

  const trapRef = useFocusTrap<HTMLDivElement>();

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-label="Plugins">
      <div ref={trapRef} className="w-full max-w-2xl h-[80vh] rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-700 px-5 py-3.5">
          <h2 className="text-lg font-semibold text-neutral-100">Plugins</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-neutral-700">
            <X className="w-5 h-5 text-neutral-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3">
          {(['browse', 'installed', 'updates', 'developer'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === t
                  ? 'bg-neutral-700 text-neutral-100'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
              }`}
            >
              {t === 'developer' ? 'Developer' : t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'updates' && updatable.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-blue-600 text-white rounded-full">
                  {updatable.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {actionError && (
          <div className="mx-5 mt-2 px-3 py-2 text-xs text-red-300 bg-red-900/30 border border-red-800 rounded-lg flex items-center justify-between">
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss error" className="text-red-400 hover:text-red-200 ml-2">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <p className="text-sm text-neutral-500 mt-8 text-center">Loading...</p>
          ) : tab === 'browse' ? (
            <BrowseTab
              plugins={filteredRegistry}
              installedIds={installedIds}
              search={search}
              onSearchChange={setSearch}
              onInstall={handleInstallRequest}
              actionInProgress={actionInProgress}
            />
          ) : tab === 'installed' ? (
            <InstalledTab
              installed={installed}
              errors={pluginErrors}
              onUninstall={handleUninstall}
              onToggle={handleToggle}
              actionInProgress={actionInProgress}
            />
          ) : tab === 'updates' ? (
            <UpdatesTab
              registry={registry}
              updatable={updatable}
              onInstall={(id, version) => runAction(id, 'POST', { pluginId: id, version })}
              actionInProgress={actionInProgress}
            />
          ) : (
            <DeveloperTab onError={setActionError} />
          )}
        </div>
      </div>

      {/* Install confirmation modal */}
      {confirmPlugin && (
        <InstallConfirmModal
          plugin={confirmPlugin}
          onConfirm={handleInstallConfirm}
          onCancel={() => setConfirmPlugin(null)}
          actionInProgress={actionInProgress}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Browse Tab
// ---------------------------------------------------------------------------

function BrowseTab({
  plugins,
  installedIds,
  search,
  onSearchChange,
  onInstall,
  actionInProgress,
}: {
  plugins: RegistryPlugin[];
  installedIds: Set<string>;
  search: string;
  onSearchChange: (s: string) => void;
  onInstall: (plugin: RegistryPlugin) => void;
  actionInProgress: string | null;
}) {
  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Search plugins..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full px-3 py-2 text-sm bg-neutral-800 border border-neutral-600 rounded-lg text-neutral-200 placeholder:text-neutral-500"
      />
      {plugins.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-neutral-500">
          <PackageSearch size={32} strokeWidth={1.5} className="opacity-30" />
          <p className="text-sm text-center">
            {search ? 'No plugins match your search' : 'No plugins available in the registry'}
          </p>
        </div>
      ) : (
        plugins.map((plugin) => {
          const latest = plugin.versions[0];
          const isInstalled = installedIds.has(plugin.id);
          return (
            <div key={plugin.id} className="flex items-start gap-3 p-3 rounded-lg border border-neutral-700 bg-neutral-800/50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-100">{plugin.name}</span>
                  {plugin.verified && (
                    <span title="Verified"><CheckCircle className="w-3.5 h-3.5 text-blue-400" /></span>
                  )}
                  <span className="text-xs text-neutral-500">{latest?.version}</span>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">{plugin.description}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-neutral-400">{plugin.author}</span>
                  <span className="text-[10px] text-neutral-500">{plugin.category}</span>
                </div>
              </div>
              <div className="shrink-0">
                {isInstalled ? (
                  <span className="text-xs text-green-400">Installed</span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!latest || actionInProgress === plugin.id}
                    onClick={() => onInstall(plugin)}
                  >
                    {actionInProgress === plugin.id ? 'Installing...' : 'Install'}
                  </Button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Installed Tab
// ---------------------------------------------------------------------------

function InstalledTab({
  installed,
  errors,
  onUninstall,
  onToggle,
  actionInProgress,
}: {
  installed: InstalledPlugin[];
  errors: Map<string, { message: string }>;
  onUninstall: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  actionInProgress: string | null;
}) {
  if (installed.length === 0) {
    return <p className="text-sm text-neutral-500 text-center py-8">No plugins installed</p>;
  }

  return (
    <div className="space-y-2">
      {installed.map((plugin) => {
        const error = errors.get(plugin.id);
        return (
          <div key={plugin.id} className="flex items-center gap-3 p-3 rounded-lg border border-neutral-700 bg-neutral-800/50">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-neutral-100">{plugin.id}</span>
                <span className="text-xs text-neutral-400">v{plugin.version}</span>
              </div>
              {error && (
                <div className="flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span className="text-xs text-amber-400">{error.message}</span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onToggle(plugin.id, !plugin.enabled)}
              disabled={actionInProgress === plugin.id}
              className="p-1 text-neutral-400 hover:text-neutral-200"
              title={plugin.enabled ? 'Disable' : 'Enable'}
              aria-label={plugin.enabled ? `Disable ${plugin.id}` : `Enable ${plugin.id}`}
            >
              {plugin.enabled ? (
                <ToggleRight className="w-5 h-5 text-green-400" />
              ) : (
                <ToggleLeft className="w-5 h-5 text-neutral-500" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onUninstall(plugin.id)}
              disabled={actionInProgress === plugin.id}
              className="p-1 text-neutral-400 hover:text-red-400"
              title="Uninstall"
              aria-label={`Uninstall ${plugin.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Updates Tab
// ---------------------------------------------------------------------------

function UpdatesTab({
  registry,
  updatable,
  onInstall,
  actionInProgress,
}: {
  registry: RegistryPlugin[];
  updatable: InstalledPlugin[];
  onInstall: (id: string, version: string) => void;
  actionInProgress: string | null;
}) {
  if (updatable.length === 0) {
    return <p className="text-sm text-neutral-500 text-center py-8">All plugins are up to date</p>;
  }

  return (
    <div className="space-y-2">
      {updatable.map((plugin) => {
        const reg = registry.find((r) => r.id === plugin.id);
        const latest = reg?.versions[0];
        return (
          <div key={plugin.id} className="flex items-center gap-3 p-3 rounded-lg border border-neutral-700 bg-neutral-800/50">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-neutral-100">{plugin.id}</span>
                <span className="text-xs text-neutral-500">
                  v{plugin.version} → v{latest?.version}
                </span>
              </div>
              {latest?.changelog && (
                <p className="text-xs text-neutral-400 mt-0.5">{latest.changelog}</p>
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={!latest || actionInProgress === plugin.id}
              onClick={() => latest && onInstall(plugin.id, latest.version)}
            >
              {actionInProgress === plugin.id ? 'Updating...' : 'Update'}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Developer Tab — load plugins from local dev server
// ---------------------------------------------------------------------------

function DeveloperTab({ onError }: { onError: (msg: string) => void }) {
  const [devUrl, setDevUrl] = useState('');
  const [devLoading, setDevLoading] = useState(false);
  const [devPlugins, setDevPlugins] = useState<Map<string, DevPlugin>>(new Map());

  // Lazy-import to avoid pulling plugin-loader into the server bundle
  const refreshDevPlugins = useCallback(async () => {
    const { listDevPlugins } = await import('@/lib/plugin-loader');
    setDevPlugins(new Map(listDevPlugins()));
  }, []);

  useEffect(() => { refreshDevPlugins(); }, [refreshDevPlugins]);

  const handleLoad = async () => {
    if (!devUrl.trim()) return;
    setDevLoading(true);
    try {
      const { loadDevPlugin, startDevPolling } = await import('@/lib/plugin-loader');
      await loadDevPlugin(devUrl.trim());
      // Start polling for changes
      const { listDevPlugins } = await import('@/lib/plugin-loader');
      const plugins = listDevPlugins();
      // Find the plugin we just loaded (most recent with matching URL)
      for (const [id, dev] of plugins) {
        if (dev.url === devUrl.trim().replace(/\/+$/, '')) {
          startDevPolling(id);
          break;
        }
      }
      setDevUrl('');
      await refreshDevPlugins();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load dev plugin');
    } finally {
      setDevLoading(false);
    }
  };

  const handleUnload = async (pluginId: string) => {
    const { unloadDevPlugin, stopDevPolling } = await import('@/lib/plugin-loader');
    stopDevPolling(pluginId);
    unloadDevPlugin(pluginId);
    // Reload all plugins so any installed plugin that was overridden gets restored
    usePluginStore.getState().loadPlugins();
    await refreshDevPlugins();
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-neutral-300 mb-1.5">Load from URL</label>
        <p className="text-[11px] text-neutral-400 mb-2">
          Enter your dev server URL (e.g. http://localhost:5173). The plugin will auto-reload on changes.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={devUrl}
            onChange={(e) => setDevUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
            placeholder="http://localhost:5173"
            className="flex-1 px-3 py-2 text-sm bg-neutral-800 border border-neutral-600 rounded-lg text-neutral-200 placeholder:text-neutral-500"
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={!devUrl.trim() || devLoading}
            onClick={handleLoad}
          >
            {devLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Load'}
          </Button>
        </div>
      </div>

      {devPlugins.size > 0 && (
        <div>
          <h3 className="text-xs font-medium text-neutral-300 mb-2">Dev Plugins</h3>
          <div className="space-y-2">
            {[...devPlugins].map(([id, dev]) => (
              <div key={id} className="flex items-center gap-3 p-3 rounded-lg border border-amber-800/50 bg-amber-950/20">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-sm font-medium text-neutral-100">{dev.manifest.name}</span>
                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-800/60 text-amber-300 rounded">Dev</span>
                    <span className="text-xs text-neutral-500">v{dev.manifest.version}</span>
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-0.5 truncate">{dev.url}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnload(id)}
                  className="p-1 text-neutral-400 hover:text-red-400"
                  title="Unload"
                  aria-label={`Unload ${dev.manifest.name}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-neutral-800 pt-3">
        <h3 className="text-xs font-medium text-neutral-300 mb-1">Tips</h3>
        <ul className="text-[11px] text-neutral-400 space-y-1 list-disc list-inside">
          <li>Dev plugins are stored in localStorage only — they won&apos;t persist across browsers</li>
          <li>The plugin auto-reloads when the bundle changes (polled every 2s)</li>
          <li>Source maps are supported — add <code className="text-neutral-400">sourcemap: true</code> to your Vite config</li>
          <li>Dev plugins override installed versions with the same module type</li>
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Install Confirmation Modal
// ---------------------------------------------------------------------------

function InstallConfirmModal({
  plugin,
  onConfirm,
  onCancel,
  actionInProgress,
}: {
  plugin: RegistryPlugin;
  onConfirm: (id: string, version: string) => void;
  onCancel: () => void;
  actionInProgress: string | null;
}) {
  const latest = plugin.versions[0];
  const [manifestPermissions, setManifestPermissions] = useState<PluginPermission[]>(plugin.permissions ?? []);
  const [manifestSecrets, setManifestSecrets] = useState<PluginSecretDeclaration[]>([]);

  // Fetch the actual manifest to get secrets declarations (not available in registry metadata)
  useEffect(() => {
    let cancelled = false;
    async function fetchManifestDetails() {
      try {
        // Try to fetch the manifest if the plugin is already installed (has files on disk)
        const res = await editorFetch(`/api/plugins/manifest/${plugin.id}`);
        if (!res.ok || cancelled) return;
        const manifest = await res.json();
        if (cancelled) return;
        if (manifest.permissions?.length) setManifestPermissions(manifest.permissions);
        if (manifest.secrets?.length) setManifestSecrets(manifest.secrets);
      } catch {
        // Plugin not installed yet — registry permissions are the best we have
      }
    }
    fetchManifestDetails();
    return () => { cancelled = true; };
  }, [plugin.id]);

  const isWorking = actionInProgress === plugin.id;

  return (
    <div className="fixed inset-0 z-nested flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-base font-semibold text-neutral-100">Install Plugin</h3>
          {plugin.verified && (
            <span title="Verified"><CheckCircle className="w-4 h-4 text-blue-400" /></span>
          )}
        </div>

        <div className="space-y-3">
          {/* Plugin info */}
          <div className="p-3 rounded-lg bg-neutral-800/50 border border-neutral-700">
            <div className="text-sm font-medium text-neutral-100">{plugin.name}</div>
            <p className="text-xs text-neutral-400 mt-0.5">{plugin.description}</p>
            <div className="flex items-center gap-3 mt-2 text-[11px] text-neutral-400">
              <span>{plugin.author}</span>
              <span>v{latest?.version}</span>
              <span>{plugin.license}</span>
            </div>
          </div>

          {/* Unverified warning */}
          {!plugin.verified && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-950/30 border border-amber-800/50">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-amber-300">Unverified Plugin</div>
                <p className="text-[11px] text-amber-400/80 mt-0.5">
                  This plugin has not been reviewed by the Home Screens team. Install at your own discretion.
                </p>
              </div>
            </div>
          )}

          {/* Permissions */}
          {manifestPermissions.length > 0 && (
            <div className="p-3 rounded-lg bg-neutral-800/50 border border-neutral-700">
              <div className="flex items-center gap-1.5 mb-2">
                <Shield className="w-3.5 h-3.5 text-neutral-400" />
                <span className="text-xs font-medium text-neutral-300">Permissions requested</span>
              </div>
              <div className="space-y-1">
                {manifestPermissions.map((perm) => (
                  <div key={perm} className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="w-1 h-1 rounded-full bg-neutral-500" />
                    {PERMISSION_LABELS[perm] || perm}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Required secrets */}
          {manifestSecrets.length > 0 && (
            <div className="p-3 rounded-lg bg-neutral-800/50 border border-neutral-700">
              <div className="text-xs font-medium text-neutral-300 mb-2">API keys required</div>
              <div className="space-y-1">
                {manifestSecrets.map((s) => (
                  <div key={s.key} className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="w-1 h-1 rounded-full bg-neutral-500" />
                    {s.label}
                    {s.required && <span className="text-[10px] text-amber-400">(required)</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={isWorking}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!latest || isWorking}
            onClick={() => latest && onConfirm(plugin.id, latest.version)}
          >
            {isWorking ? 'Installing...' : 'Install'}
          </Button>
        </div>
      </div>
    </div>
  );
}
