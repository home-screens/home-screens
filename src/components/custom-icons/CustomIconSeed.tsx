'use client';

import { useSeedCustomIcons } from '@/hooks/useCustomIcons';
import type { CustomIconEntry } from '@/lib/custom-icons';

/**
 * Hands a server-read icon library to the client catalog. For the public
 * kid view, which has no session or display token to fetch it with.
 */
export default function CustomIconSeed({ icons }: { icons: CustomIconEntry[] }) {
  useSeedCustomIcons(icons);
  return null;
}
