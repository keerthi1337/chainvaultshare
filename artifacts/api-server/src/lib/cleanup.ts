import { db, transfersTable, transferFilesTable, storageObjectsTable } from "@workspace/db";
import { lt, eq, inArray } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Delete all transfers that have passed their expiration date,
 * along with their associated files and storage objects (binary data).
 *
 * Called by node-cron every 15 minutes.
 */
export async function runCleanup(): Promise<void> {
  try {
    const now = new Date();

    // Find expired transfers
    const expired = await db
      .select({ id: transfersTable.id })
      .from(transfersTable)
      .where(lt(transfersTable.expiresAt, now));

    if (expired.length === 0) {
      logger.info("Cleanup: no expired transfers found");
      return;
    }

    const expiredIds = expired.map((t) => t.id);
    logger.info({ count: expiredIds.length }, "Cleanup: deleting expired transfers");

    // Delete associated storage objects (binary file data)
    await db
      .delete(storageObjectsTable)
      .where(inArray(storageObjectsTable.transferId, expiredIds));

    // Delete transfers (transfer_files cascade automatically via FK)
    const deleted = await db
      .delete(transfersTable)
      .where(inArray(transfersTable.id, expiredIds))
      .returning({ id: transfersTable.id });

    logger.info({ deleted: deleted.length }, "Cleanup: expired transfers permanently deleted");
  } catch (err) {
    logger.error({ err }, "Cleanup: error during expiration cleanup");
  }
}
