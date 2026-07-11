'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Trash2, ToggleLeft, ToggleRight, AlertTriangle, CheckCircle, Code2, Loader2, PackageSearch, Download } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import PluginInstallPreview from '@/components/editor/PluginInstallPreview';
import InstallFromUrlModal from '@/components/editor/InstallFromUrlModal';
import ExternalUpdateModal from '@/components/editor/ExternalUpdateModal';
import { editorFetch } from '@/lib/editor-fetch';
import { usePluginStore } from '@/stores/plugin-store';
import { useEditorStore } from '@/stores/editor-store';
import Button from '@/components/ui/Button';
import type { RegistryPlugin, InstalledPlugin, PluginRegistry, PluginPermission, PluginSecretDeclaration } from '@/types/plugins';
import type { DevPlugin } from '@/lib/plugin-loader';
import { useTranslate, type TranslateFn } from '@/i18n';
import { logger } from '@/lib/logger';

const log = logger('plugin-store');

interface PluginStorePanelProps {
  onClose: () => void;
}

type Tab = 'browse' | 'installed' | 'updates' | 'developer';

function tabLabel(tab: Tab, t: TranslateFn): string {
  switch (tab) {
    case 'browse': return t('settings.pluginStorePanel.tabs.browse');
    case 'installed': return t('settings.pluginStorePanel.tabs.installed');
    case 'updates': return t('settings.pluginStorePanel.tabs.updates');
    case 'developer': return t('settings.pluginStorePanel.tabs.developer');
  }
}

