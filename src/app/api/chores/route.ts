import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import type { ChoreCompletion } from '@/types/config';
import { withAuth, withDisplayAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const DATA_FILE = path.join(process.cwd(), 'data', 'chore-completions.json');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface CompletionsData {
  completions: ChoreCompletion[];
}

/** Format a Date as YYYY-MM-DD in local time */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function readCompletions(): Promise<CompletionsData> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(raw) as CompletionsData;
  } catch {
    return { completions: [] };
  }
}

// Serialize all read-modify-write operations to prevent races.
// Both GET (purge) and POST (toggle) go through this queue so
// concurrent requests can't read stale data.
let opQueue: Promise<CompletionsData> = Promise.resolve({ completions: [] });

function enqueueOp(fn: (data: CompletionsData) => Promise<CompletionsData>): Promise<CompletionsData> {
  const next = opQueue.then(async () => {
    const data = await readCompletions();
    const result = await fn(data);
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(result, null, 2), 'utf-8');
    await fs.rename(tmp, DATA_FILE);
    return result;
  });
  // Advance queue even on failure so it doesn't block forever
  opQueue = next.catch(() => ({ completions: [] }));
  return next;
}

/** Remove completions older than 30 days */
function purgeOld(completions: ChoreCompletion[]): ChoreCompletion[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = localDateStr(cutoff);
  return completions.filter((c) => c.date >= cutoffStr);
}

export const GET = withDisplayAuth(async () => {
  const data = await readCompletions();
  const cleaned = purgeOld(data.completions);

  // Write back inside the queue if we purged anything
  if (cleaned.length !== data.completions.length) {
    await enqueueOp(async (current) => ({
      completions: purgeOld(current.completions),
    }));
  }

  return NextResponse.json({ completions: cleaned });
}, 'Failed to read chore completions');

export const POST = withAuth(async (request: NextRequest) => {
  const body = await request.json();
  const { choreId, memberId, date } = body as {
    choreId: string;
    memberId: string;
    date: string;
  };

  if (!choreId || !memberId || !date) {
    return NextResponse.json(
      { error: 'Missing choreId, memberId, or date' },
      { status: 400 },
    );
  }

  if (!DATE_RE.test(date)) {
    return NextResponse.json(
      { error: 'Invalid date format — expected YYYY-MM-DD' },
      { status: 400 },
    );
  }

  const result = await enqueueOp(async (data) => {
    const existing = data.completions.findIndex(
      (c) => c.choreId === choreId && c.memberId === memberId && c.date === date,
    );

    if (existing >= 0) {
      data.completions.splice(existing, 1);
    } else {
      data.completions.push({
        choreId,
        memberId,
        date,
        completedAt: new Date().toISOString(),
      });
    }

    return data;
  });

  return NextResponse.json({ completions: result.completions });
}, 'Failed to update chore completions');
