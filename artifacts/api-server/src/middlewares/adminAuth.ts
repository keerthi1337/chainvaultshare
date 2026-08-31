import { Request, Response, NextFunction } from "express";
import { createHash, timingSafeEqual } from "crypto";

/** SHA-256 of ADMIN_SECRET — computed once at startup, never store raw secret */
const ADMIN_SECRET_HASH = (() => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    console.warn("[adminAuth] ADMIN_SECRET not set — admin routes will be disabled");
    return null;
  }
  return createHash("sha256").update(secret).digest("hex");
})();

/**
 * Middleware: require X-Admin-Secret header matching ADMIN_SECRET env var.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_SECRET_HASH) {
    res.status(503).json({ error: "Admin routes are not configured on this server." });
    return;
  }

  const provided = req.headers["x-admin-secret"] as string | undefined;
  if (!provided) {
    res.status(401).json({ error: "Admin authentication required." });
    return;
  }

  const providedHash = createHash("sha256").update(provided).digest("hex");
  const a = Buffer.from(providedHash);
  const b = Buffer.from(ADMIN_SECRET_HASH);

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(403).json({ error: "Invalid admin credentials." });
    return;
  }

  next();
}