export default function PluginStorePanel({ onClose }: PluginStorePanelProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const [tab, setTab] = useState<Tab>('browse');
  const [registry, setRegistry] = useState<RegistryPlugin[]>([]);
  const [installed, setInstalled] = useState<InstalledPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [confirmPlugin, setConfirmPlugin] = useState<RegistryPlugin | null>(null);
  const [installFromUrlOpen, setInstallFromUrlOpen] = useState(false);
  const [updatingExternal, setUpdatingExternal] = useState<InstalledPlugin | null>(null);
  const pluginErrors = usePluginStore((s) => s.errors);
  const advancedMode = useEditorStore((s) => s.config?.settings?.advancedMode ?? false);

  // If advanced mode is turned off while the Developer tab is active, snap back to Browse.
  useEffect(() => {
    if (!advancedMode && tab === 'developer') setTab('browse');
  }, [advancedMode, tab]);

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
      log.debug('Failed to fetch plugin data:', err);
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
        const msg = data.detail
          ? `${data.error}: ${data.detail}`
          : (data.error ?? t('settings.pluginStorePanel.errors.requestFailed', { status: res.status }));
        throw new Error(msg);
      }
      await fetchData();
      usePluginStore.getState().loadPlugins();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('settings.pluginStorePanel.errors.actionFailed'));
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
      || p.tags?.some((tag) => tag.toLowerCase().includes(s));
  });

  const updatable = installed.filter((inst) => {
    const reg = registry.find((r) => r.id === inst.id);
    if (!reg) return false;
    const latest = reg.versions[0];
    return latest && latest.version !== inst.version;
  });

  const trapRef = useFocusTrap<HTMLDivElement>();

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-label={t('settings.pluginStorePanel.title')}>
      <div ref={trapRef} className="w-full max-w-2xl h-[80vh] rounded-xl border border-hs-border-strong bg-hs-panel shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hs-border-strong px-5 py-3.5">
          <h2 className="text-lg font-semibold text-hs-text-primary">{t('settings.pluginStorePanel.title')}</h2>
          <button type="button" onClick={onClose} aria-label={t('modal.closeAriaLabel')} className="p-1 rounded hover:bg-hs-card">
            <X className="w-5 h-5 text-hs-text-muted" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3">
          {(advancedMode
            ? (['browse', 'installed', 'updates', 'developer'] as const)
            : (['browse', 'installed', 'updates'] as const)
          ).map((tabId) => (
            <button
              key={tabId}
              type="button"
              onClick={() => setTab(tabId)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === tabId
                  ? 'bg-hs-hover text-hs-text-primary'
                  : 'text-hs-text-muted hover:text-hs-text-body hover:bg-hs-card'
              }`}
            >
              {tabLabel(tabId, t)}
              {tabId === 'updates' && updatable.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-hs-accent text-white rounded-full">
                  {updatable.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {actionError && (
          <div className="mx-5 mt-2 px-3 py-2 text-xs text-hs-danger bg-hs-danger/10 border border-hs-danger/30 rounded-lg flex items-center justify-between">
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              aria-label={t('settings.pluginStorePanel.dismissErrorAriaLabel')}
              className="text-hs-danger hover:text-hs-danger ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <p className="text-sm text-hs-text-faint mt-8 text-center">{tCore('loading')}</p>
          ) : tab === 'browse' ? (
            <BrowseTab
              plugins={filteredRegistry}
              installedIds={installedIds}
              search={search}
              onSearchChange={setSearch}
              onInstall={handleInstallRequest}
              onInstallFromUrl={() => setInstallFromUrlOpen(true)}
              actionInProgress={actionInProgress}
            />
          ) : tab === 'installed' ? (
            <InstalledTab
              installed={installed}
              errors={pluginErrors}
              onUninstall={handleUninstall}
              onToggle={handleToggle}
              actionInProgress={actionInProgress}
              onUpdateExternal={(plugin) => setUpdatingExternal(plugin)}
            />
          ) : tab === 'updates' ? (
            <UpdatesTab
              registry={registry}
              updatable={updatable}
              onInstall={(id, version) => runAction(id, 'POST', { pluginId: id, version })}
              actionInProgress={actionInProgress}
            />
          ) : tab === 'developer' && advancedMode ? (
            <DeveloperTab onError={setActionError} />
          ) : null}
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

      {/* Install from URL modal */}
      {installFromUrlOpen && (
        <InstallFromUrlModal
          onClose={() => setInstallFromUrlOpen(false)}
          onInstalled={() => {
            fetchData();
            usePluginStore.getState().loadPlugins();
          }}
        />
      )}

      {/* External plugin update modal */}
      {updatingExternal && (
        <ExternalUpdateModal
          plugin={updatingExternal}
          onClose={() => setUpdatingExternal(null)}
          onUpdated={() => {
            fetchData();
            usePluginStore.getState().loadPlugins();
          }}
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
  onInstallFromUrl,
  actionInProgress,
}: {
  plugins: RegistryPlugin[];
  installedIds: Set<string>;
  search: string;
  onSearchChange: (s: string) => void;
  onInstall: (plugin: RegistryPlugin) => void;
  onInstallFromUrl: () => void;
  actionInProgress: string | null;
}) {
  const t = useTranslate('editor');
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={t('settings.pluginStorePanel.browse.searchPlaceholder')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="flex-1 px-3 py-2 text-sm bg-hs-card border border-hs-border-strong rounded-lg text-hs-text-body placeholder:text-hs-text-faint"
        />
        <Button variant="secondary" size="sm" onClick={onInstallFromUrl}>
          {t('settings.pluginStorePanel.browse.installFromUrlButton')}
        </Button>
      </div>
      {plugins.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-hs-text-faint">
          <PackageSearch size={32} strokeWidth={1.5} className="opacity-30" />
          <p className="text-sm text-center">
            {search
              ? t('settings.pluginStorePanel.browse.noMatches')
              : t('settings.pluginStorePanel.browse.empty')}
          </p>
        </div>
      ) : (
        plugins.map((plugin) => {
          const latest = plugin.versions[0];
          const isInstalled = installedIds.has(plugin.id);
          return (
            <div key={plugin.id} className="flex items-start gap-3 p-3 rounded-lg border border-hs-border-strong bg-hs-hover">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-hs-text-primary">{plugin.name}</span>
                  {plugin.verified && (
                    <span title={t('settings.pluginInstallPreview.verifiedTitle')}>
                      <CheckCircle className="w-3.5 h-3.5 text-hs-accent-hover" />
                    </span>
                  )}
                  <span className="text-xs text-hs-text-faint">{latest?.version}</span>
                </div>
                <p className="text-xs text-hs-text-muted mt-0.5">{plugin.description}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-hs-text-muted">{plugin.author}</span>
                  <span className="text-[10px] text-hs-text-faint">{plugin.category}</span>
                </div>
              </div>
              <div className="shrink-0">
                {isInstalled ? (
                  <span className="text-xs text-hs-success">{t('settings.pluginStorePanel.browse.installedBadge')}</span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!latest || actionInProgress === plugin.id}
                    onClick={() => onInstall(plugin)}
                  >
                    {actionInProgress === plugin.id
                      ? t('settings.pluginStorePanel.browse.installingButton')
                      : t('settings.pluginStorePanel.browse.installButton')}
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
  onUpdateExternal,
}: {
  installed: InstalledPlugin[];
  errors: Map<string, { message: string }>;
  onUninstall: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  actionInProgress: string | null;
  onUpdateExternal: (plugin: InstalledPlugin) => void;
}) {
  const t = useTranslate('editor');
  if (installed.length === 0) {
    return <p className="text-sm text-hs-text-faint text-center py-8">{t('settings.pluginStorePanel.installed.empty')}</p>;
  }

  return (
    <div className="space-y-2">
      {installed.map((plugin) => {
        const error = errors.get(plugin.id);
        return (
          <div key={plugin.id} className="flex items-center gap-3 p-3 rounded-lg border border-hs-border-strong bg-hs-hover">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-hs-text-primary">{plugin.id}</span>
                <span className="text-xs text-hs-text-muted">v{plugin.version}</span>
                {plugin.source === 'external' && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-800/60 text-hs-warning rounded">
                    {t('settings.pluginStorePanel.installed.externalBadge')}
                  </span>
                )}
              </div>
              {error && (
                <div className="flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3 text-hs-warning" />
                  <span className="text-xs text-hs-warning">{error.message}</span>
                </div>
              )}
            </div>
            {plugin.source === 'external' && (
              <button
                type="button"
                onClick={() => onUpdateExternal(plugin)}
                disabled={actionInProgress === plugin.id}
                className="p-1 text-hs-text-muted hover:text-hs-accent-hover"
                title={t('settings.pluginStorePanel.installed.checkUpdateTitle')}
                aria-label={t('settings.pluginStorePanel.installed.checkUpdateAriaLabel', { id: plugin.id })}
              >
                <Download className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onToggle(plugin.id, !plugin.enabled)}
              disabled={actionInProgress === plugin.id}
              className="p-1 text-hs-text-muted hover:text-hs-text-body"
              title={plugin.enabled
                ? t('settings.pluginStorePanel.installed.disableTitle')
                : t('settings.pluginStorePanel.installed.enableTitle')}
              aria-label={plugin.enabled
                ? t('settings.pluginStorePanel.installed.disableAriaLabel', { id: plugin.id })
                : t('settings.pluginStorePanel.installed.enableAriaLabel', { id: plugin.id })}
            >
              {plugin.enabled ? (
                <ToggleRight className="w-5 h-5 text-hs-success" />
              ) : (
                <ToggleLeft className="w-5 h-5 text-hs-text-faint" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onUninstall(plugin.id)}
              disabled={actionInProgress === plugin.id}
              className="p-1 text-hs-text-muted hover:text-hs-danger"
              title={t('settings.pluginStorePanel.installed.uninstallTitle')}
              aria-label={t('settings.pluginStorePanel.installed.uninstallAriaLabel', { id: plugin.id })}
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
  const t = useTranslate('editor');
  if (updatable.length === 0) {
    return <p className="text-sm text-hs-text-faint text-center py-8">{t('settings.pluginStorePanel.updates.allUpToDate')}</p>;
  }

  return (
    <div className="space-y-2">
      {updatable.map((plugin) => {
        const reg = registry.find((r) => r.id === plugin.id);
        const latest = reg?.versions[0];
        return (
          <div key={plugin.id} className="flex items-center gap-3 p-3 rounded-lg border border-hs-border-strong bg-hs-hover">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-hs-text-primary">{plugin.id}</span>
                <span className="text-xs text-hs-text-faint">
                  v{plugin.version} → v{latest?.version}
                </span>
              </div>
              {latest?.changelog && (
                <p className="text-xs text-hs-text-muted mt-0.5">{latest.changelog}</p>
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={!latest || actionInProgress === plugin.id}
              onClick={() => latest && onInstall(plugin.id, latest.version)}
            >
              {actionInProgress === plugin.id
                ? t('settings.pluginStorePanel.updates.updatingButton')
                : t('settings.pluginStorePanel.updates.updateButton')}
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
  const t = useTranslate('editor');
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
      onError(err instanceof Error ? err.message : t('settings.pluginStorePanel.developer.loadFailed'));
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
        <label className="block text-xs font-medium text-hs-text-secondary mb-1.5">
          {t('settings.pluginStorePanel.developer.loadFromUrlLabel')}
        </label>
        <p className="text-[11px] text-hs-text-muted mb-2">
          {t('settings.pluginStorePanel.developer.loadFromUrlHelp')}
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={devUrl}
            onChange={(e) => setDevUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
            placeholder="http://localhost:5173"
            className="flex-1 px-3 py-2 text-sm bg-hs-card border border-hs-border-strong rounded-lg text-hs-text-body placeholder:text-hs-text-faint"
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={!devUrl.trim() || devLoading}
            onClick={handleLoad}
          >
            {devLoading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : t('settings.pluginStorePanel.developer.loadButton')}
          </Button>
        </div>
      </div>

      {devPlugins.size > 0 && (
        <div>
          <h3 className="text-xs font-medium text-hs-text-secondary mb-2">
            {t('settings.pluginStorePanel.developer.devPluginsHeading')}
          </h3>
          <div className="space-y-2">
            {[...devPlugins].map(([id, dev]) => (
              <div key={id} className="flex items-center gap-3 p-3 rounded-lg border border-amber-800/50 bg-amber-950/20">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-3.5 h-3.5 text-hs-warning" />
                    <span className="text-sm font-medium text-hs-text-primary">{dev.manifest.name}</span>
                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-800/60 text-hs-warning rounded">
                      {t('settings.pluginStorePanel.developer.devBadge')}
                    </span>
                    <span className="text-xs text-hs-text-faint">v{dev.manifest.version}</span>
                  </div>
                  <p className="text-[11px] text-hs-text-faint mt-0.5 truncate">{dev.url}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnload(id)}
                  className="p-1 text-hs-text-muted hover:text-hs-danger"
                  title={t('settings.pluginStorePanel.developer.unloadTitle')}
                  aria-label={t('settings.pluginStorePanel.developer.unloadAriaLabel', { name: dev.manifest.name })}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-hs-border pt-3">
        <h3 className="text-xs font-medium text-hs-text-secondary mb-1">
          {t('settings.pluginStorePanel.developer.tipsHeading')}
        </h3>
        <ul className="text-[11px] text-hs-text-muted space-y-1 list-disc list-inside">
          <li>{t('settings.pluginStorePanel.developer.tips.localStorage')}</li>
          <li>{t('settings.pluginStorePanel.developer.tips.autoReload')}</li>
          <li>
            {t('settings.pluginStorePanel.developer.tips.sourcemapsPart1')}
            <code className="text-hs-text-muted">sourcemap: true</code>
            {t('settings.pluginStorePanel.developer.tips.sourcemapsPart2')}
          </li>
          <li>{t('settings.pluginStorePanel.developer.tips.devOverrides')}</li>
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
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const latest = plugin.versions[0];
  const [manifestPermissions, setManifestPermissions] = useState<PluginPermission[]>(plugin.permissions ?? []);
  const [manifestSecrets, setManifestSecrets] = useState<PluginSecretDeclaration[]>([]);
  const [requiresConnection, setRequiresConnection] = useState(false);

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
        if (manifest.auth) setRequiresConnection(true);
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
      <div className="w-full max-w-md rounded-xl border border-hs-border-strong bg-hs-panel shadow-2xl p-5">
        <h3 className="text-base font-semibold text-hs-text-primary mb-3">
          {t('settings.pluginStorePanel.installConfirm.heading')}
        </h3>

        <PluginInstallPreview
          name={plugin.name}
          description={plugin.description}
          author={plugin.author}
          version={latest?.version ?? '?'}
          license={plugin.license}
          verified={plugin.verified}
          permissions={manifestPermissions}
          secrets={manifestSecrets}
          requiresConnection={requiresConnection}
        />

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={isWorking}>
            {tCore('actions.cancel')}
          </Button>
          <Button
            size="sm"
            disabled={!latest || isWorking}
            onClick={() => latest && onConfirm(plugin.id, latest.version)}
          >
            {isWorking
              ? t('settings.pluginStorePanel.browse.installingButton')
              : t('settings.pluginStorePanel.browse.installButton')}
          </Button>
        </div>
      </div>
    </div>
  );
}
