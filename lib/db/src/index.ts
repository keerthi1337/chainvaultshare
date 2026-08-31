import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

import path from "path";
import fs from "fs";

if (!process.env.DATABASE_URL) {
  const pathsToTry = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(__dirname, "../../../.env"),
    path.resolve(__dirname, "../../.env"),
  ];
  for (const envPath of pathsToTry) {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      for (const line of envContent.split("\n")) {
        const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
        if (match) {
          const key = match[1].trim();
          let val = match[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          process.env[key] = val;
        }
      }
      break;
    }
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
