const WS_OPEN = 1;
const WS_STALE_AFTER_MIN_MS = 30_000;
const WS_STALE_AFTER_MAX_MS = 10_800_000;

/**
 * Picks another connected socket that is still marked as broadcaster for the same language
 * (e.g. older tab still alive after a newer registration disconnected).
 * @param {Iterable<{ id: string, readyState: number, isBroadcaster: boolean, language: string | null, broadcasterRegisteredAt?: number }>} clients
 * @param {string} language
 * @param {string} excludeId - socket that is closing
 * @returns {object | null} best matching client object from the iterable
 */
export function findStandbyBroadcaster(clients, language, excludeId) {
  let best = null;
  let bestTs = -1;
  for (const c of clients) {
    if (c.readyState !== WS_OPEN) continue;
    if (!c.isBroadcaster || c.language !== language) continue;
    if (c.id === excludeId) continue;
    const ts = c.broadcasterRegisteredAt ?? 0;
    if (ts > bestTs) {
      bestTs = ts;
      best = c;
    }
  }
  return best;
}

/**
 * @param {string | undefined} raw
 * @param {number} fallback
 */
export function parseStaleAfterMs(raw, fallback) {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, WS_STALE_AFTER_MIN_MS), WS_STALE_AFTER_MAX_MS);
}
