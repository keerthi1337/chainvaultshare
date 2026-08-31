import { pgTable, text, timestamp, customType, integer } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(val: Buffer): Buffer {
    return val;
  },
  fromDriver(val: unknown): Buffer {
    return val as Buffer;
  }
});

export const storageObjectsTable = pgTable("storage_objects", {
  id: text("id").primaryKey(),
  transferId: text("transfer_id"), // nullable reference to parent transfer for cleanup
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  data: bytea("data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
