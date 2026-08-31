import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { db, transfersTable, transferFilesTable, storageObjectsTable } from "@workspace/db";
import { z } from "zod/v4";
import {
  CreateTransferBody,
  GetTransferParams,
  DeleteTransferParams,
  UpdateTransferProofParams,
  UpdateTransferProofBody,
  VerifyTransferBody,
  AddTransferFileBody,
  GetTransferFilesParams,
  UpdateTransferExpirationParams,
  UpdateTransferExpirationBody,
} from "@workspace/api-zod";
import { generateOwnerToken, hashToken } from "../lib/ownerToken";
import { generateProofId, generateShareLink } from "../lib/proofId";
import { hashPassphrase } from "../lib/passphrase";
import { codeAccessLimiter, uploadLimiter } from "../middlewares/rateLimiter";
import { requireOwner } from "../middlewares/ownerAuth";
import { sseRegistry } from "../lib/sse";

const router: IRouter = Router();

const CreateTransferExtended = z.object({
  name: z.string(),
  itemType: z.enum(["file", "folder", "multiple"]),
  fileCount: z.number(),
  totalSize: z.number(),
  expiresAt: z.string(),
  ownerAddress: z.string().optional(),
  ghostMode: z.boolean().optional(),
  passphrase: z.string().optional(),
  isP2p: z.boolean().optional().default(false),
});

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isExpired(transfer: { expiresAt: Date }): boolean {
  return new Date() > new Date(transfer.expiresAt);
}

// ---------------------------------------------------------------------------
// SSE — GET /transfers/:id/progress — real-time upload progress stream
// ---------------------------------------------------------------------------
router.get("/transfers/:id/progress", (req: Request, res: Response): void => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    res.status(400).json({ error: "Transfer ID required" });
    return;
  }
  // Register this response as the SSE client for this transfer
  sseRegistry.register(id, res);
});

// ---------------------------------------------------------------------------
// GET /transfers/recent — last 5 transfers owned by caller
// ---------------------------------------------------------------------------
router.get("/transfers/recent", async (req: Request, res: Response): Promise<void> => {
  const rawToken = req.headers["x-owner-token"];

  if (!rawToken || typeof rawToken !== "string") {
    res.json([]);
    return;
  }

  const hashedToken = hashToken(rawToken);

  // Only return transfers matching this owner token
  const transfers = await db
    .select()
    .from(transfersTable)
    .where(eq(transfersTable.ownerToken, hashedToken))
    .orderBy(desc(transfersTable.createdAt))
    .limit(5);

  // Strip ownerToken from response
  res.json(transfers.map(({ ownerToken: _ot, ...t }) => t));
});

// ---------------------------------------------------------------------------
// GET /transfers/by-code/:proofId — look up by CVT code (rate limited)
// ---------------------------------------------------------------------------
router.get("/transfers/by-code/:proofId", codeAccessLimiter, async (req: Request, res: Response): Promise<void> => {
  const rawProofId = req.params.proofId;
  const proofId = (Array.isArray(rawProofId) ? rawProofId[0] : (rawProofId ?? "")).trim();
  if (!proofId) {
    res.status(400).json({ error: "proofId is required" });
    return;
  }

  const [transfer] = await db
    .select()
    .from(transfersTable)
    .where(eq(transfersTable.proofId, proofId));

  if (!transfer) {
    res.status(404).json({ error: "No transfer found for that code" });
    return;
  }

  if (isExpired(transfer)) {
    res.status(404).json({ error: "This transfer has expired" });
    return;
  }

  // Return only non-sensitive fields to unauthenticated callers
  const { ownerToken: _ot, proofHash: _ph, txRef: _tx, storageRef: _sr, ...publicFields } = transfer;
  res.json(publicFields);
});

// ---------------------------------------------------------------------------
// GET /transfers — list all transfers for this owner token only
// ---------------------------------------------------------------------------
router.get("/transfers", async (req: Request, res: Response): Promise<void> => {
  const rawToken = req.headers["x-owner-token"];

  if (!rawToken || typeof rawToken !== "string") {
    // Return empty list — never leak all transfers to anonymous callers
    res.json([]);
    return;
  }

  const hashedToken = hashToken(rawToken);

  const transfers = await db
    .select()
    .from(transfersTable)
    .where(eq(transfersTable.ownerToken, hashedToken))
    .orderBy(desc(transfersTable.createdAt));

  res.json(transfers.map(({ ownerToken: _ot, ...t }) => t));
});

