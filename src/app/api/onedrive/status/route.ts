import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { getMicrosoftClientId, onedriveVerifyConnected, getAccount } from '@/lib/onedrive';

export const dynamic = 'force-dynamic';

/** Connection state for the editor panel — mirrors google-picker/status. */
export const GET = withAuth(async (_request: NextRequest) => {
  const clientId = await getMicrosoftClientId();
  const credentialsConfigured = clientId !== null;
  const connected = credentialsConfigured && await onedriveVerifyConnected();
  const account = connected ? await getAccount() : null;
  return NextResponse.json({ credentialsConfigured, connected, account });
}, 'Could not check the OneDrive connection');
