import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { db, transferEventsTable, transfersTable } from "@workspace/db";
import { desc, eq, sql, and, gte } from "drizzle-orm";
import { requireAdmin } from "../middlewares/adminAuth";
import { verifyReceipt } from "../lib/deliveryReceipt";

const router: IRouter = Router();

// In-memory SSE registry for live event stream
const adminSseClients: Set<Response> = new Set();

/** Push a new event to all connected admin SSE clients */
export function pushAdminEvent(event: Record<string, unknown>): void {
  const data = JSON.stringify(event);
  for (const client of adminSseClients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch {
      adminSseClients.delete(client);
    }
  }
}

/**
 * GET /admin/events/stream
 * Live SSE feed of all download events (admin only).
 */
router.get("/admin/events/stream", requireAdmin, (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send a heartbeat every 30s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 30_000);

  adminSseClients.add(res);
  res.write(`data: ${JSON.stringify({ type: "connected", clients: adminSseClients.size })}\n\n`);

  req.on("close", () => {
    clearInterval(heartbeat);
    adminSseClients.delete(res);
  });
});

/**
 * GET /admin/events
 * Paginated event list with optional date filter.
 */
router.get("/admin/events", requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;
    const since = req.query.since ? new Date(req.query.since as string) : undefined;

    const conditions = since ? [gte(transferEventsTable.createdAt, since)] : [];

    const events = await db
      .select()
      .from(transferEventsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(transferEventsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(events);
  } catch (err) {
    console.error("[admin/events]", err);
    res.status(500).json({ error: "Failed to fetch events." });
  }
});

/**
 * GET /admin/stats
 * Aggregate analytics: downloads per country, device type breakdown, daily totals.
 */
router.get("/admin/stats", requireAdmin, async (req: Request, res: Response) => {
  try {
    const [byCountry, byDevice, totalRow, todayRow] = await Promise.all([
      // Downloads grouped by country
      db
        .select({
          country: transferEventsTable.country,
          count: sql<number>`count(*)::int`,
        })
        .from(transferEventsTable)
        .where(eq(transferEventsTable.eventType, "download"))
        .groupBy(transferEventsTable.country)
        .orderBy(desc(sql`count(*)`))
        .limit(50),

      // Downloads grouped by device type
      db
        .select({
          deviceType: transferEventsTable.deviceType,
          count: sql<number>`count(*)::int`,
        })
        .from(transferEventsTable)
        .where(eq(transferEventsTable.eventType, "download"))
        .groupBy(transferEventsTable.deviceType),

      // Total downloads all time
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(transferEventsTable)
        .where(eq(transferEventsTable.eventType, "download")),

      // Downloads today
      db
        .select({ today: sql<number>`count(*)::int` })
        .from(transferEventsTable)
        .where(
          and(
            eq(transferEventsTable.eventType, "download"),
            gte(transferEventsTable.createdAt, new Date(new Date().setHours(0, 0, 0, 0)))
          )
        ),
    ]);

    res.json({
      total: totalRow[0]?.total ?? 0,
      today: todayRow[0]?.today ?? 0,
      byCountry,
      byDevice,
    });
  } catch (err) {
    console.error("[admin/stats]", err);
    res.status(500).json({ error: "Failed to fetch stats." });
  }
});

/**
 * POST /admin/verify-receipt
 * Verify a delivery receipt code.
 */
const VerifyReceiptBody = z.object({
  receipt: z.string().min(1),
  transferId: z.string().min(1),
  fileId: z.number().int(),
  timestamp: z.number().int(),
});

router.post("/admin/verify-receipt", requireAdmin, async (req: Request, res: Response) => {
  const parsed = VerifyReceiptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body." });
    return;
  }

  const { receipt, transferId, fileId, timestamp } = parsed.data;
  const valid = verifyReceipt(receipt, transferId, fileId, timestamp);

  if (!valid) {
    res.json({ valid: false, message: "Receipt is invalid or has been tampered with." });
    return;
  }

  // Also look up in DB to get extra context
  try {
    const events = await db
      .select()
      .from(transferEventsTable)
      .where(eq(transferEventsTable.receiptHash, receipt))
      .limit(1);

    const event = events[0];
    res.json({
      valid: true,
      message: "Receipt is cryptographically valid.",
      event: event
        ? {
            transferId: event.transferId,
            fileId: event.fileId,
            country: event.country,
            deviceType: event.deviceType,
            downloadedAt: event.createdAt,
          }
        : null,
    });
  } catch {
    res.json({ valid: true, message: "Receipt is cryptographically valid.", event: null });
  }
});

export default router;
