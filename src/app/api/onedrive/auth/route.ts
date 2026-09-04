import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { startDeviceFlow, pollDeviceFlow, onedriveDisconnect, OneDriveError } from '@/lib/onedrive';

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
    // Same catch as folders/photos/serve: only a OneDriveError is an answer,
    // anything else is a bug and belongs in withAuth's 500 with a log. The
    // `code` is what the editor translates; the sentence is for curl.
    if (error instanceof OneDriveError) {
      return NextResponse.json(
        { error: error.message, code: error.code ?? 'start_failed' },
        { status: error.status },
      );
    }
    throw error; // withAuth answers 500
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
