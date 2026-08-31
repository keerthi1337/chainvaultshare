import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { db, transfersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyPassphrase } from "../lib/passphrase";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import rateLimit from "express-rate-limit";

const router: IRouter = Router();

/** 5 unlock attempts per minute per IP — brute-force protection */
const unlockLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many unlock attempts. Please wait 1 minute." },
});

const DOWNLOAD_TOKEN_SECRET = process.env.DELIVERY_SECRET ?? "cvs-download-token-secret";
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Generate a short-lived signed download token.
 * Format: "expiry:HMAC-SHA256(transferId:expiry)"
 */
function generateDownloadToken(transferId: string): string {
  const expiry = Date.now() + TOKEN_TTL_MS;
  const payload = `${transferId}:${expiry}`;
  const sig = createHmac("sha256", DOWNLOAD_TOKEN_SECRET).update(payload).digest("base64url");
  return `${expiry}.${sig}`;
}

/**
 * Verify a download token. Returns true if valid and not expired.
 */
export function verifyDownloadToken(transferId: string, token: string): boolean {
  try {
    const [expiryStr, sig] = token.split(".");
    if (!expiryStr || !sig) return false;
    const expiry = parseInt(expiryStr, 10);
    if (Date.now() > expiry) return false;
    const payload = `${transferId}:${expiry}`;
    const expected = createHmac("sha256", DOWNLOAD_TOKEN_SECRET).update(payload).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Synchronous download token verification (no async needed since it's pure crypto)
 */
export function verifyDownloadTokenSync(transferId: string, token: string): boolean {
  try {
    const dotIdx = token.indexOf(".");
    if (dotIdx === -1) return false;
    const expiryStr = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry) || Date.now() > expiry) return false;
    const payload = `${transferId}:${expiry}`;
    const expected = createHmac("sha256", DOWNLOAD_TOKEN_SECRET).update(payload).digest("base64url");
    // Pad to equal length for timingSafeEqual
    const a = Buffer.from(sig.padEnd(expected.length));
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    const { timingSafeEqual } = require("crypto") as typeof import("crypto");
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const UnlockBody = z.object({ passphrase: z.string().min(1).max(256) });
const DownloadTokenQuery = z.object({ downloadToken: z.string().optional() });

/**
 * POST /transfers/:id/unlock
 * Verify passphrase and return a short-lived download token.
 */
router.post("/transfers/:id/unlock", unlockLimiter, async (req: Request, res: Response) => {
  const parsed = UnlockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Passphrase required." });
    return;
  }

  const rawId = req.params.id;
  const transferId = Array.isArray(rawId) ? rawId[0] : rawId;

  try {
    const transfer = await db.query.transfersTable.findFirst({
      where: eq(transfersTable.id, transferId),
      columns: { id: true, passphraseHash: true, expiresAt: true },
    });

    if (!transfer) {
      res.status(404).json({ error: "Transfer not found." });
      return;
    }

    if (new Date() > new Date(transfer.expiresAt)) {
      res.status(410).json({ error: "This transfer has expired." });
      return;
    }

    if (!transfer.passphraseHash) {
      // No passphrase set — grant access freely
      res.json({ downloadToken: generateDownloadToken(transfer.id) });
      return;
    }

    const valid = verifyPassphrase(parsed.data.passphrase, transfer.passphraseHash);
    if (!valid) {
      // Add a small delay to further slow brute force even with rate limiter
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 200));
      res.status(401).json({ error: "Incorrect passphrase. Please try again." });
      return;
    }

    res.json({ downloadToken: generateDownloadToken(transfer.id) });
  } catch (err) {
    console.error("[unlock]", err);
    res.status(500).json({ error: "Failed to verify passphrase." });
  }
});

export default router;
