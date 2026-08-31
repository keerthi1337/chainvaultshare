import type { Response } from "express";

/**
 * Server-Sent Events registry.
 * Maps transferId → active SSE response connection.
 * When an upload progresses, emit progress events to the connected client.
 */
class SseRegistry {
  private clients: Map<string, Response> = new Map();

  /**
   * Register a client SSE connection for a transfer.
   * Cleans up automatically when the client disconnects.
   */
  register(transferId: string, res: Response): void {
    // If a previous connection exists for this transfer, close it
    const existing = this.clients.get(transferId);
    if (existing) {
      try { existing.end(); } catch { /* ignore */ }
    }

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable nginx/proxy buffering
    res.flushHeaders();

    this.clients.set(transferId, res);

    // Send initial comment to establish SSE stream
    res.write(`: connected\n\n`);

    // Keepalive heartbeat every 15s to keep Render and reverse proxies from closing the connection
    const keepAliveTimer = setInterval(() => {
      if (res.writableEnded || !this.clients.has(transferId)) {
        clearInterval(keepAliveTimer);
        return;
      }
      try {
        res.write(`: ping\n\n`);
      } catch {
        clearInterval(keepAliveTimer);
        this.clients.delete(transferId);
      }
    }, 15000);

    // Auto-remove when client disconnects
    res.on("close", () => {
      clearInterval(keepAliveTimer);
      this.clients.delete(transferId);
    });
  }

  /**
   * Emit a progress event to the client connected for this transfer.
   */
  emitProgress(transferId: string, percent: number, message: string): void {
    const client = this.clients.get(transferId);
    if (!client || client.writableEnded) {
      this.clients.delete(transferId);
      return;
    }
    const payload = JSON.stringify({ percent, message });
    client.write(`data: ${payload}\n\n`);
  }

  /**
   * Emit a completion event and close the SSE connection.
   */
  emitDone(transferId: string, status: "done" | "failed"): void {
    const client = this.clients.get(transferId);
    if (!client || client.writableEnded) {
      this.clients.delete(transferId);
      return;
    }
    const payload = JSON.stringify({ status });
    client.write(`event: done\ndata: ${payload}\n\n`);
    client.end();
    this.clients.delete(transferId);
  }

  /**
   * Emit a p2p_request event notifying the uploader that a downloader is ready for a file chunk stream.
   */
  emitP2pRequest(transferId: string, objectId: string, objectPath: string): void {
    const client = this.clients.get(transferId);
    if (!client || client.writableEnded) {
      this.clients.delete(transferId);
      return;
    }
    const payload = JSON.stringify({ objectId, objectPath });
    client.write(`event: p2p_request\ndata: ${payload}\n\n`);
  }

  hasClient(transferId: string): boolean {
    return this.clients.has(transferId);
  }
}

// Singleton SSE registry shared across routes
export const sseRegistry = new SseRegistry();
