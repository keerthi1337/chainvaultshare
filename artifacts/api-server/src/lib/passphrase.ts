import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";

const SALT_LENGTH = 16; // bytes → 32 hex chars
const KEY_LENGTH = 32;  // bytes

/**
 * Hash a passphrase using scrypt with a random salt.
 * Returns "saltHex:hashHex" — safe to store in the database.
 */
export function hashPassphrase(passphrase: string): string {
  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const hash = scryptSync(passphrase, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verify a passphrase against a stored "salt:hash" string.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function verifyPassphrase(passphrase: string, stored: string): boolean {
  try {
    const [salt, expectedHash] = stored.split(":");
    if (!salt || !expectedHash) return false;
    const actualHash = scryptSync(passphrase, salt, KEY_LENGTH);
    const expected = Buffer.from(expectedHash, "hex");
    if (actualHash.length !== expected.length) return false;
    return timingSafeEqual(actualHash, expected);
  } catch {
    return false;
  }
}
