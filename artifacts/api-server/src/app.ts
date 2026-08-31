import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { globalLimiter } from "./middlewares/rateLimiter";

const app: Express = express();

// Determine allowed CORS origins based on environment
const allowedOrigins = [
  "https://chainvaultshare.app",
  "http://localhost:22140",
  "http://127.0.0.1:22140",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:4173",
];

// Security headers (helmet) — disable CSP to allow fonts, streaming and Vite assets
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// CORS — allow same-origin and flexible access
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allowedHeaders: [
      "Content-Type",
      "X-Owner-Token",
      "X-Passphrase-Token",
      "X-Access-Code",
      "X-Download-Token",
      "X-My-Transfer-Ids",
      "Authorization",
      "Accept",
    ],
    exposedHeaders: ["X-Delivery-Receipt", "X-Delivery-Timestamp", "X-E2E-Encrypted", "Content-Disposition"],
  })
);

// Request logger
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Global rate limiter — 200 requests/min/IP
app.use(globalLimiter);

// JSON body limit — metadata only, files go through streaming endpoint
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

import path from "node:path";
import fs from "node:fs";

app.use("/api", router);

// Serve frontend static build in production (unified single-site deployment)
const candidateStaticPaths = [
  path.resolve(process.cwd(), "artifacts/chainvaultshare/dist/public"),
  path.resolve(__dirname, "../../chainvaultshare/dist/public"),
  path.resolve(__dirname, "../chainvaultshare/dist/public"),
  path.resolve(__dirname, "public"),
];
const staticDir = candidateStaticPaths.find((p) => fs.existsSync(p));
logger.info({ staticDir, cwd: process.cwd() }, "Frontend static assets directory");

if (staticDir) {
  // Serve static assets (JS, CSS, images, SVGs) with index: false
  app.use(express.static(staticDir, { index: false, maxAge: "1d" }));

  // Fallback for SPA routes (only if no file extension, like /upload, /transfers, /verify, /t/:id)
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api/")) {
      const ext = path.extname(req.path);
      // If it has an extension (like missing .js or .png), don't send index.html (which would break JS parsing)
      if (ext) {
        return res.status(404).end();
      }
      return res.sendFile(path.join(staticDir, "index.html"));
    }
    next();
  });
}

export default app;
