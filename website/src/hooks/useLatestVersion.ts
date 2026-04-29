'use client';

import { useEffect, useState } from 'react';

const VERSION_URL =
  'https://home-screens-version.agent462.workers.dev/version';
const FALLBACK_VERSION = 'v1.3.0';

export function useLatestVersion(): string {
  const [version, setVersion] = useState(FALLBACK_VERSION);

  useEffect(() => {
    fetch(VERSION_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { version: string } | null) => {
        if (data?.version) setVersion(data.version);
      })
      .catch(() => {
        // Fallback silently — the static version is already set
      });
  }, []);

  return version;
}
