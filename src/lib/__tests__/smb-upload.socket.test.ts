import { describe, it, expect, afterEach } from 'vitest';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { SMB_LIMITS, testDestination } from '../smb-upload';
import type { ShareDestination } from '../storage-destination';

/**
 * The real `smb3-client` against small local servers that misbehave, so the
 * parts of `smb-upload.ts` that reach past the library's public face are
 * checked against the library itself: the watchdog must find and close the
 * real socket, and a server that hangs up while connecting is the SMB 1 case.
 */

const LIMITS = { ...SMB_LIMITS };
const servers: net.Server[] = [];

async function serve(onSocket: (socket: net.Socket) => void): Promise<{ port: number; closed: Promise<void> }> {
  let markClosed: () => void = () => {};
  const closed = new Promise<void>((resolve) => { markClosed = resolve; });
  const server = net.createServer((socket) => {
    socket.on('close', markClosed);
    // Read and drop what arrives: a socket left unread never reports that
    // the other end closed.
    socket.resume();
    onSocket(socket);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { port: (server.address() as AddressInfo).port, closed };
}

function share(port: number): ShareDestination {
  return { kind: 'smb', host: '127.0.0.1', port, share: 'Backups', folder: '', username: 'taylor', password: 'pw' };
}

afterEach(async () => {
  Object.assign(SMB_LIMITS, LIMITS);
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('smb-upload against the real library', () => {
  it('gives up on a storage that never answers, and closes the connection it opened', async () => {
    Object.assign(SMB_LIMITS, { idleMs: 150, watchMs: 20, closeGraceMs: 50 });
    // Takes the connection and says nothing, the way a frozen server does.
    const silent = await serve(() => {});
    const started = Date.now();
    expect(await testDestination(share(silent.port))).toMatchObject({ ok: false, code: 'timeout' });
    expect(Date.now() - started).toBeLessThan(3000);
    await silent.closed;
  });

  it('reads a storage that hangs up while connecting as one that only speaks SMB 1', async () => {
    const hangUp = await serve((socket) => socket.destroy());
    expect(await testDestination(share(hangUp.port))).toMatchObject({ ok: false, code: 'too-old' });
  });

  it('reaches an IPv6 storage written in brackets, as addresses write it', async () => {
    let markSeen: () => void = () => {};
    const seen = new Promise<void>((resolve) => { markSeen = resolve; });
    const server = net.createServer((socket) => { markSeen(); socket.destroy(); });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '::1', resolve));
    const { port } = server.address() as AddressInfo;
    // Reaching it and being hung up on is the SMB 1 answer; not reaching it would be "unreachable".
    expect(await testDestination({ ...share(port), host: '[::1]' })).toMatchObject({ ok: false, code: 'too-old' });
    await seen;
  });

  it('says it cannot reach a storage that is not there', async () => {
    const gone = await serve(() => {});
    const { port } = gone;
    await new Promise<void>((resolve) => servers.pop()!.close(() => resolve()));
    expect(await testDestination(share(port))).toMatchObject({ ok: false, code: 'unreachable' });
  });
});
