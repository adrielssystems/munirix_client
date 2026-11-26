/**
 * Rate limiter en memoria (ventana deslizante) para proteger endpoints sensibles
 * contra fuerza bruta y bots (registro, IA, facturación).
 */
const buckets = new Map();
let lastCleanup = Date.now();

export function getClientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export function checkRateLimit(key, { limit = 10, windowMs = 10 * 60 * 1000 } = {}) {
  const now = Date.now();

  // Limpieza periódica para evitar crecimiento de memoria
  if (now - lastCleanup > 5 * 60 * 1000) {
    for (const [k, entry] of buckets.entries()) {
      if (entry.resetAt <= now) buckets.delete(k);
    }
    lastCleanup = now;
  }

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil((current.resetAt - now) / 1000),
    };
  }

  current.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - current.count) };
}
