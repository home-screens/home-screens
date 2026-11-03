import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, withDisplayAuth } from '@/lib/api-utils';
import { addCustomIcon, customIconError, readCustomIcons } from '@/lib/custom-icon-data';
import { scanCustomIconUsage } from '@/lib/custom-icon-usage';
import { MAX_UPLOAD_BYTES, iconNameFromFileName, libraryBytes, type CustomIconUsage } from '@/lib/custom-icons';
import { readMealData } from '@/lib/meal-data';
import { readChoreData } from '@/lib/chore-data';
import { readRewardData } from '@/lib/reward-data';
import { readFamilyData } from '@/lib/family-data';
import { readRoutinesFile } from '@/lib/timer-data';
import { readConfig } from '@/lib/config';
import { withUrls } from '@/lib/custom-icon-http';

export const dynamic = 'force-dynamic';

/**
 * The household's icon library. Every surface that draws an icon reads this
 * (the wall included, hence display auth); `?usage=1` adds where each icon is
 * used, for the manage pages and a removal's confirmation.
 */
export const GET = withDisplayAuth(async (request: NextRequest) => {
  const icons = await readCustomIcons();
  const body: { icons: Awaited<ReturnType<typeof withUrls>>; bytes: number; usage?: Record<string, CustomIconUsage> } = {
    icons: await withUrls(icons),
    bytes: libraryBytes(icons),
  };
  if (request.nextUrl.searchParams.get('usage') === '1') {
    const [meals, chores, rewards, family, routines, config] = await Promise.all([
      readMealData(), readChoreData(), readRewardData(), readFamilyData(), readRoutinesFile(), readConfig(),
    ]);
    body.usage = Object.fromEntries(scanCustomIconUsage({ meals, chores, rewards, family, routines, config }));
  }
  return NextResponse.json(body);
}, 'Failed to load icons');

/**
 * Upload one picture (multipart `file`, optional `name`). A refusal is
 * thrown as a `CustomIconError`, which the route wrapper answers with its
 * code.
 */
export const POST = withAuth(async (request: NextRequest) => {
  // A body well past the limit makes formData() throw before the per-file
  // check could answer kindly, so refuse it from the header first.
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + 64 * 1024) {
    throw customIconError('too-big');
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw customIconError('not-a-picture');
  }
  const file = form.get('file');
  if (!(file instanceof File) || !file.size) throw customIconError('not-a-picture');
  if (file.size > MAX_UPLOAD_BYTES) throw customIconError('too-big');
  const rawName = form.get('name');
  const name = typeof rawName === 'string' && rawName.trim() ? rawName : iconNameFromFileName(file.name);
  // A new picture comes back pending (kept by the PATCH that follows "Use
  // this icon"); one the library already holds comes back as that icon.
  const { icon, existing } = await addCustomIcon(Buffer.from(await file.arrayBuffer()), name);
  const [entry] = await withUrls([icon]);
  return NextResponse.json({ icon: entry, existing }, { status: existing ? 200 : 201 });
}, 'Failed to add icon');
