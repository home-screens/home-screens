import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import type { ChoreCompletion, ChoreToggleRequest } from '@/types/config';
import { errorResponse } from '@/lib/api-utils';
import { readChoreData } from '@/lib/chore-data';
import { creditPoints, debitPointsExact } from '@/lib/reward-data';
import { CHORE_HISTORY_DAYS } from '@/components/modules/chore-chart/types';

export const dynamic = 'force-dynamic';

const DATA_FILE = path.join(process.cwd(), 'data', 'chore-completions.json');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True iff `s` is a YYYY-MM-DD string AND the components are a real calendar date.
 *  Rejects junk like "2026-99-99" (which the regex alone would accept). */
function isValidISODate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

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
// concurrent requests can't read stale data. Callbacks may return `null` to
// signal "no change — skip the write" so a quiescent GET on each 15s poll
// doesn't churn the disk unnecessarily.
let opQueue: Promise<CompletionsData> = Promise.resolve({ completions: [] });

function enqueueOp(
  fn: (data: CompletionsData) => Promise<CompletionsData | null>,
): Promise<CompletionsData> {
  const next = opQueue.then(async () => {
    const data = await readCompletions();
    const result = await fn(data);
    if (result === null) return data; // no-op — skip the write
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

/** Remove completions older than CHORE_HISTORY_DAYS days */
function purgeOld(completions: ChoreCompletion[]): ChoreCompletion[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CHORE_HISTORY_DAYS);
  const cutoffStr = localDateStr(cutoff);
  return completions.filter((c) => c.date >= cutoffStr);
}

// Public on the LAN — no auth wrapper. The /chores route is the unauthenticated
// kid view, so its data endpoint must be readable/writable without a session.
// /remote sits behind its own page-level auth and protects mutations there.
export const GET = async () => {
  try {
    // Always go through the queue (so we observe in-flight POST writes), but
    // only persist when purgeOld actually evicted something — otherwise a
    // quiescent display polling every 15s would churn the disk forever.
    const result = await enqueueOp(async (data) => {
      const cleaned = purgeOld(data.completions);
      if (cleaned.length === data.completions.length) return null; // nothing to purge
      return { completions: cleaned };
    });
    return NextResponse.json({ completions: result.completions });
  } catch (error) {
    return errorResponse(error, 'Failed to read chore completions');
  }
};

export const POST = async (request: NextRequest) => {
  try {
  const body = await request.json();
  const { choreId, memberId, date } = body as ChoreToggleRequest;

  if (!choreId || !memberId || !date) {
    return NextResponse.json(
      { error: 'Missing choreId, memberId, or date' },
      { status: 400 },
    );
  }

  if (!isValidISODate(date)) {
    return NextResponse.json(
      { error: 'Invalid date format — expected a real YYYY-MM-DD calendar date' },
      { status: 400 },
    );
  }

  const today = localDateStr(new Date());
  const earliest = (() => {
    const d = new Date();
    d.setDate(d.getDate() - (CHORE_HISTORY_DAYS - 1));
    return localDateStr(d);
  })();
  if (date > today || date < earliest) {
    return NextResponse.json(
      { error: `Date must be within the last ${CHORE_HISTORY_DAYS} days` },
      { status: 400 },
    );
  }

  // Read chore data in parallel with toggle (needed for point value lookup)
  const choreDataPromise = readChoreData();

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

  const wasAdded = result.completions.some(
    (c) => c.choreId === choreId && c.memberId === memberId && c.date === date,
  );

  // Credit on add, exact-debit on remove. Awaited so the response reflects the
  // post-write state and surfaces the warning if balance went negative.
  const choreData = await choreDataPromise;
  const chore = choreData.chores.find((c) => c.id === choreId);
  let warning: string | undefined;
  if (chore && chore.points > 0) {
    if (wasAdded) {
      await creditPoints(memberId, chore.points);
    } else {
      const debitResult = await debitPointsExact(memberId, chore.points);
      if (debitResult.wentNegative) {
        const memberName = choreData.members.find((m) => m.id === memberId)?.name ?? 'They';
        warning = `${memberName}'s balance is now ${debitResult.balance} — they'll need to earn ${Math.abs(debitResult.balance)} points before redeeming again.`;
      }
    }
  }

  return NextResponse.json({ completions: result.completions, ...(warning ? { warning } : {}) });
  } catch (error) {
    return errorResponse(error, 'Failed to update chore completions');
  }
};
