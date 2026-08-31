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

// Security headers (helmet)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "*"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS — restrict to known origins and localhost development
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allowedHeaders: ["Content-Type", "X-Owner-Token", "X-Passphrase-Token", "X-Access-Code", "X-Download-Token", "Authorization", "Accept"],
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
if (staticDir) {
  app.use(express.static(staticDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

export default app;
