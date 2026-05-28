const WS_OPEN = 1;

/**
 * @param {object} params
 * @param {object} params.ws
 * @param {string} params.clientId
 * @param {Iterable<object>} params.clients
 * @param {{ getListenerLanguage: (id: string) => string | null }} params.sessionStore
 * @param {(reason: string) => void} [params.onDuplicateClosed]
 * @returns {{ replacedDuplicate: boolean, restoredLanguage: string | null }}
 */
export function applyClientIdentify({
  ws,
  clientId,
  clients,
  sessionStore,
  onDuplicateClosed,
}) {
  let replacedDuplicate = false;

  for (const client of clients) {
    if (client === ws || client.id !== clientId || client.readyState !== WS_OPEN) {
      continue;
    }
    replacedDuplicate = true;
    try {
      client.close(4002, "replaced_by_reconnect");
    } catch {
      // Socket may already be closing
    }
    if (typeof onDuplicateClosed === "function") {
      onDuplicateClosed(clientId);
    }
  }

  ws.id = clientId;

  const restoredLanguage = sessionStore.getListenerLanguage(clientId);
  if (restoredLanguage && !ws.isBroadcaster) {
    ws.language = restoredLanguage;
  }

  return { replacedDuplicate, restoredLanguage };
}
