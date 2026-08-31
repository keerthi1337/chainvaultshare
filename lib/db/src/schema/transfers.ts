import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { randomUUID } from "crypto";

export const transfersTable = pgTable("transfers", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  itemType: text("item_type").notNull().default("file"), // file | folder | multiple
  status: text("status").notNull().default("preparing"), // preparing | uploading | securing | verified | failed | expired
  shareLink: text("share_link").notNull(),
  proofId: text("proof_id").notNull(),
  fileCount: integer("file_count").notNull().default(1),
  totalSize: integer("total_size").notNull().default(0),
  proofHash: text("proof_hash"),
  storageRef: text("storage_ref"),
  txRef: text("tx_ref"),
  ownerAddress: text("owner_address"),
  ownerIp: text("owner_ip"), // SHA-256 hashed IP for recents lookup
  ownerToken: text("owner_token"), // SHA-256 hash of raw token returned once to client
  ghostMode: boolean("ghost_mode").notNull().default(false), // skip all logging and metadata
  isP2p: boolean("is_p2p").notNull().default(false), // real-time peer-to-peer stream relay
  passphraseHash: text("passphrase_hash"), // scrypt(passphrase, salt) stored as "salt:hash"
  e2eEncrypted: boolean("e2e_encrypted").notNull().default(false), // client-side encrypted
  downloadCount: integer("download_count").notNull().default(0), // total download events
  networkName: text("network_name"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTransferSchema = createInsertSchema(transfersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTransfer = z.infer<typeof insertTransferSchema>;
export type Transfer = typeof transfersTable.$inferSelect;
