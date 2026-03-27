interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

const store = new Map<string, CacheEntry<unknown>>();
let hits = 0;
let misses = 0;

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    misses++;
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    misses++;
    return null;
  }
  hits++;
  return entry.data;
}

export function cacheSet<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function cacheInvalidate(key: string): boolean {
  return store.delete(key);
}

export function cacheStats(): CacheStats {
  return { hits, misses, size: store.size };
}
