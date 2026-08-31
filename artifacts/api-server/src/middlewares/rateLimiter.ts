import rateLimit from "express-rate-limit";

/**
 * Global rate limiter — applies to all routes.
 * 200 requests per minute per IP.
 */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

/**
 * Code access limiter — prevents brute-force guessing of CVT codes.
 * 10 requests per minute per IP on /by-code and /verify endpoints.
 */
export const codeAccessLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many code lookup attempts. Try again in a minute." },
  skipSuccessfulRequests: false,
});

/**
 * Upload limiter — prevents upload abuse.
 * 20 upload requests per hour per IP.
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Upload limit reached. Please wait before uploading again." },
});
