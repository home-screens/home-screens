import { describe, it, expect } from 'vitest';
import { Readable } from 'stream';
import { toWebStream } from '../web-stream';

describe('toWebStream', () => {
  it('streams all chunks and closes at the end', async () => {
    const source = Readable.from([Buffer.from('hello '), Buffer.from('world')]);
    const text = await new Response(toWebStream(source)).text();
    expect(text).toBe('hello world');
  });

  it('destroys the source when the consumer cancels', async () => {
    const source = new Readable({ read() {} });
    const reader = toWebStream(source).getReader();

    source.push(Buffer.from('first'));
    await reader.read();
    await reader.cancel();

    expect(source.destroyed).toBe(true);
  });

  it('swallows chunks that land after the controller is closed', async () => {
    // Reproduces the ERR_INVALID_STATE race: a chunk already in flight when
    // the client aborts must not throw an uncaughtException.
    const source = new Readable({ read() {} });
    const reader = toWebStream(source).getReader();

    source.push(Buffer.from('first'));
    await reader.read();
    await reader.cancel();

    expect(() => source.emit('data', Buffer.from('late chunk'))).not.toThrow();
  });

  it('propagates source errors to the reader', async () => {
    const source = new Readable({ read() {} });
    const reader = toWebStream(source).getReader();

    source.destroy(new Error('disk gone'));

    await expect(reader.read()).rejects.toThrow('disk gone');
  });
});
