import app from "./app";
import { logger } from "./lib/logger";
import { runCleanup } from "./lib/cleanup";
import cron from "node-cron";

const rawPort = process.env["PORT"] || "8080";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Run cleanup immediately on startup, then every 15 minutes
  runCleanup().catch((e) => logger.error({ err: e }, "Initial cleanup failed"));
  cron.schedule("*/15 * * * *", () => {
    runCleanup().catch((e) => logger.error({ err: e }, "Scheduled cleanup failed"));
  });

  logger.info("Expiration cleanup cron scheduled (every 15 minutes)");
});
