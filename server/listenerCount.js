const WS_OPEN = 1;
const LISTENER_BACKGROUND_GRACE_MIN_MS = 60_000;
const LISTENER_BACKGROUND_GRACE_MAX_MS = 10_800_000;
const SUPPORTED_LANGUAGES = ["es", "en", "ro"];
const SUPPORTED_PLATFORMS = ["web", "android", "ios", "unknown"];

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
 * @param {string | null | undefined} platform
 */
function normalizePlatform(platform) {
  return SUPPORTED_PLATFORMS.includes(platform) ? platform : "unknown";
}

/**
 * @param {string | null | undefined} language
 */
function isSupportedLanguage(language) {
  return SUPPORTED_LANGUAGES.includes(language);
}

/**
 * Counts listeners on open WebSockets plus sessions still within the background
 * grace window (same clientId, no duplicate WS). Keeps dashboard counts accurate
 * when Android suspends the signaling socket but WebRTC audio continues.
 *
 * @param {Iterable<{ id?: string; readyState?: number; isBroadcaster?: boolean; language?: string | null; platform?: string | null }>} clients
 * @param {{ forEachActiveListenerSession: (fn: (clientId: string, session: { language: string; platform?: string; lastSeenAt: number }) => void) => void }} sessionStore
 * @param {number} graceMs
 */
export function computeListenerCounts(clients, sessionStore, graceMs) {
  /** @type {Record<string, number>} */
  const byLanguage = { es: 0, en: 0, ro: 0 };
  /** @type {Record<string, number>} */
  const byPlatform = { web: 0, android: 0, ios: 0, unknown: 0 };
  /** @type {Set<string>} */
  const countedIds = new Set();
  const now = Date.now();

  for (const client of clients) {
    if (client.readyState !== WS_OPEN) {
      continue;
    }
    if (
      client.isBroadcaster ||
      !client.id ||
      !isSupportedLanguage(client.language)
    ) {
      continue;
    }
    if (countedIds.has(client.id)) {
      continue;
    }
    byLanguage[client.language] = (byLanguage[client.language] ?? 0) + 1;
    byPlatform[normalizePlatform(client.platform)] += 1;
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
      if (byLanguage[session.language] === undefined) {
        return;
      }
      byLanguage[session.language] += 1;
      byPlatform[normalizePlatform(session.platform)] += 1;
      countedIds.add(clientId);
    });
  }

  let totalListeners = 0;
  for (const lang of Object.keys(byLanguage)) {
    totalListeners += byLanguage[lang] ?? 0;
  }

  return { totalListeners, byLanguage, byPlatform };
}

/**
 * @param {Iterable<{ id?: string; readyState?: number; isBroadcaster?: boolean; language?: string | null; platform?: string | null }>} clients
 * @param {{ forEachActiveListenerSession: (fn: (clientId: string, session: { language: string; platform?: string; lastSeenAt: number }) => void) => void }} sessionStore
 * @param {number} graceMs
 */
export function buildListenerCountPayload(clients, sessionStore, graceMs) {
  const { byLanguage, byPlatform } = computeListenerCounts(
    clients,
    sessionStore,
    graceMs
  );
  return {
    listeners: {
      es: byLanguage.es ?? 0,
      en: byLanguage.en ?? 0,
      ro: byLanguage.ro ?? 0,
    },
    listenersByPlatform: byPlatform,
  };
}

export { WS_OPEN };
