import { randomBytes, createHash, timingSafeEqual } from "crypto";

/**
 * Generate a cryptographically secure 32-byte owner token (hex string).
 * Returned once to the client at upload time — never stored in plain form.
 */
export function generateOwnerToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Hash a raw owner token with SHA-256 for safe storage in the database.
 */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Constant-time comparison of a raw token against a stored hash.
 * Prevents timing attacks.
 */
export function verifyOwnerToken(rawToken: string, storedHash: string): boolean {
  try {
    const expected = Buffer.from(storedHash, "hex");
    const actual = Buffer.from(hashToken(rawToken), "hex");
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
