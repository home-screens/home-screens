import type React from 'react';

export const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  minHeight: 48,
  padding: '12px 16px',
  background: '#1a1a1a',
  border: '1px solid #2a2a2a',
  borderRadius: 12,
  color: '#fafafa',
  fontSize: 16,
  outline: 'none',
};

export const SELECT_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  appearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23737373' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 14px center',
  paddingRight: 40,
};

export const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#737373',
  marginBottom: 8,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
};
