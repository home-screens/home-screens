'use client';

import { useEffect } from 'react';

/** How often a page that failed to load is loaded again. */
const RETRY_MS = 15_000;

export interface RouteErrorText {
  title: string;
  body: string;
  help: string;
  retry: string;
}

/** For the pages that have no translations to hand: the root of the app, outside every language provider. */
export const ROUTE_ERROR_ENGLISH: RouteErrorText = {
  title: "This page can't load right now",
  body: 'Home Screens is having trouble reading its saved data. It will try again on its own in a moment.',
  help: "If this doesn't go away, a grown-up can open Home Screens on a computer and put back a backup in Settings > Backups & data.",
  retry: 'Try again',
};

/**
 * What a page shows when it could not be drawn at all (a damaged data file,
 * a hub that is still starting). It loads the page again every few seconds
 * on its own: a wall has no keyboard or mouse to press "Try again" with, and
 * would otherwise sit on the error long after the hub was fixed.
 *
 * Styled inline, in fixed colors: it also stands in for the whole document
 * when the root layout fails, where no stylesheet or theme is loaded.
 */
export default function RouteErrorScreen({ text, error }: { text: RouteErrorText; error?: Error & { digest?: string } }) {
  useEffect(() => {
    if (error) console.error(error);
  }, [error]);

  useEffect(() => {
    const id = setInterval(() => window.location.reload(), RETRY_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      role="alert"
      data-testid="route-error"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        textAlign: 'center',
        background: '#0a0a0a',
        color: '#e5e5e5',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial',
      }}
    >
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{text.title}</h1>
      <p style={{ margin: 0, maxWidth: 520, fontSize: 15, lineHeight: 1.5, color: '#a3a3a3' }}>{text.body}</p>
      <p style={{ margin: 0, maxWidth: 520, fontSize: 13, lineHeight: 1.5, color: '#737373' }}>{text.help}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          marginTop: 8,
          padding: '10px 18px',
          borderRadius: 10,
          border: '1px solid #404040',
          background: '#171717',
          color: '#e5e5e5',
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {text.retry}
      </button>
    </div>
  );
}
