import { NextRequest, NextResponse } from 'next/server';
import { buildClearCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const cookie = buildClearCookie(request);
  return NextResponse.json({ ok: true }, {
    headers: { 'Set-Cookie': cookie },
  });
}
