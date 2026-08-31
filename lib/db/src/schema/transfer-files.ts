import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { transfersTable } from "./transfers";

export const transferFilesTable = pgTable("transfer_files", {
  id: serial("id").primaryKey(),
  transferId: text("transfer_id")
    .notNull()
    .references(() => transfersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  size: integer("size").notNull().default(0),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  objectPath: text("object_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TransferFile = typeof transferFilesTable.$inferSelect;
