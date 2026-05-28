/**
 * Lightweight listener registration: sets ws.language and schedules count
 * updates without triggering a new WebRTC offer to the broadcaster.
 */

export function handleRegisterListener(
  ws,
  data,
  scheduleCountUpdate,
  sessionStore
) {
  if (data.type !== "register-listener" || !data.language) {
    return false;
  }

  ws.language = data.language;

  if (sessionStore && ws.id) {
    sessionStore.setListenerLanguage(ws.id, data.language);
  }

  if (typeof scheduleCountUpdate === "function") {
    scheduleCountUpdate();
  }

  return true;
}

export function persistListenerLanguage(ws, language, sessionStore) {
  ws.language = language;
  if (sessionStore && ws.id) {
    sessionStore.setListenerLanguage(ws.id, language);
  }
}

export function clearListenerSession(ws, sessionStore) {
  ws.language = null;
  if (sessionStore && ws.id) {
    sessionStore.clearListenerLanguage(ws.id);
  }
}

export function hasActiveBroadcaster(activeBroadcasts) {
  return Object.values(activeBroadcasts).some(Boolean);
}
