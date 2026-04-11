'use client';

import { useState, useEffect, useRef } from 'react';

export function useNetworkStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(true);
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

    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline };
}
