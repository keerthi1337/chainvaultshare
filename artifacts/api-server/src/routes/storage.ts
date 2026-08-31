import { Router, type IRouter, type Request, type Response } from "express";
import { RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { db, storageObjectsTable, transfersTable, transferFilesTable, transferEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { requireOwner } from "../middlewares/ownerAuth";
import { uploadLimiter } from "../middlewares/rateLimiter";
import { sseRegistry } from "../lib/sse";
import { generateReceipt } from "../lib/deliveryReceipt";
import { getCountryFromIp, getDeviceType, hashIp, getRealIp } from "../lib/geoip";
import { verifyDownloadTokenSync } from "./passphrase";
import { pushAdminEvent } from "./analytics";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

export const activeRelays = new Map<string, {
  receiverRes: Response;
  resolve: () => void;
  reject: (err: any) => void;
}>();

// Maximum file size: 2 GB
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

// MIME types that should never be served inline (could execute in browser)
const DANGEROUS_MIME_TYPES = new Set([
  "text/html",
  "text/javascript",
  "application/javascript",
  "application/x-javascript",
  "text/xml",
  "application/xml",
  "image/svg+xml",
  "application/xhtml+xml",
]);

function safeMimeType(detected: string | undefined, declared: string): string {
  const mime = detected ?? declared;
  if (DANGEROUS_MIME_TYPES.has(mime.toLowerCase())) return "application/octet-stream";
  return mime;
}

/**
 * Record a download event and push to admin SSE feed.
 * Ghost mode transfers: event is NOT recorded.
 */
async function recordDownloadEvent(
  transferId: string | null,
  fileId: string | number | null,
  receipt: string,
  req: Request,
  ghostMode: boolean
): Promise<void> {
  if (ghostMode) return; // ghost mode: no trace

  const ip = getRealIp(req as any);
  const country = getCountryFromIp(ip);
  const deviceType = getDeviceType(req.headers["user-agent"] as string);
  const ipHash = hashIp(ip);
  const numericFileId = typeof fileId === "number" ? fileId : parseInt(String(fileId), 10);
  const finalFileId = isNaN(numericFileId) ? null : numericFileId;

  try {
    await db.insert(transferEventsTable).values({
      transferId,
      fileId: finalFileId,
      eventType: "download",
      country,
      deviceType,
      ipHash,
      receiptHash: receipt,
    });

    // Push to admin live feed
    pushAdminEvent({
      type: "download",
      transferId,
      fileId: finalFileId,
      country,
      deviceType,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Non-critical — don't fail the download if event recording fails
    console.error("[recordDownloadEvent]", err);
  }
}

/**
 * POST /storage/uploads/request-url
 * Request an upload handle. Returns endpoint + object path.
 */
router.post("/storage/uploads/request-url", uploadLimiter, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    if (size > MAX_FILE_SIZE) {
      res.status(413).json({
        error: `File too large. Maximum allowed size is 2 GB (received ${Math.round(size / 1024 / 1024)} MB).`,
      });
      return;
    }

    const uploadURL = await objectStorageService.getObjectEntityUploadURL(name, size, contentType);
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(RequestUploadUrlResponse.parse({ uploadURL, objectPath, metadata: { name, size, contentType } }));
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * PUT /storage/upload-file/:objectId
 * Receives raw binary stream and writes to database.
 * Enforces Content-Length limit and mid-stream byte counting.
 */
router.put("/storage/upload-file/:objectId", async (req: Request, res: Response) => {
  const objectId = Array.isArray(req.params.objectId) ? req.params.objectId[0] : (req.params.objectId ?? "");

  // Check if an active P2P relay is waiting for this object stream
  const relay = activeRelays.get(objectId);
  if (relay) {
    req.pipe(relay.receiverRes, { end: true });
    await new Promise<void>((resolve, reject) => {
      req.on("end", () => {
        relay.resolve();
        resolve();
      });
      req.on("error", (err) => {
        relay.reject(err);
        reject(err);
      });
    });
    res.status(200).json({ success: true, relayed: true });
    return;
  }

  const contentLengthHeader = req.headers["content-length"];
  if (contentLengthHeader) {
    const contentLength = parseInt(contentLengthHeader, 10);
    if (isNaN(contentLength) || contentLength > MAX_FILE_SIZE) {
      res.status(413).json({ error: "File too large. Maximum allowed size is 2 GB." });
      return;
    }
  }

  try {
    const chunks: Buffer[] = [];
    let totalBytesRead = 0;

    for await (const chunk of req) {
      totalBytesRead += (chunk as Buffer).length;
      if (totalBytesRead > MAX_FILE_SIZE) {
        res.status(413).json({ error: "File upload exceeded 2 GB limit. Upload aborted." });
        return;
      }
      chunks.push(chunk as Buffer);
    }

    const fileBuffer = Buffer.concat(chunks);

    // Server-side MIME type detection
    const sniffedType = await fileTypeFromBuffer(fileBuffer.slice(0, 4096));
    const detectedMime = sniffedType?.mime;

    const [storageObj] = await db
      .select({ id: storageObjectsTable.id, contentType: storageObjectsTable.contentType })
      .from(storageObjectsTable)
      .where(eq(storageObjectsTable.id, objectId));

    if (!storageObj) {
      res.status(404).json({ error: "Storage object not found" });
      return;
    }

    const finalMime = safeMimeType(detectedMime, storageObj.contentType);

    const [updated] = await db
      .update(storageObjectsTable)
      .set({ data: fileBuffer, contentType: finalMime })
      .where(eq(storageObjectsTable.id, objectId))
      .returning({ id: storageObjectsTable.id, transferId: storageObjectsTable.transferId });

    if (!updated) {
      res.status(404).json({ error: "Storage object not found" });
      return;
    }

    if (updated.transferId) {
      sseRegistry.emitProgress(updated.transferId, 80, "File uploaded securely");
    }

    res.status(200).json({ success: true, mimeType: finalMime });
  } catch (error) {
    req.log.error({ err: error }, "Error uploading file binary");
    res.status(500).json({ error: "Failed to upload file binary" });
  }
});

/**
 * GET /storage/public-objects/*filePath
 * Serve files via CVT code / share link.
 * Checks passphrase token if required, enforces expiry, records download event, generates receipt.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${filePath}`;
    const objectId = filePath.split("/").pop() ?? filePath;

    // Check if this object belongs to a P2P transfer
    const [storageObj] = await db
      .select()
      .from(storageObjectsTable)
      .where(eq(storageObjectsTable.id, objectId));

    let transferId = storageObj?.transferId;
    if (!transferId) {
      const [tf] = await db
        .select({ transferId: transferFilesTable.transferId })
        .from(transferFilesTable)
        .where(eq(transferFilesTable.objectPath, objectPath));
      transferId = tf?.transferId;
    }

    if (transferId) {
      const [transfer] = await db
        .select({
          id: transfersTable.id,
          expiresAt: transfersTable.expiresAt,
          ghostMode: transfersTable.ghostMode,
          passphraseHash: transfersTable.passphraseHash,
          e2eEncrypted: transfersTable.e2eEncrypted,
          isP2p: transfersTable.isP2p,
        })
        .from(transfersTable)
        .where(eq(transfersTable.id, transferId));

      if (transfer?.isP2p) {
        if (new Date() > new Date(transfer.expiresAt)) {
          res.status(410).json({ error: "This transfer has expired. Files have been permanently deleted." });
          return;
        }

        // Check if uploader is online via SSE
        if (!sseRegistry.hasClient(transfer.id)) {
          res.status(503).json({
            error: "Uploader is offline. Peer-to-peer transfers require the uploader to keep their page open.",
            code: "UPLOADER_OFFLINE",
          });
          return;
        }

        // Check passphrase token if protected
        if (transfer.passphraseHash) {
          const downloadToken = req.headers["x-download-token"] as string | undefined;
          if (!downloadToken || !verifyDownloadTokenSync(transfer.id, downloadToken)) {
            res.status(401).json({
              error: "This transfer is passphrase-protected. Unlock it first.",
              requiresPassphrase: true,
            });
            return;
          }
        }

        // Headers for live streaming download
        const fileName = storageObj?.name || "file";
        const contentType = storageObj?.contentType || "application/octet-stream";
        const size = storageObj?.size;

        res.setHeader("Content-Type", contentType);
        if (size) res.setHeader("Content-Length", size.toString());
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.setHeader("Cache-Control", "no-cache, no-store");
        res.setHeader("X-Is-P2P", "true");
        if (transfer.e2eEncrypted) {
          res.setHeader("X-E2E-Encrypted", "true");
        }

        const timestamp = Date.now();
        const receipt = generateReceipt(transfer.id, 0, timestamp);
        res.setHeader("X-Delivery-Receipt", receipt);
        res.setHeader("X-Delivery-Timestamp", timestamp.toString());

        await recordDownloadEvent(transfer.id, null, receipt, req, transfer.ghostMode);

        // Notify uploader via SSE
        sseRegistry.emitP2pRequest(transfer.id, objectId, objectPath);

        // Wait for uploader to push chunks via PUT /storage/upload-file/:objectId
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            activeRelays.delete(objectId);
            if (!res.headersSent) {
              res.status(504).json({ error: "P2P relay timed out waiting for sender." });
            } else {
              res.end();
            }
            resolve();
          }, 60000);

          activeRelays.set(objectId, {
            receiverRes: res,
            resolve: () => {
              clearTimeout(timeout);
              activeRelays.delete(objectId);
              resolve();
            },
            reject: (err) => {
              clearTimeout(timeout);
              activeRelays.delete(objectId);
              reject(err);
            },
          });

          req.on("close", () => {
            clearTimeout(timeout);
            activeRelays.delete(objectId);
            resolve();
          });
        });
        return;
      }
    }

    const fileRecord = await objectStorageService.getObjectEntityFile(objectPath);

    if (!fileRecord.data) {
      res.status(404).json({ error: "File data not uploaded yet" });
      return;
    }

    // Check parent transfer: expiry, ghost mode, passphrase requirement
    let ghostMode = false;
    let e2eEncrypted = false;

    if (fileRecord.transferId) {
      const [transfer] = await db
        .select({
          expiresAt: transfersTable.expiresAt,
          ghostMode: transfersTable.ghostMode,
          passphraseHash: transfersTable.passphraseHash,
          e2eEncrypted: transfersTable.e2eEncrypted,
        })
        .from(transfersTable)
        .where(eq(transfersTable.id, fileRecord.transferId));

      if (!transfer) {
        res.status(404).json({ error: "Transfer not found" });
        return;
      }

      if (new Date() > new Date(transfer.expiresAt)) {
        res.status(410).json({ error: "This transfer has expired. Files have been permanently deleted." });
        return;
      }

      ghostMode = transfer.ghostMode;
      e2eEncrypted = transfer.e2eEncrypted;

      // If passphrase protected, verify download token
      if (transfer.passphraseHash) {
        const downloadToken = req.headers["x-download-token"] as string | undefined;
        if (!downloadToken || !verifyDownloadTokenSync(fileRecord.transferId, downloadToken)) {
          res.status(401).json({
            error: "This transfer is passphrase-protected. Unlock it first.",
            requiresPassphrase: true,
          });
          return;
        }
      }
    }

    // Server-side MIME detection (skip for E2E encrypted — content is ciphertext)
    let finalMime = "application/octet-stream";
    if (!e2eEncrypted) {
      const sniffedType = await fileTypeFromBuffer(fileRecord.data.slice(0, 4096));
      finalMime = safeMimeType(sniffedType?.mime, fileRecord.contentType);
    }

    // Generate delivery receipt
    const timestamp = Date.now();
    const fileId = fileRecord.id ?? 0;
    const receipt = generateReceipt(fileRecord.transferId ?? "unknown", fileId, timestamp);

    // Record the download event (skipped for ghost mode)
    await recordDownloadEvent(fileRecord.transferId ?? null, fileId, receipt, req, ghostMode);

    // Security headers
    res.setHeader("Content-Type", finalMime);
    res.setHeader("Content-Length", fileRecord.size.toString());
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileRecord.name)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Delivery-Receipt", receipt);
    res.setHeader("X-Delivery-Timestamp", timestamp.toString());
    if (e2eEncrypted) {
      res.setHeader("X-E2E-Encrypted", "true"); // hint to client to decrypt in browser
    }

    res.end(fileRecord.data);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*path
 * Serve private objects — requires owner token.
 */
router.get("/storage/objects/*path", requireOwner, async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const fileRecord = await objectStorageService.getObjectEntityFile(objectPath);

    if (!fileRecord.data) {
      res.status(404).json({ error: "File data not uploaded yet" });
      return;
    }

    if (fileRecord.transferId) {
      const [transfer] = await db
        .select({ expiresAt: transfersTable.expiresAt, ghostMode: transfersTable.ghostMode })
        .from(transfersTable)
        .where(eq(transfersTable.id, fileRecord.transferId));

      if (transfer && new Date() > new Date(transfer.expiresAt)) {
        res.status(410).json({ error: "This transfer has expired and files have been deleted." });
        return;
      }
    }

    const sniffedType = await fileTypeFromBuffer(fileRecord.data.slice(0, 4096));
    const finalMime = safeMimeType(sniffedType?.mime, fileRecord.contentType);

    res.setHeader("Content-Type", finalMime);
    res.setHeader("Content-Length", fileRecord.size.toString());
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileRecord.name)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.end(fileRecord.data);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
