const WS_OPEN = 1;

const SUPPORTED_LANGS = /** @type {const} */ (["es", "en", "ro"]);

/** @type {{ atMs: number; message: string } | null} */
let lastError = null;

/** @type {Record<string, { atMs: number; socketIdSuffix: string }>} */
const lastBroadcasterRegistration = {
  es: { atMs: 0, socketIdSuffix: "" },
  en: { atMs: 0, socketIdSuffix: "" },
  ro: { atMs: 0, socketIdSuffix: "" },
};

/**
 * @param {string} socketId
 */
function socketIdSuffix(socketId) {
  if (socketId.length <= 8) return socketId;
  return socketId.slice(-8);
}

/**
 * @param {string} message
 */
export function recordSignalingError(message) {
  lastError = { atMs: Date.now(), message };
}

/**
 * @param {string} language
 * @param {string} socketId
 */
export function recordBroadcasterRegistration(language, socketId) {
  if (!SUPPORTED_LANGS.includes(language)) return;
  lastBroadcasterRegistration[language] = {
    atMs: Date.now(),
    socketIdSuffix: socketIdSuffix(socketId),
  };
}

/**
 * @param {number} ms
 */
function toIso(ms) {
  if (!ms || ms <= 0) return null;
  return new Date(ms).toISOString();
}

/**
 * @typedef {{ id: string; readyState: number; isBroadcaster: boolean; language: string | null }} ClientLike
 */

/**
 * @param {Iterable<ClientLike>} clients
 * @param {number} [openState]
 */
export function countClientsByRole(clients, openState = WS_OPEN) {
  let idle = 0;
  let broadcaster = 0;
  let listener = 0;
  /** @type {Record<string, number>} */
  const listenersByLanguage = { es: 0, en: 0, ro: 0 };

  for (const c of clients) {
    if (c.readyState !== openState) continue;
    if (c.isBroadcaster) {
      broadcaster += 1;
      continue;
    }
    if (c.language) {
      listener += 1;
      if (listenersByLanguage[c.language] !== undefined) {
        listenersByLanguage[c.language] += 1;
      }
      continue;
    }
    idle += 1;
  }

  return { idle, broadcaster, listener, listenersByLanguage };
}

/**
 * @param {Record<string, { id: string; readyState: number; broadcasterRegisteredAt?: number } | null | undefined>} broadcastersMap
 */
function activeBroadcastersSnapshot(broadcastersMap) {
  /** @type {Record<string, { socketIdSuffix: string; registeredAt: string | null } | null>} */
  const out = {};
  for (const lang of SUPPORTED_LANGS) {
    const ws = broadcastersMap[lang];
    if (ws && ws.readyState === WS_OPEN) {
      out[lang] = {
        socketIdSuffix: socketIdSuffix(ws.id),
        registeredAt: toIso(ws.broadcasterRegisteredAt ?? 0),
      };
    } else {
      out[lang] = null;
    }
  }
  return out;
}

/**
 * @param {Record<string, { atMs: number; socketIdSuffix: string }>} registrations
 */
function lastRegistrationSnapshot(registrations) {
  /** @type {Record<string, { at: string | null; socketIdSuffix: string } | null>} */
  const out = {};
  for (const lang of SUPPORTED_LANGS) {
    const row = registrations[lang];
    if (!row || row.atMs <= 0) {
      out[lang] = null;
      continue;
    }
    out[lang] = {
      at: toIso(row.atMs),
      socketIdSuffix: row.socketIdSuffix || null,
    };
  }
  return out;
}

/**
 * @param {object} input
 * @param {Iterable<ClientLike>} input.clients
 * @param {Record<string, { id: string; readyState: number; broadcasterRegisteredAt?: number } | null | undefined>} input.broadcasters
 * @param {number} input.uptimeSeconds
 * @param {number} input.totalConnections
 */
export function buildSignalingMetricsPayload(input) {
  const byRole = countClientsByRole(input.clients);
  return {
    ok: true,
    uptimeSeconds: input.uptimeSeconds,
    websocketClients: input.totalConnections,
    clientsByRole: {
      idle: byRole.idle,
      broadcaster: byRole.broadcaster,
      listener: byRole.listener,
    },
    listenersByLanguage: byRole.listenersByLanguage,
    activeBroadcasters: activeBroadcastersSnapshot(input.broadcasters),
    lastBroadcasterRegistration: lastRegistrationSnapshot(
      lastBroadcasterRegistration
    ),
    lastError: lastError
      ? {
          at: toIso(lastError.atMs),
          message: lastError.message,
        }
      : null,
  };
}

export function resetSignalingMetricsForTests() {
  lastError = null;
  for (const lang of SUPPORTED_LANGS) {
    lastBroadcasterRegistration[lang] = { atMs: 0, socketIdSuffix: "" };
  }
}
