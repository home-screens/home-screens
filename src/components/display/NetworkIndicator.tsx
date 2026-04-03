'use client';

import { WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

interface NetworkIndicatorProps {
  displayState: 'active' | 'dimmed' | 'asleep';
  scale: number;
}

export default function NetworkIndicator({ displayState, scale }: NetworkIndicatorProps) {
  const { isOnline } = useNetworkStatus();

  if (isOnline || displayState === 'asleep') return null;

  const size = 38 * scale;
  const padding = 16 * scale;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: padding,
        right: padding,
        zIndex: 99,
        pointerEvents: 'none',
        opacity: 0.7,
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
      }}
    >
      <WifiOff style={{ width: size, height: size, color: '#ef4444' }} />
    </div>
  );
}
