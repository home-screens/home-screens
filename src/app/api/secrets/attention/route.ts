import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { servicesNeedingAttention } from '@/lib/service-attention';

export const dynamic = 'force-dynamic';

/**
 * Set-up services that are not working right now: Google Calendar that needs
 * a new sign-in, a server the hub's last request could not reach. The API
 * keys page shows them as "Needs attention" next to their keys.
 */
export const GET = withAuth(async () => {
  return NextResponse.json({ attention: await servicesNeedingAttention() });
}, 'Failed to check services');
