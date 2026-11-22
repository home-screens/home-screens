import { NextResponse } from 'next/server';
import { isPickerConnected, disconnectPicker, hasPickerCredentials } from '@/lib/google-picker';
import { withAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  const [connected, credentialsConfigured] = await Promise.all([
    isPickerConnected(),
    hasPickerCredentials(),
  ]);
  return NextResponse.json({ connected, credentialsConfigured });
}, 'Failed to check Google Photos status');

export const DELETE = withAuth(async () => {
  const { stillUsedBy } = await disconnectPicker();
  return NextResponse.json({ connected: false, stillUsedBy });
}, 'Failed to disconnect Google Photos');
