'use client';

import { useCallback, useState } from 'react';

interface UseUpgradeModalReturn {
  /** The tag being installed — non-null while `UpgradeModal` should own the screen. */
  activeTarget: string | null;
  isRollback: boolean;
  fromVersion: string | null;
  onUpgrade: (tag: string, currentVersion: string | null) => void;
  onRollback: (tag: string, currentVersion: string | null) => void;
  onClose: () => void;
  onComplete: () => void;
}

/**
 * Target selection for the upgrade / rollback modal. Upgrade and rollback
 * are tracked separately because the modal renders differently for each,
 * but only one can be active at a time.
 */
export function useUpgradeModal(): UseUpgradeModalReturn {
  const [upgradeTarget, setUpgradeTarget] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<string | null>(null);
  const [fromVersion, setFromVersion] = useState<string | null>(null);

  const onUpgrade = useCallback((tag: string, currentVersion: string | null) => {
    setFromVersion(currentVersion);
    setUpgradeTarget(tag);
  }, []);

  const onRollback = useCallback((tag: string, currentVersion: string | null) => {
    setFromVersion(currentVersion);
    setRollbackTarget(tag);
  }, []);

  const onClose = useCallback(() => {
    setUpgradeTarget(null);
    setRollbackTarget(null);
  }, []);

  const onComplete = useCallback(() => {
    onClose();
    setTimeout(() => window.location.reload(), 2000);
  }, [onClose]);

  return {
    activeTarget: upgradeTarget || rollbackTarget,
    isRollback: !!rollbackTarget,
    fromVersion,
    onUpgrade,
    onRollback,
    onClose,
    onComplete,
  };
}
