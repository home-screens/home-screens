import { NextResponse } from 'next/server';
import { fetchRegistry } from '@/lib/plugins';
import { publicErrorResponse } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const registry = await fetchRegistry();
    return NextResponse.json(registry);
  } catch (error) {
    return publicErrorResponse(error, 'Failed to fetch plugin registry');
  }
}
