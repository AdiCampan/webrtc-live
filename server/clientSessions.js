/**
 * Persists listener language by clientId across WebSocket reconnects.
 * Cleared only on explicit stop-listening, not on transient disconnects.
 */

/**
 * @typedef {{ language: string; platform: string; lastSeenAt: number }} ListenerSession
 */

export function createClientSessionStore() {
  /** @type {Map<string, ListenerSession>} */
  const listeners = new Map();

  return {
    setListenerLanguage(clientId, language, platform = "unknown") {
      listeners.set(clientId, { language, platform, lastSeenAt: Date.now() });
    },

    touchListener(clientId) {
      const existing = listeners.get(clientId);
      if (!existing) {
        return;
      }
      listeners.set(clientId, { ...existing, lastSeenAt: Date.now() });
    },

    clearListenerLanguage(clientId) {
      listeners.delete(clientId);
    },

    getListenerLanguage(clientId) {
      return listeners.get(clientId)?.language ?? null;
    },

    getListenerPlatform(clientId) {
      return listeners.get(clientId)?.platform ?? null;
    },

    getListenerSession(clientId) {
      return listeners.get(clientId) ?? null;
    },

    /**
     * @param {(clientId: string, session: ListenerSession) => void} callback
     */
    forEachActiveListenerSession(callback) {
      for (const [clientId, session] of listeners) {
        callback(clientId, session);
      }
    },

    purgeExpiredSessions(graceMs) {
      const now = Date.now();
      for (const [clientId, session] of listeners) {
        if (now - session.lastSeenAt > graceMs) {
          listeners.delete(clientId);
        }
      }
    },
  };
}
