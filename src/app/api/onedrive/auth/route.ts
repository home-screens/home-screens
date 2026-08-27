import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { startDeviceFlow, pollDeviceFlow, onedriveDisconnect } from '@/lib/onedrive';

export const dynamic = 'force-dynamic';

/**
 * Device-code sign-in. POST starts a flow (the editor shows userCode and
 * opens verificationUri), GET is one poll attempt spaced at intervalMs,
 * DELETE drops the stored grant — Microsoft consumer accounts have no
 * revocation endpoint, so local deletion plus the user's Microsoft account
 * page is the full story.
 */

export const POST = withAuth(async () => {
  try {
    return NextResponse.json(await startDeviceFlow());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not start Microsoft sign-in' },
      { status: 400 },
    );
  }
}, 'Could not start Microsoft sign-in');

/** Always 200 — the state machine is the payload, so a thrown poll is just 'failed'. */
export const GET = withAuth(async () => {
  try {
    return NextResponse.json(await pollDeviceFlow());
  } catch (error) {
    return NextResponse.json({
      state: 'failed',
      message: error instanceof Error ? error.message : 'Sign-in check failed',
    });
  }
}, 'Sign-in check failed');

export const DELETE = withAuth(async () => {
  await onedriveDisconnect();
  return NextResponse.json({ connected: false });
}, 'Could not disconnect OneDrive');
