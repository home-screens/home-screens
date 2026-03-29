interface ContentCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function ContentCard({ children, className, style }: ContentCardProps) {
  return (
    <div
      className={`rounded-lg ${className ?? ''}`}
      style={{
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: '6px 10px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
