import type { Request, Response, NextFunction, RequestHandler } from "express";
import { db, transfersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyOwnerToken } from "../lib/ownerToken";

/**
 * Owner authentication middleware.
 *
 * Reads the `X-Owner-Token` header from the request.
 * Looks up the transfer by `req.params.id`, verifies the token hash.
 * Rejects with 403 if the token is missing or doesn't match.
 *
 * Usage: router.delete("/transfers/:id", requireOwner, handler)
 */
export const requireOwner: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const rawToken = req.headers["x-owner-token"];
  const rawTransferId = req.params.id;
  const transferId = Array.isArray(rawTransferId) ? rawTransferId[0] : rawTransferId;

  if (!rawToken || typeof rawToken !== "string" || !transferId) {
    res.status(403).json({ error: "Access denied. Owner token required." });
    return;
  }

  const [transfer] = await db
    .select({ id: transfersTable.id, ownerToken: transfersTable.ownerToken })
    .from(transfersTable)
    .where(eq(transfersTable.id, transferId));

  if (!transfer) {
    res.status(404).json({ error: "Transfer not found." });
    return;
  }

  if (!transfer.ownerToken || !verifyOwnerToken(rawToken, transfer.ownerToken)) {
    res.status(403).json({ error: "Access denied. Invalid owner token." });
    return;
  }

  next();
};
