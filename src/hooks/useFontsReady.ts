'use client';

import { useEffect, useState } from 'react';

/**
 * False until the page's web fonts have finished loading, then true.
 *
 * Anything that measures rendered text needs this. Until the woff2 lands, text
 * is laid out in the fallback face (`font-display: swap`), and the swap changes
 * every width and line height afterwards — with nothing to re-run the
 * measurement. A layout that measured once therefore keeps a size derived from
 * a face the user never sees. On a Pi that face is whatever fontconfig picks,
 * so the error is not small.
 *
 * Include it in whatever key or dependency list drives the measurement and the
 * work is redone once, when the real face is in.
 *
 * Starts false rather than reading `document.fonts.status` during render: the
 * display is server-rendered, so a render-time DOM read would either crash on
 * the server or hydrate differently on the client. The cost is one extra
 * measurement on a page whose fonts were already cached.
 */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // No FontFaceSet (jsdom, older engines): nothing to wait for.
    if (typeof document === 'undefined' || !document.fonts) { setReady(true); return; }
    let cancelled = false;
    document.fonts.ready.then(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);
  return ready;
}
