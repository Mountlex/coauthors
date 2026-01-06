type RateLimitEntry = {
  count: number;
  resetTime: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Validate IPv4 address (each octet must be 0-255)
 */
function isValidIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0 && num <= 255 && part === num.toString();
  });
}

/**
 * Validate IPv6 address (basic validation)
 */
function isValidIPv6(ip: string): boolean {
  if (!ip.includes(":")) return false;
  const groups = ip.split(":");
  // IPv6 has 8 groups, but :: compression can reduce this
  if (groups.length < 3 || groups.length > 8) return false;
  // Each group must be empty (for ::) or 1-4 hex chars
  return groups.every((g) => g === "" || /^[a-fA-F0-9]{1,4}$/.test(g));
}

/**
 * Validate IP address format
 */
function isValidIP(ip: string): boolean {
  return isValidIPv4(ip) || isValidIPv6(ip);
}

// Clean up expired entries periodically
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

export type RateLimitConfig = {
  maxRequests: number;
  windowMs: number;
};

export const RATE_LIMITS = {
  search: { maxRequests: 60, windowMs: 60 * 1000 }, // 60 req/min
  graph: { maxRequests: 30, windowMs: 60 * 1000 }, // 30 req/min
} as const;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetTime: number;
};

/**
 * Check rate limit for a given identifier (typically IP + endpoint)
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // No existing entry or window expired - create new entry
  if (!entry || entry.resetTime < now) {
    const resetTime = now + config.windowMs;
    rateLimitStore.set(identifier, { count: 1, resetTime });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime,
    };
  }

  // Within window - check and increment
  if (entry.count < config.maxRequests) {
    entry.count++;
    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetTime: entry.resetTime,
    };
  }

  // Rate limit exceeded
  return {
    allowed: false,
    remaining: 0,
    resetTime: entry.resetTime,
  };
}

/**
 * Log rate limit violation for monitoring
 */
export function logRateLimitViolation(identifier: string, resetTime: number): void {
  console.warn(
    `[RateLimit] Exceeded: ${identifier}, resets at ${new Date(resetTime).toISOString()}`
  );
}

/**
 * Get client IP from request headers with validation
 */
export function getClientIP(request: Request): string {
  // Check common proxy headers
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // Take the first IP in the chain (original client)
    const firstIP = forwardedFor.split(",")[0].trim();
    // Validate IP format to prevent header spoofing
    if (isValidIP(firstIP)) {
      return firstIP;
    }
  }

  const realIP = request.headers.get("x-real-ip");
  if (realIP && isValidIP(realIP)) {
    return realIP;
  }

  // Fallback - shouldn't happen in production behind a proxy
  return "unknown";
}
