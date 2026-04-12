'use client';

import { useState, useEffect, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import InterfaceCard from './network/InterfaceCard';
import WifiScanSection from './network/WifiScanSection';
import WifiConnectModal from './network/WifiConnectModal';
import ManagementWarningModal from './network/ManagementWarningModal';
import RollbackOverlay from './network/RollbackOverlay';
import SavedNetworksSection from './network/SavedNetworksSection';
import type { NetworkOverview, NetworkInterface, WifiNetwork } from './network/types';

/* ─── Constants ────────────────────────────── */

const POLL_INTERVAL_MS = 10_000;

/* ─── Main component ────────────────────────── */

export default function NetworkSection() {
  const [overview, setOverview] = useState<NetworkOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedWifiIface, setSelectedWifiIface] = useState<string>('');

  /* ── Modal/overlay state ───────────────────── */

  const [connectTarget, setConnectTarget] = useState<WifiNetwork | null>(null);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [hiddenNetworkOpen, setHiddenNetworkOpen] = useState(false);

  const [managementWarning, setManagementWarning] = useState<{
    warning: string;
    onProceed: () => void;
  } | null>(null);

  const [rollbackId, setRollbackId] = useState<string | null>(null);
  const [disconnectingUuid, setDisconnectingUuid] = useState<string | null>(null);
  const [savedRefreshKey, setSavedRefreshKey] = useState(0);

  /* ── Fetch overview ────────────────────────── */

  const fetchOverview = useCallback(async () => {
    try {
      const res = await editorFetch('/api/system/network');
      if (res.ok) {
        const data: NetworkOverview = await res.json();
        setOverview(data);

        // Auto-select first wifi interface if none selected
        if (!selectedWifiIface && data.interfaces) {
          const firstWifi = data.interfaces.find((i) => i.type === 'wifi');
          if (firstWifi) setSelectedWifiIface(firstWifi.device);
        }
      }
    } catch (err) {
      console.debug('Failed to fetch network overview:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedWifiIface]);

  /* ── Poll overview every 10s ───────────────── */

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchOverview]);

  /* ── Handlers ──────────────────────────────── */

  const handleNetworkClick = useCallback((network: WifiNetwork) => {
    setConnectTarget(network);
    setConnectModalOpen(true);
  }, []);

  const handleHiddenNetworkOpen = useCallback(() => {
    setConnectTarget(null);
    setHiddenNetworkOpen(true);
  }, []);

  const closeConnectModal = useCallback(() => {
    setConnectModalOpen(false);
    setHiddenNetworkOpen(false);
    setConnectTarget(null);
  }, []);

  const handleManagementWarning = useCallback(
    (warning: string, retryWithConfirm: () => void) => {
      // Close the connect modal, show the warning
      setConnectModalOpen(false);
      setHiddenNetworkOpen(false);
      setManagementWarning({
        warning,
        onProceed: () => {
          setManagementWarning(null);
          retryWithConfirm();
        },
      });
    },
    [],
  );

  const handleConnected = useCallback(
    (newRollbackId?: string) => {
      closeConnectModal();
      if (newRollbackId) {
        setRollbackId(newRollbackId);
      } else {
        // Refresh overview and saved networks
        fetchOverview();
        setSavedRefreshKey((k) => k + 1);
      }
    },
    [closeConnectModal, fetchOverview],
  );

  const handleRollbackDismiss = useCallback(() => {
    setRollbackId(null);
    fetchOverview();
    setSavedRefreshKey((k) => k + 1);
  }, [fetchOverview]);

  /* ── Disconnect handler ────────────────────── */

  const handleDisconnect = useCallback(
    async (connectionUuid: string, iface: NetworkInterface, confirmed?: boolean) => {
      setDisconnectingUuid(connectionUuid);

      try {
        const body: Record<string, unknown> = { connectionId: connectionUuid };
        if (confirmed) body.confirmed = true;

        const res = await editorFetch('/api/system/network/wifi/disconnect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = await res.json();

        if (data.requiresConfirmation) {
          setDisconnectingUuid(null);
          setManagementWarning({
            warning: data.warning,
            onProceed: () => {
              setManagementWarning(null);
              handleDisconnect(connectionUuid, iface, true);
            },
          });
          return;
        }

        if (res.ok && data.ok) {
          fetchOverview();
        }
      } catch {
        // Silently fail
      } finally {
        setDisconnectingUuid(null);
      }
    },
    [fetchOverview],
  );

  const handleDisconnectClick = useCallback(
    (connectionUuid: string, iface: NetworkInterface) => {
      handleDisconnect(connectionUuid, iface);
    },
    [handleDisconnect],
  );

  /* ── Loading state ─────────────────────────── */

  if (loading) {
    return (
      <div className="text-sm text-hs-text-faint py-8 text-center">
        Loading network information...
      </div>
    );
  }

  /* ── Not available state ───────────────────── */

  if (!overview || !overview.available) {
    return (
      <div className="space-y-0 divide-y divide-hs-border-strong [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
        <section>
          <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
            Network
          </h3>
          <div className="rounded-lg bg-hs-card border border-hs-border p-4">
            <p className="text-sm text-hs-text-muted">
              Network settings are only available on the display device.
            </p>
            {overview?.reason && (
              <p className="text-xs text-hs-text-faint mt-1">
                {overview.reason}
              </p>
            )}
          </div>
        </section>
      </div>
    );
  }

  /* ── Derived data ──────────────────────────── */

  const interfaces = overview.interfaces ?? [];
  const wifiInterfaces = interfaces.filter((i) => i.type === 'wifi');
  const hasWifi = wifiInterfaces.length > 0;

  /* ── Full UI ───────────────────────────────── */

  return (
    <>
      <div className="space-y-0 divide-y divide-hs-border-strong [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
        {/* Hostname */}
        <section>
          <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
            Hostname
          </h3>
          <p className="text-sm text-hs-text-primary font-mono">
            {overview.hostname}
          </p>
        </section>

        {/* Interfaces */}
        <section>
          <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
            Interfaces
          </h3>
          {interfaces.length === 0 ? (
            <p className="text-xs text-hs-text-faint">No network interfaces detected.</p>
          ) : (
            <div className="space-y-2">
              {interfaces.map((iface) => (
                <InterfaceCard
                  key={iface.device}
                  iface={iface}
                  onDisconnect={handleDisconnectClick}
                  disconnecting={disconnectingUuid === iface.connectionUuid}
                />
              ))}
            </div>
          )}
        </section>

        {/* WiFi Scan */}
        {hasWifi && (
          <WifiScanSection
            wifiInterfaces={wifiInterfaces}
            selectedWifiIface={selectedWifiIface}
            onSelectIface={setSelectedWifiIface}
            onNetworkClick={handleNetworkClick}
          />
        )}

        {/* Hidden network connect */}
        {hasWifi && (
          <section>
            <button
              type="button"
              onClick={handleHiddenNetworkOpen}
              className="text-sm text-hs-accent hover:text-hs-accent-hover transition-colors"
            >
              Connect to hidden network...
            </button>
          </section>
        )}

        {/* Saved Networks */}
        {hasWifi && (
          <SavedNetworksSection refreshKey={savedRefreshKey} />
        )}
      </div>

      {/* ── Modals & Overlays ────────────────── */}

      {/* Connect modal (from scan result) */}
      {connectModalOpen && (
        <WifiConnectModal
          network={connectTarget}
          wifiInterfaces={wifiInterfaces}
          selectedIface={selectedWifiIface}
          onConnected={handleConnected}
          onClose={closeConnectModal}
          onManagementWarning={handleManagementWarning}
        />
      )}

      {/* Connect modal (hidden network) */}
      {hiddenNetworkOpen && (
        <WifiConnectModal
          network={null}
          hiddenSsid=""
          wifiInterfaces={wifiInterfaces}
          selectedIface={selectedWifiIface}
          onConnected={handleConnected}
          onClose={closeConnectModal}
          onManagementWarning={handleManagementWarning}
        />
      )}

      {/* Management interface warning */}
      {managementWarning && (
        <ManagementWarningModal
          warning={managementWarning.warning}
          onProceed={managementWarning.onProceed}
          onCancel={() => setManagementWarning(null)}
        />
      )}

      {/* Rollback verification overlay */}
      {rollbackId && (
        <RollbackOverlay
          rollbackId={rollbackId}
          onConfirmed={handleRollbackDismiss}
          onReverted={handleRollbackDismiss}
          onDismiss={handleRollbackDismiss}
        />
      )}
    </>
  );
}
