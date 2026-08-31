import { defineConfig } from "drizzle-kit";
import path from "path";

import fs from "fs";

if (!process.env.DATABASE_URL) {
  const rootEnvPath = path.resolve(__dirname, "../../.env");
  if (fs.existsSync(rootEnvPath)) {
    const envContent = fs.readFileSync(rootEnvPath, "utf-8");
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
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
