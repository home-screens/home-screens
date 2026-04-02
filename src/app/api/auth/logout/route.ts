import { NextRequest, NextResponse } from 'next/server';
import { buildClearCookie } from '@/lib/auth';
import { errorResponse } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const cookie = buildClearCookie(request);
    return NextResponse.json({ ok: true }, {
      headers: { 'Set-Cookie': cookie },
    });
  } catch (error) {
    return errorResponse(error, 'Failed to logout');
  }
}
