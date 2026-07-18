import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { getICloudAccount } from '@/lib/icloud-accounts';
import { listICloudCalendars, checkICloudBirthdaysAvailable } from '@/lib/caldav-calendar';

export const dynamic = 'force-dynamic';

/** List an iCloud account's calendars (plus birthdays availability) for the editor picker. */
export const GET = withAuth(async (request) => {
  const accountId = request.nextUrl.searchParams.get('account');
  if (!accountId) {
    return NextResponse.json(
      { error: 'Missing required parameter: account' },
      { status: 400 },
    );
  }

  const account = await getICloudAccount(accountId);
  if (!account) {
    return NextResponse.json(
      { error: 'iCloud account not found. It may have been removed; try connecting again.' },
      { status: 404 },
    );
  }

  const [calendars, birthdaysAvailable] = await Promise.all([
    listICloudCalendars(account),
    checkICloudBirthdaysAvailable(account),
  ]);

  return NextResponse.json({ calendars, birthdaysAvailable });
}, 'Failed to load iCloud calendars');
