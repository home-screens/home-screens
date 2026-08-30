import { describe, it, expect } from 'vitest';
import {
  encryptCredentials,
  decryptCredentials,
  BadPassphraseError,
  MalformedEnvelopeError,
  DEFAULT_SCRYPT_PARAMS,
} from '@/lib/backup-crypto';
import type { CredentialPayload } from '@/lib/backup-credentials-types';

const payload: CredentialPayload = {
  secrets: { openweathermap_key: 'owm-abc123' },
  icloudAccounts: { accounts: [{ id: 'a1', appleId: 'x@y.z', appPassword: 'abcd-efgh' }] },
  auth: { passwordHash: 'hash', salt: 'salt', cookieSecret: 'cookie' },
};

const PASSWORD = 'correct horse battery';

describe('backup-crypto', () => {
  it('round-trips a payload through encrypt/decrypt', async () => {
    const envelope = await encryptCredentials(payload, PASSWORD);
    expect(envelope.encrypted).toBe(true);
    expect(envelope.kdf).toBe('scrypt');
    expect(envelope.kdfParams).toEqual(DEFAULT_SCRYPT_PARAMS);

    const decrypted = await decryptCredentials(envelope, PASSWORD);
    expect(decrypted).toEqual(payload);
  });

  it('does not leave any secret value readable in the envelope', async () => {
    const envelope = await encryptCredentials(payload, PASSWORD);
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain('owm-abc123');
    expect(serialized).not.toContain('abcd-efgh');
    expect(serialized).not.toContain('cookie');
  });

  it('uses a fresh salt and IV per call, so two exports never match', async () => {
    const a = await encryptCredentials(payload, PASSWORD);
    const b = await encryptCredentials(payload, PASSWORD);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('throws BadPassphraseError on the wrong password', async () => {
    const envelope = await encryptCredentials(payload, PASSWORD);
    await expect(decryptCredentials(envelope, 'not the password')).rejects.toBeInstanceOf(
      BadPassphraseError,
    );
  });

  it('rejects a tampered ciphertext', async () => {
    const envelope = await encryptCredentials(payload, PASSWORD);
    const bytes = Buffer.from(envelope.ciphertext, 'base64');
    bytes[0] ^= 0xff;
    const tampered = { ...envelope, ciphertext: bytes.toString('base64') };
    await expect(decryptCredentials(tampered, PASSWORD)).rejects.toBeInstanceOf(BadPassphraseError);
  });

  // The AAD binding is the reason a header edit can't survive: without it an
  // attacker could rewrite kdfParams.N down to 2 and make an offline guess
  // cheap, while the tag still verified.
  it('rejects a downgraded work factor in the header', async () => {
    const envelope = await encryptCredentials(payload, PASSWORD);
    const downgraded = { ...envelope, kdfParams: { ...envelope.kdfParams, N: 2 } };
    await expect(decryptCredentials(downgraded, PASSWORD)).rejects.toBeInstanceOf(
      BadPassphraseError,
    );
  });

  it('rejects a swapped salt in the header', async () => {
    const envelope = await encryptCredentials(payload, PASSWORD);
    const other = await encryptCredentials(payload, PASSWORD);
    await expect(
      decryptCredentials({ ...envelope, salt: other.salt }, PASSWORD),
    ).rejects.toBeInstanceOf(BadPassphraseError);
  });

  it('rejects absurd KDF parameters before spending memory on them', async () => {
    const envelope = await encryptCredentials(payload, PASSWORD);
    // N far past what maxmem allows — must be refused, not attempted.
    const huge = { ...envelope, kdfParams: { ...envelope.kdfParams, N: 1 << 20 } };
    await expect(decryptCredentials(huge, PASSWORD)).rejects.toBeInstanceOf(MalformedEnvelopeError);
    // Not a power of two — scrypt would throw a raw error.
    const odd = { ...envelope, kdfParams: { ...envelope.kdfParams, N: 1000 } };
    await expect(decryptCredentials(odd, PASSWORD)).rejects.toBeInstanceOf(MalformedEnvelopeError);
  });

  it('rejects a salt or IV of the wrong length', async () => {
    const envelope = await encryptCredentials(payload, PASSWORD);
    await expect(
      decryptCredentials({ ...envelope, iv: Buffer.alloc(8).toString('base64') }, PASSWORD),
    ).rejects.toBeInstanceOf(MalformedEnvelopeError);
    await expect(
      decryptCredentials({ ...envelope, salt: Buffer.alloc(4).toString('base64') }, PASSWORD),
    ).rejects.toBeInstanceOf(MalformedEnvelopeError);
  });

  it('refuses to encrypt with a too-short password', async () => {
    await expect(encryptCredentials(payload, 'short')).rejects.toThrow(/at least/);
  });

  // 128 * N * r at the defaults is exactly Node's default maxmem ceiling, so
  // this fails without the explicit maxmem override.
  it('derives at the default work factor without hitting the maxmem ceiling', async () => {
    const envelope = await encryptCredentials({}, PASSWORD);
    await expect(decryptCredentials(envelope, PASSWORD)).resolves.toEqual({});
  });

  it('normalizes the password so equivalent Unicode forms still unlock', async () => {
    // U+00E9 as one code point vs. "e" + U+0301 combining acute.
    // Different keyboards and OSes produce either for the same keystrokes.
    const composed = 'password\u00e9A';
    const decomposed = 'passworde\u0301A';
    expect(composed).not.toBe(decomposed);
    const envelope = await encryptCredentials(payload, composed);
    await expect(decryptCredentials(envelope, decomposed)).resolves.toEqual(payload);
  });
});