// ---------------------------------------------------------------------------
// POST /transfers — create (upload rate limited)
// ---------------------------------------------------------------------------
router.post("/transfers", uploadLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateTransferExtended.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, itemType, fileCount, totalSize, ownerAddress, expiresAt: customExpiresAt, ghostMode, passphrase, isP2p } = parsed.data;

  // Generate cryptographically secure IDs
  const proofId = generateProofId();
  const rawOwnerToken = generateOwnerToken();
  const hashedOwnerToken = hashToken(rawOwnerToken);
  const expiresAt = customExpiresAt ? new Date(customExpiresAt) : new Date(Date.now() + SEVEN_DAYS_MS);
  const passphraseHash = passphrase ? hashPassphrase(passphrase) : null;

  const [transfer] = await db
    .insert(transfersTable)
    .values({
      name,
      itemType,
      fileCount,
      totalSize,
      ownerAddress: ownerAddress ?? null,
      proofId,
      shareLink: "pending",
      status: "preparing",
      expiresAt,
      ownerToken: hashedOwnerToken,
      ghostMode: !!ghostMode,
      isP2p: !!isP2p,
      passphraseHash,
    })
    .returning();

  // Update with real share link using the UUID
  const shareLink = generateShareLink(transfer.id);
  const [updated] = await db
    .update(transfersTable)
    .set({ shareLink })
    .where(eq(transfersTable.id, transfer.id))
    .returning();

  // Emit initial SSE progress
  sseRegistry.emitProgress(transfer.id, 0, "Transfer created");

  // Return the raw token ONCE — client must store it
  res.status(201).json({
    ...updated,
    ownerToken: rawOwnerToken, // plain token — never stored, returned once
  });
});

// ---------------------------------------------------------------------------
// GET /transfers/:id — get one (owner only)
// ---------------------------------------------------------------------------
router.get("/transfers/:id", requireOwner, async (req: Request, res: Response): Promise<void> => {
  const params = GetTransferParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [transfer] = await db
    .select()
    .from(transfersTable)
    .where(eq(transfersTable.id, params.data.id));

  if (!transfer) {
    res.status(404).json({ error: "Transfer not found" });
    return;
  }

  const { ownerToken: _ot, ...safeTransfer } = transfer;
  res.json(safeTransfer);
});

