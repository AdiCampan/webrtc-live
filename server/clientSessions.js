/**
 * Persists listener language by clientId across WebSocket reconnects.
 * Cleared only on explicit stop-listening, not on transient disconnects.
 */

export function createClientSessionStore() {
  /** @type {Map<string, { language: string }>} */
  const listeners = new Map();

  return {
    setListenerLanguage(clientId, language) {
      listeners.set(clientId, { language });
    },

    clearListenerLanguage(clientId) {
      listeners.delete(clientId);
    },

    getListenerLanguage(clientId) {
      return listeners.get(clientId)?.language ?? null;
    },
  };
}
