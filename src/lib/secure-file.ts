import fs from 'fs/promises';

/**
 * Write a file and restrict permissions to owner-only (0600).
 * Use for files containing secrets: auth.json, secrets.json, google-tokens.json, etc.
 */
export async function writeSecureFile(filePath: string, data: string): Promise<void> {
  await fs.writeFile(filePath, data, 'utf-8');
  await fs.chmod(filePath, 0o600);
}
