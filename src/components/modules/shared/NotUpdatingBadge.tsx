'use client';

/**
 * The line a card shows over data it kept through failed refreshes: "Not
 * updating since 9:14 AM". Quiet at first, louder (a tinted chip) once the
 * outage is a day old. Sized in `em`, so it follows the card's own text.
 */
export default function NotUpdatingBadge({ text, loud, testId }: { text: string; loud: boolean; testId?: string }) {
  return (
    <div
      className="flex items-center gap-1.5 shrink-0 self-start"
      role="status"
      data-testid={testId}
      data-loud={loud ? '' : undefined}
      style={loud
        ? { fontSize: '0.7em', marginBottom: 6, padding: '0.3em 0.7em', borderRadius: '0.5em', backgroundColor: 'rgba(245,185,66,0.14)' }
        : { fontSize: '0.6em', marginBottom: 4 }}
    >
      <span className="rounded-full shrink-0" style={{ width: '0.7em', height: '0.7em', backgroundColor: loud ? '#f5b942' : '#d9a441' }} aria-hidden="true" />
      <span style={{ color: loud ? '#f5b942' : '#d9a441', fontWeight: 600 }}>{text}</span>
    </div>
  );
}
