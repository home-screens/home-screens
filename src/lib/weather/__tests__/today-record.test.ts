import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { recordReading, readDayRange, readingKey } from '../today-record';

let tmpDir: string;
let origCwd: typeof process.cwd;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-today-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const KEY = readingKey('noaa', '40.2', '-74.9', 'imperial');

describe('recordReading', () => {
  it('widens the day to the warmest and coldest readings seen', async () => {
    await recordReading(KEY, '2026-09-04', 72);
    await recordReading(KEY, '2026-09-04', 86);
    const range = await recordReading(KEY, '2026-09-04', 80);
    expect(range).toEqual({ date: '2026-09-04', high: 86, low: 72 });
    expect(await readDayRange(KEY, '2026-09-04')).toEqual(range);
  });

  it('starts over on a new day', async () => {
    await recordReading(KEY, '2026-09-04', 86);
    const range = await recordReading(KEY, '2026-09-05', 61);
    expect(range).toEqual({ date: '2026-09-05', high: 61, low: 61 });
    expect(await readDayRange(KEY, '2026-09-04')).toBeUndefined();
  });

  it('keeps another place\'s day while it is within a day of this one', async () => {
    // A place in a zone behind this one is still on yesterday.
    const other = readingKey('noaa', '44.7', '-93.4', 'imperial');
    await recordReading(other, '2026-09-03', 90);
    await recordReading(KEY, '2026-09-04', 86);
    expect(await readDayRange(other, '2026-09-03')).toMatchObject({ high: 90 });
  });

  it('drops another place\'s day once it is older than that', async () => {
    const other = readingKey('noaa', '44.7', '-93.4', 'imperial');
    await recordReading(other, '2026-09-01', 90);
    await recordReading(KEY, '2026-09-04', 86);
    expect(await readDayRange(other, '2026-09-01')).toBeUndefined();
    expect(await readDayRange(KEY, '2026-09-04')).toMatchObject({ high: 86 });
  });

  it('survives a restart', async () => {
    await recordReading(KEY, '2026-09-04', 86);
    const raw = JSON.parse(await fs.readFile(path.join(tmpDir, 'data/weather-today.json'), 'utf-8'));
    expect(raw.readings[KEY]).toEqual({ date: '2026-09-04', high: 86, low: 86 });
  });
});
