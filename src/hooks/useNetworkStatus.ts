'use client';

import { useState, useEffect, useRef } from 'react';

export function useNetworkStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [simulateOffline, setSimulateOffline] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    function handleOnline() {
      clearTimeout(timerRef.current);
      setIsOnline(true);
    }

    function handleOffline() {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setIsOnline(false), 3000);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Sync in case state changed between render and effect
    if (navigator.onLine) {
      handleOnline();
    } else {
      handleOffline();
    }

    // TODO: Remove — temporary Shift+N toggle for testing
    function handleKeydown(e: KeyboardEvent) {
      if (e.shiftKey && e.key === 'N') {
        setSimulateOffline((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleKeydown);

    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('keydown', handleKeydown);
    };
  }, []);

  return { isOnline: isOnline && !simulateOffline };
}
