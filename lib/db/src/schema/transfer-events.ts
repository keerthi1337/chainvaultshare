import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const transferEventsTable = pgTable("transfer_events", {
  id: serial("id").primaryKey(),
  transferId: text("transfer_id"), // nullable — ghost mode transfers skip FK
  fileId: integer("file_id"), // which file was downloaded (nullable for views)
  eventType: text("event_type").notNull().default("download"), // 'download' | 'view' | 'unlock_attempt'
  country: text("country").notNull().default("XX"), // ISO 3166-1 alpha-2 code
  deviceType: text("device_type").notNull().default("unknown"), // 'mobile' | 'desktop' | 'bot' | 'unknown'
  ipHash: text("ip_hash"), // SHA-256 of IP address — no raw IP stored (GDPR-safe)
  receiptHash: text("receipt_hash"), // HMAC-SHA256 proof of delivery receipt
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TransferEvent = typeof transferEventsTable.$inferSelect;
