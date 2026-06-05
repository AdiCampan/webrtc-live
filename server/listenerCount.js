const WS_OPEN = 1;
const LISTENER_BACKGROUND_GRACE_MIN_MS = 60_000;
const LISTENER_BACKGROUND_GRACE_MAX_MS = 10_800_000;

/**
 * @param {string | undefined} raw
 * @param {number} fallbackMs
 */
export function parseListenerBackgroundGraceMs(
  raw,
  fallbackMs = LISTENER_BACKGROUND_GRACE_MAX_MS
) {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) {
    return fallbackMs;
  }
  return Math.min(
    Math.max(n, LISTENER_BACKGROUND_GRACE_MIN_MS),
    LISTENER_BACKGROUND_GRACE_MAX_MS
  );
}

/**
 * Counts listeners on open WebSockets plus sessions still within the background
 * grace window (same clientId, no duplicate WS). Keeps dashboard counts accurate
 * when Android suspends the signaling socket but WebRTC audio continues.
 *
 * @param {Iterable<{ id?: string; readyState?: number; isBroadcaster?: boolean; language?: string | null }>} clients
 * @param {{ forEachActiveListenerSession: (fn: (clientId: string, session: { language: string; lastSeenAt: number }) => void) => void }} sessionStore
 * @param {number} graceMs
 */
export function computeListenerCounts(clients, sessionStore, graceMs) {
  /** @type {Record<string, number>} */
  const counts = { es: 0, en: 0, ro: 0 };
  /** @type {Set<string>} */
  const countedIds = new Set();
  const now = Date.now();

  for (const client of clients) {
    if (client.readyState !== WS_OPEN) {
      continue;
    }
    if (client.isBroadcaster || !client.language || !client.id) {
      continue;
    }
    counts[client.language] = (counts[client.language] ?? 0) + 1;
    countedIds.add(client.id);
  }

  if (graceMs > 0) {
  sessionStore.forEachActiveListenerSession((clientId, session) => {
    if (countedIds.has(clientId)) {
      return;
    }
    if (now - session.lastSeenAt > graceMs) {
      return;
    }
    if (counts[session.language] === undefined) {
      return;
    }
    counts[session.language] += 1;
    countedIds.add(clientId);
  });
  }

  let totalListeners = 0;
  for (const lang of Object.keys(counts)) {
    totalListeners += counts[lang] ?? 0;
  }

  return { totalListeners, byLanguage: counts };
}

/**
 * @param {Iterable<{ id?: string; readyState?: number; isBroadcaster?: boolean; language?: string | null }>} clients
 * @param {{ forEachActiveListenerSession: (fn: (clientId: string, session: { language: string; lastSeenAt: number }) => void) => void }} sessionStore
 * @param {number} graceMs
 */
export function buildListenerCountPayload(clients, sessionStore, graceMs) {
  const { byLanguage } = computeListenerCounts(clients, sessionStore, graceMs);
  return { es: byLanguage.es ?? 0, en: byLanguage.en ?? 0, ro: byLanguage.ro ?? 0 };
}

export { WS_OPEN };
