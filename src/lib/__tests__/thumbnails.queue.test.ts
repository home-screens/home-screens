import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * sharp stand-in whose encodes finish only when the test says so, to watch
 * the resize queue from outside: how many run at once and in what order.
 */
const fake = vi.hoisted(() => {
  const state = {
    active: 0,
    maxActive: 0,
    started: [] as string[],
    finish: [] as Array<() => void>,
    pages: 1,
    concurrency: vi.fn(),
    cache: vi.fn(),
  };
  function sharp(file: string) {
    const pipeline = {
      metadata: async () => ({ width: 4000, height: 3000, pages: state.pages, hasAlpha: false }),
      rotate: () => pipeline,
      resize: () => pipeline,
      webp: () => pipeline,
      jpeg: () => pipeline,
      toBuffer: () => {
        state.active++;
        state.maxActive = Math.max(state.maxActive, state.active);
        state.started.push(path.basename(file));
        return new Promise<Buffer>((resolve) => {
          state.finish.push(() => {
            state.active--;
            resolve(Buffer.from('copy'));
          });
        });
      },
    };
    return pipeline;
  }
  sharp.concurrency = state.concurrency;
  sharp.cache = state.cache;
  return { state, sharp };
});

vi.mock('sharp', () => ({ default: fake.sharp }));

let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'thumbs-queue-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  Object.assign(fake.state, { active: 0, maxActive: 0, started: [], finish: [], pages: 1 });
  vi.resetModules();
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function file(name: string): Promise<string> {
  const abs = path.join(tmpDir, name);
  await fs.writeFile(abs, name);
  return abs;
}

/** Finish the oldest running encode, once one has started. */
async function finishNext(): Promise<void> {
  await vi.waitFor(() => expect(fake.state.finish.length).toBeGreaterThan(0));
  fake.state.finish.shift()!();
}

describe('resize queue', () => {
  it('runs one resize at a time, and a wall copy jumps the grid tiles waiting', async () => {
    const { thumbnailPath, wallCopyPath, __resizeQueueForTests: queue } = await import('@/lib/thumbnails');
    const tiles = await Promise.all(['a.jpg', 'b.jpg', 'c.jpg'].map(file));
    const photo = await file('slide.jpg');

    const jobs = tiles.map((abs) => thumbnailPath(abs, path.basename(abs), 480));
    await vi.waitFor(() => expect(queue()).toEqual({ active: 1, wall: 0, grid: 2 }));
    const wall = wallCopyPath(photo, 'slide.jpg', { w: 1080, h: 1920 });
    await vi.waitFor(() => expect(queue()).toEqual({ active: 1, wall: 1, grid: 2 }));
    // Whichever tile's file check finished first holds the slot.
    expect(fake.state.started).toHaveLength(1);

    for (let i = 0; i < 4; i++) await finishNext();
    await Promise.all([...jobs, wall]);
    expect(queue()).toEqual({ active: 0, wall: 0, grid: 0 });

    expect(fake.state.maxActive).toBe(1);
    // The wall copy went next, ahead of the two tiles that were waiting before it.
    expect(fake.state.started[1]).toBe('slide.jpg');
    expect([...fake.state.started].sort()).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'slide.jpg']);
    // One libvips thread per resize, and no in-memory cache of pictures that go to disk.
    expect(fake.state.concurrency).toHaveBeenCalledWith(1);
    expect(fake.state.cache).toHaveBeenCalledWith(false);
  });

  it('shares one resize between two asks for the same copy', async () => {
    const { wallCopyPath } = await import('@/lib/thumbnails');
    const photo = await file('slide.jpg');
    const first = wallCopyPath(photo, 'slide.jpg', { w: 1080, h: 1920 });
    const second = wallCopyPath(photo, 'slide.jpg', { w: 1080, h: 1920 });
    await finishNext();
    expect(await first).toBe(await second);
    expect(fake.state.started).toEqual(['slide.jpg']);
  });

  it('leaves an animated picture whole', async () => {
    const { wallCopyPath } = await import('@/lib/thumbnails');
    fake.state.pages = 12;
    const photo = await file('moving.webp');
    expect(await wallCopyPath(photo, 'moving.webp', { w: 720, h: 720 })).toBeNull();
    expect(fake.state.started).toEqual([]);
  });
});
