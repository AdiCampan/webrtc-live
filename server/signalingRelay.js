/**
 * Resolves the language used for WebRTC signaling authorization.
 * Falls back to the persisted session when the socket was just reconnected.
 */
export function getEffectiveLanguage(ws, sessionStore) {
  if (ws.language) {
    return ws.language;
  }
  if (ws.isBroadcaster || !ws.id) {
    return null;
  }
  return sessionStore.getListenerLanguage(ws.id);
}

/**
 * Allows relay when both sides share the same language, including after
 * a listener reconnects before register-listener arrives.
 */
export function canRelaySignaling(sender, target, sessionStore) {
  const senderLang = getEffectiveLanguage(sender, sessionStore);
  const targetLang = getEffectiveLanguage(target, sessionStore);

  if (!senderLang || !targetLang) {
    return false;
  }

  return senderLang === targetLang;
}
