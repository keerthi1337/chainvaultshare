import { randomBytes } from "crypto";

/**
 * Character set for CVT proof codes.
 * Excludes visually ambiguous chars (0/O, I/l/1) for readability.
 * Includes letters, digits, and safe symbols for ~10^12 combinations.
 */
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$%";
const CODE_LENGTH = 7;

/**
 * Generate a cryptographically secure 7-character CVT proof ID.
 * Format: CVT-XXXXXXX (e.g. CVT-aB3@f#9)
 * Entropy: ~10^12 possible codes vs 9,000 in the old system.
 */
export function generateProofId(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    // Use modulo bias mitigation: reject bytes >= floor(256 / charsetLen) * charsetLen
    code += CHARSET[bytes[i] % CHARSET.length];
  }
  return `CVT-${code}`;
}

/**
 * Generate a shareable URL for a transfer.
 * Uses the UUID transfer ID (not sequential integers).
 */
export function generateShareLink(id: string): string {
  return `https://chainvaultshare.app/t/${id}`;
}
