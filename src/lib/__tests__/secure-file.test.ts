import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { writeSecureFile } from '../secure-file';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-secure-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

describe('writeSecureFile', () => {
  it('writes content to the specified file', async () => {
    const filePath = path.join(tmpDir, 'secrets.json');
    await writeSecureFile(filePath, '{"key":"value"}');

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('{"key":"value"}');
  });

  it('sets file permissions to 0600 (owner read/write only)', async () => {
    const filePath = path.join(tmpDir, 'secrets.json');
    await writeSecureFile(filePath, 'secret');

    const stat = await fs.stat(filePath);
    // 0o600 = owner read/write, no group/other permissions
    // mode includes file type bits, so mask with 0o777
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('overwrites existing file content', async () => {
    const filePath = path.join(tmpDir, 'secrets.json');
    await writeSecureFile(filePath, 'first');
    await writeSecureFile(filePath, 'second');

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('second');
  });
});
