import { NextResponse } from 'next/server';
import { isAuthenticated, disconnect, hasGoogleCredentials, getCalendarSignInMode } from '@/lib/google-auth';
import { withAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  const [connected, credentialsConfigured, mode] = await Promise.all([
    isAuthenticated(),
    hasGoogleCredentials(),
    getCalendarSignInMode(),
  ]);
  return NextResponse.json({ connected, credentialsConfigured, mode });
}, 'Failed to check Google auth status');

export const DELETE = withAuth(async () => {
  const { stillUsedBy } = await disconnect();
  return NextResponse.json({ connected: false, stillUsedBy });
}, 'Failed to disconnect Google account');