// ---------------------------------------------------------------------------
// DELETE /transfers/:id (owner only)
// ---------------------------------------------------------------------------
router.delete("/transfers/:id", requireOwner, async (req: Request, res: Response): Promise<void> => {
  const params = DeleteTransferParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(transfersTable)
    .where(eq(transfersTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Transfer not found" });
    return;
  }

  res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// PATCH /transfers/:id/proof — update proof data (owner only)
// ---------------------------------------------------------------------------
router.patch("/transfers/:id/proof", requireOwner, async (req: Request, res: Response): Promise<void> => {
  const params = UpdateTransferProofParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTransferProofBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { ...parsed.data };

  if (parsed.data.status === "verified") {
    updateData.verifiedAt = new Date();
  }

  // Emit SSE progress event for securing phase
  sseRegistry.emitProgress(params.data.id, 95, "Recording proof...");

  const [updated] = await db
    .update(transfersTable)
    .set(updateData)
    .where(eq(transfersTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Transfer not found" });
    return;
  }

  // Emit final done event
  if (parsed.data.status === "verified") {
    sseRegistry.emitDone(params.data.id, "done");
  }

  const { ownerToken: _ot, ...safeTransfer } = updated;
  res.json(safeTransfer);
});

// ---------------------------------------------------------------------------
// PATCH /transfers/:id/expiration — update expiration (owner only)
// ---------------------------------------------------------------------------
router.patch("/transfers/:id/expiration", requireOwner, async (req: Request, res: Response): Promise<void> => {
  const params = UpdateTransferExpirationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTransferExpirationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(transfersTable)
    .set({ expiresAt: parsed.data.expiresAt })
    .where(eq(transfersTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Transfer not found" });
    return;
  }

  const { ownerToken: _ot, ...safeTransfer } = updated;
  res.json(safeTransfer);
});

// ---------------------------------------------------------------------------
// POST /verify — verify a transfer by link or proof ID (rate limited)
// ---------------------------------------------------------------------------
router.post("/verify", codeAccessLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = VerifyTransferBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const query = (parsed.data.query ?? "").trim();

  if (!query) {
    res.status(400).json({ error: "Query is required" });
    return;
  }

  let transfer = null;

  // Match CVT-XXXXXXX proof ID
  const proofIdMatch = query.match(/CVT-[A-Za-z0-9@#$%]{7}/i);
  if (proofIdMatch) {
    const [found] = await db
      .select()
      .from(transfersTable)
      .where(eq(transfersTable.proofId, proofIdMatch[0]));
    transfer = found ?? null;
  }

  // Match share link with /t/:uuid
  if (!transfer) {
    const linkMatch = query.match(/\/t\/([0-9a-f-]{36})/i);
    if (linkMatch) {
      const [found] = await db
        .select()
        .from(transfersTable)
        .where(eq(transfersTable.id, linkMatch[1]));
      transfer = found ?? null;
    }
  }

  if (!transfer) {
    res.json({
      verified: false,
      expired: false,
      message: "No transfer record found for this code or link.",
      transfer: null,
    });
    return;
  }

  if (isExpired(transfer)) {
    res.json({
      verified: false,
      expired: true,
      message: "This transfer expired and is no longer accessible.",
      transfer: null, // don't leak data on expired transfers
    });
    return;
  }

  const isVerified = transfer.status === "verified";
  const { ownerToken: _ot, ...publicTransfer } = transfer;

  res.json({
    verified: isVerified,
    expired: false,
    message: isVerified
      ? "Transfer verified. Files are ready to download."
      : `Transfer found. Status: ${transfer.status}.`,
    transfer: publicTransfer,
  });
});

// ---------------------------------------------------------------------------
// GET /transfers/:id/files — list files for a transfer (public, expiry checked)
// ---------------------------------------------------------------------------
router.get("/transfers/:id/files", async (req: Request, res: Response): Promise<void> => {
  const params = GetTransferFilesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Check expiry before returning file list
  const [transfer] = await db
    .select({ expiresAt: transfersTable.expiresAt })
    .from(transfersTable)
    .where(eq(transfersTable.id, params.data.id));

  if (!transfer) {
    res.status(404).json({ error: "Transfer not found" });
    return;
  }

  if (isExpired(transfer)) {
    res.status(410).json({ error: "This transfer has expired and files have been deleted." });
    return;
  }

  const files = await db
    .select()
    .from(transferFilesTable)
    .where(eq(transferFilesTable.transferId, params.data.id))
    .orderBy(transferFilesTable.createdAt);

  res.json(files);
});

// ---------------------------------------------------------------------------
// POST /transfers/:id/files — record an uploaded file (owner only)
// ---------------------------------------------------------------------------
router.post("/transfers/:id/files", requireOwner, async (req: Request, res: Response): Promise<void> => {
  const params = GetTransferFilesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AddTransferFileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [transfer] = await db
    .select()
    .from(transfersTable)
    .where(eq(transfersTable.id, params.data.id));

  if (!transfer) {
    res.status(404).json({ error: "Transfer not found" });
    return;
  }

  if (isExpired(transfer)) {
    res.status(410).json({ error: "This transfer has expired" });
    return;
  }

  const [file] = await db
    .insert(transferFilesTable)
    .values({
      transferId: params.data.id,
      name: parsed.data.name,
      size: parsed.data.size,
      contentType: parsed.data.contentType,
      objectPath: parsed.data.objectPath,
    })
    .returning();

  // Update transfer totals
  await db
    .update(transfersTable)
    .set({
      fileCount: sql`${transfersTable.fileCount} + 1`,
      totalSize: sql`${transfersTable.totalSize} + ${parsed.data.size}`,
    })
    .where(eq(transfersTable.id, params.data.id));

  // Associate storage_objects row with this transferId for cleanup
  const objectId = parsed.data.objectPath.split("/").pop();
  if (objectId) {
    await db
      .update(storageObjectsTable)
      .set({ transferId: params.data.id })
      .where(eq(storageObjectsTable.id, objectId));
  }

  res.status(201).json(file);
});

// ---------------------------------------------------------------------------
// GET /stats — aggregate summary (public, no per-user data leaked)
// ---------------------------------------------------------------------------
router.get("/stats", async (req: Request, res: Response): Promise<void> => {
  const [totals] = await db
    .select({
      totalTransfers: sql<number>`count(*)::int`,
      verifiedTransfers: sql<number>`count(*) filter (where status = 'verified')::int`,
      totalFilesTransferred: sql<number>`coalesce(sum(file_count), 0)::int`,
      totalBytesTransferred: sql<number>`coalesce(sum(total_size), 0)::int`,
    })
    .from(transfersTable);

  res.json({
    totalTransfers: totals.totalTransfers ?? 0,
    verifiedTransfers: totals.verifiedTransfers ?? 0,
    totalFilesTransferred: totals.totalFilesTransferred ?? 0,
    totalBytesTransferred: totals.totalBytesTransferred ?? 0,
    recentActivity: [],
  });
});

export default router;
