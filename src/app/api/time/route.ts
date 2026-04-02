import { NextResponse } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withDisplayAuth(async () => {
  const now = new Date();
  return NextResponse.json({
    iso: now.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    formatted: now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }),
  });
}, 'Failed to get server time');
