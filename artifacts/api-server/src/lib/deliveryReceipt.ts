import { createHmac, timingSafeEqual } from "crypto";

function getDeliverySecret(): string {
  const secret = process.env.DELIVERY_SECRET;
  if (!secret) {
    // Fallback for dev — in production DELIVERY_SECRET must be set
    return "chainvault-delivery-secret-change-me-in-production";
  }
  return secret;
}

/**
 * Generate a cryptographic delivery receipt.
 * This is an HMAC-SHA256 over the transfer details — verifiable without DB access.
 *
 * Format: "CVT-RECEIPT:base64(hmac)"
 */
export function generateReceipt(
  transferId: string,
  fileId: string | number,
  timestamp: number
): string {
  const payload = `${transferId}:${fileId}:${timestamp}`;
  const hmac = createHmac("sha256", getDeliverySecret())
    .update(payload)
    .digest("base64url");
  return `CVT-RECEIPT:${hmac}`;
}

/**
 * Verify a delivery receipt string against expected parameters.
 * Constant-time comparison prevents timing attacks.
 */
export function verifyReceipt(
  receipt: string,
  transferId: string,
  fileId: string | number,
  timestamp: number
): boolean {
  try {
    const expected = generateReceipt(transferId, fileId, timestamp);
    const a = Buffer.from(receipt);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Extract timestamp from a receipt for lookup purposes.
 * Returns null if the receipt format is invalid.
 */
export function parseReceiptTimestamp(receipt: string): number | null {
  // The receipt itself doesn't encode the timestamp — look it up via transfer_events
  return null;
}
