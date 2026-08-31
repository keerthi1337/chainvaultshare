// @ts-ignore
import geoip from "geoip-lite";
import { createHash } from "crypto";

/**
 * Resolve an IP address to a 2-letter ISO country code.
 * Returns "XX" for private/unknown IPs.
 */
export function getCountryFromIp(ip: string): string {
  if (!ip || ip === "::1" || ip === "127.0.0.1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return "XX"; // local / private
  }
  try {
    // Strip IPv6-mapped IPv4 prefix (::ffff:1.2.3.4)
    const cleanIp = ip.replace(/^::ffff:/, "");
    const geo = geoip.lookup(cleanIp);
    return geo?.country ?? "XX";
  } catch {
    return "XX";
  }
}

/**
 * Classify a User-Agent string into a device category.
 */
export function getDeviceType(userAgent: string = ""): "mobile" | "desktop" | "bot" | "unknown" {
  const ua = userAgent.toLowerCase();
  if (!ua) return "unknown";
  if (/bot|crawl|spider|slurp|mediapartners|google|bingbot|yandex|facebot/.test(ua)) return "bot";
  if (/mobile|android|iphone|ipad|ipod|blackberry|windows phone|opera mini/.test(ua)) return "mobile";
  if (/windows|macintosh|linux|x11/.test(ua)) return "desktop";
  return "unknown";
}

/**
 * Hash an IP address with SHA-256 for GDPR-safe storage.
 * Never store raw IPs — store only the hash.
 */
export function hashIp(ip: string): string {
  return createHash("sha256").update(ip + (process.env.IP_SALT ?? "cvs-ip-salt")).digest("hex");
}

/**
 * Get the real client IP, accounting for common proxy headers.
 */
export function getRealIp(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return first.trim();
  }
  return req.ip ?? "unknown";
}
