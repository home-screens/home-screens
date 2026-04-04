import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { readConfig, writeConfig } from '@/lib/config';
import { readChoreData, writeChoreData } from '@/lib/chore-data';
import { readMealData, writeMealData } from '@/lib/meal-data';
import { readRewardData, writeRewardData } from '@/lib/reward-data';
import { writeBackupState } from '@/lib/backup-state';
import { withAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const COMPLETIONS_FILE = path.join(process.cwd(), 'data', 'chore-completions.json');

interface CompletionsData {
  completions: { choreId: string; memberId: string; date: string; completedAt: string }[];
}

async function readCompletions(): Promise<CompletionsData> {
  try {
    const raw = await fs.readFile(COMPLETIONS_FILE, 'utf-8');
    return JSON.parse(raw) as CompletionsData;
  } catch {
    return { completions: [] };
  }
}

async function writeCompletions(data: CompletionsData): Promise<void> {
  await fs.mkdir(path.dirname(COMPLETIONS_FILE), { recursive: true });
  const tmp = COMPLETIONS_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmp, COMPLETIONS_FILE);
}

// GET — export a full backup bundle
export const GET = withAuth(async () => {
  const [config, chores, completions, meals, rewards] = await Promise.all([
    readConfig(),
    readChoreData(),
    readCompletions(),
    readMealData(),
    readRewardData(),
  ]);

  const bundle = {
    _type: 'home-screens-backup',
    _version: 1,
    _createdAt: new Date().toISOString(),
    config,
    chores,
    choreCompletions: completions,
    meals,
    rewards,
  };

  // Record backup timestamp (fire-and-forget) — write both fields directly
  // to avoid a read-modify-write race with concurrent dismiss POSTs
  writeBackupState({
    lastBackupDate: new Date().toISOString(),
    lastDismissedDate: null,
  }).catch(() => {});

  return NextResponse.json(bundle);
}, 'Failed to create backup');

// POST — restore from a backup bundle (or a legacy config-only file)
export const POST = withAuth(async (request: NextRequest) => {
  const body = await request.json();

  // New bundle format
  if (body._type === 'home-screens-backup') {
    const promises: Promise<unknown>[] = [];

    if (body.config) {
      promises.push(writeConfig(body.config));
    }
    if (body.chores) {
      promises.push(writeChoreData(body.chores));
    }
    if (body.choreCompletions) {
      promises.push(writeCompletions(body.choreCompletions));
    }
    if (body.meals) {
      promises.push(writeMealData(body.meals));
    }
    if (body.rewards) {
      promises.push(writeRewardData(body.rewards));
    }

    await Promise.all(promises);

    return NextResponse.json({
      restored: {
        config: !!body.config,
        chores: !!body.chores,
        choreCompletions: !!body.choreCompletions,
        meals: !!body.meals,
        rewards: !!body.rewards,
      },
    });
  }

  // Legacy format: raw ScreenConfiguration object
  if (body.screens && Array.isArray(body.screens) && body.settings) {
    await writeConfig(body);
    return NextResponse.json({ restored: { config: true } });
  }

  return NextResponse.json(
    { error: 'Unrecognized backup format' },
    { status: 400 },
  );
}, 'Failed to restore backup');
