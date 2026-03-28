import { NextResponse } from 'next/server';
import { isAuthenticated, disconnect, hasGoogleCredentials } from '@/lib/google-auth';
import { withAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  const [connected, credentialsConfigured] = await Promise.all([
    isAuthenticated(),
    hasGoogleCredentials(),
  ]);
  return NextResponse.json({ connected, credentialsConfigured });
}, 'Failed to check Google auth status');

export const DELETE = withAuth(async () => {
  await disconnect();
  return NextResponse.json({ connected: false });
}, 'Failed to disconnect Google account');
