'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

export default function FormOverlay({
  title,
  onBack,
  children,
  footer,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    return () => clearTimeout(exitTimer.current);
  }, []);

  const handleBack = () => {
    setVisible(false);
    exitTimer.current = setTimeout(onBack, 250);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 55,
        backgroundColor: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          paddingTop: 'max(12px, env(safe-area-inset-top))',
          borderBottom: '1px solid #1a1a1a',
          gap: 12,
        }}
      >
        <button
          onClick={handleBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            minWidth: 44,
            minHeight: 44,
            color: '#a3a3a3',
            fontSize: 14,
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
            background: 'none',
          }}
        >
          <ChevronLeft size={20} />
          Back
        </button>
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: '#fafafa',
            flex: 1,
            textAlign: 'center',
            paddingRight: 44,
          }}
        >
          {title}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          padding: '20px 16px',
          paddingBottom: footer
            ? '20px'
            : 'calc(80px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {children}
      </div>
      {footer && (
        <div style={{ flexShrink: 0, paddingBottom: 'env(safe-area-inset-bottom, 0px)', position: 'relative', zIndex: 1, borderTop: '1px solid #1a1a1a' }}>
          {footer}
        </div>
      )}
    </div>
  );
}
