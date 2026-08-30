/**
 * Passphrase encryption for the credential section of a backup bundle.
 *
 * scrypt (N=32768, r=8, p=1) derives a 32-byte key; AES-256-GCM seals the
 * JSON. The envelope header — kdf, kdfParams, salt, iv — is bound as
 * additional authenticated data, so an attacker who edits the bundle to
 * claim a weaker N cannot produce a payload whose tag still verifies. Without
 * that binding the header is unauthenticated attacker-controlled input and
 * the work factor becomes negotiable downward.
 */

import crypto from 'crypto';
import type {
  CredentialPayload,
  EncryptedCredentialEnvelope,
  ScryptParams,
} from './backup-credentials-types';
import { MIN_PASSPHRASE_LENGTH } from './backup-credentials-types';

/**
 * ~100-250ms per derivation on a Pi 4 and ~32 MiB of memory. Do not lower N
 * below 2**14 without accepting a materially cheaper offline guess against a
 * backup file that has left the device.
 */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = {
  N: 32768,
  r: 8,
  p: 1,
  keylen: 32,
};

/**
 * 128 * N * r is ~32 MiB at the defaults, which is exactly Node's default
 * `maxmem` ceiling — scrypt throws rather than rounding down. Give it real
 * headroom so a future bump in N doesn't fail at runtime instead of at review.
 */
const SCRYPT_MAXMEM = 128 * 1024 * 1024;

const SALT_BYTES = 16;
const IV_BYTES = 12;

/** Thrown when the GCM tag does not verify: wrong passphrase, or tampering. */
export class BadPassphraseError extends Error {
  constructor(message = 'Incorrect password for this backup') {
    super(message);
    this.name = 'BadPassphraseError';
  }
}

/** Thrown when the envelope itself is unusable (bad base64, absurd params). */
export class MalformedEnvelopeError extends Error {
  constructor(message = 'This backup file is damaged') {
    super(message);
    this.name = 'MalformedEnvelopeError';
  }
}

function deriveKey(passphrase: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      passphrase.normalize('NFKC'),
      salt,
      params.keylen,
      { N: params.N, r: params.r, p: params.p, maxmem: SCRYPT_MAXMEM },
      (err, key) => (err ? reject(err) : resolve(key as Buffer)),
    );
  });
}

/**
 * The authenticated header. Serialized field-by-field rather than with
 * JSON.stringify over an object literal so the byte string can never shift
 * with key ordering — a mismatch here surfaces as "wrong passphrase", which
 * would be a miserable bug to chase.
 */
function headerAad(params: ScryptParams, salt: string, iv: string): Buffer {
  return Buffer.from(
    ['scrypt', params.N, params.r, params.p, params.keylen, salt, iv].join('|'),
    'utf8',
  );
}

export async function encryptCredentials(
  payload: CredentialPayload,
  passphrase: string,
  params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Promise<EncryptedCredentialEnvelope> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSPHRASE_LENGTH} characters`);
  }

  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const saltB64 = salt.toString('base64');
  const ivB64 = iv.toString('base64');

  const key = await deriveKey(passphrase, salt, params);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(headerAad(params, saltB64, ivB64));

  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encrypted: true,
    kdf: 'scrypt',
    kdfParams: params,
    salt: saltB64,
    iv: ivB64,
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

/**
 * Guard the KDF parameters before spending memory on them: a bundle is
 * untrusted input, and N is a memory multiplier. 2**20 with r=8 would ask for
 * a gigabyte.
 */
function validateParams(params: ScryptParams): void {
  const okPowerOfTwo = Number.isInteger(params.N) && params.N > 1 && (params.N & (params.N - 1)) === 0;
  if (!okPowerOfTwo || params.N > 1 << 20) throw new MalformedEnvelopeError();
  if (!Number.isInteger(params.r) || params.r < 1 || params.r > 32) throw new MalformedEnvelopeError();
  if (!Number.isInteger(params.p) || params.p < 1 || params.p > 16) throw new MalformedEnvelopeError();
  if (params.keylen !== 32) throw new MalformedEnvelopeError();
  if (128 * params.N * params.r > SCRYPT_MAXMEM) throw new MalformedEnvelopeError();
}

export async function decryptCredentials(
  envelope: EncryptedCredentialEnvelope,
  passphrase: string,
): Promise<CredentialPayload> {
  validateParams(envelope.kdfParams);

  let salt: Buffer;
  let iv: Buffer;
  let tag: Buffer;
  let ciphertext: Buffer;
  try {
    salt = Buffer.from(envelope.salt, 'base64');
    iv = Buffer.from(envelope.iv, 'base64');
    tag = Buffer.from(envelope.tag, 'base64');
    ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  } catch {
    throw new MalformedEnvelopeError();
  }
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || tag.length !== 16) {
    throw new MalformedEnvelopeError();
  }

  const key = await deriveKey(passphrase, salt, envelope.kdfParams);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(headerAad(envelope.kdfParams, envelope.salt, envelope.iv));
  decipher.setAuthTag(tag);

  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // `final()` throws on tag mismatch — the only signal we get, and it does
    // not distinguish a wrong passphrase from a tampered header or body.
    throw new BadPassphraseError();
  }

  try {
    const parsed = JSON.parse(plaintext.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new MalformedEnvelopeError();
    }
    return parsed as CredentialPayload;
  } catch (err) {
    if (err instanceof MalformedEnvelopeError) throw err;
    throw new MalformedEnvelopeError();
  }
}
