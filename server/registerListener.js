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
  ws.platform = normalizeListenerPlatform(data.platform ?? ws.platform);

  if (sessionStore && ws.id) {
    sessionStore.setListenerLanguage(ws.id, data.language, ws.platform);
  }

  if (typeof scheduleCountUpdate === "function") {
    scheduleCountUpdate();
  }

  return true;
}

export function normalizeListenerPlatform(platform) {
  const normalized = typeof platform === "string" ? platform.toLowerCase() : "";
  return ["web", "android", "ios"].includes(normalized)
    ? normalized
    : "unknown";
}

export function persistListenerLanguage(ws, language, sessionStore, platform) {
  ws.language = language;
  ws.platform = normalizeListenerPlatform(platform ?? ws.platform);
  if (sessionStore && ws.id) {
    sessionStore.setListenerLanguage(ws.id, language, ws.platform);
  }
}

export function clearListenerSession(ws, sessionStore) {
  ws.language = null;
  ws.platform = "unknown";
  if (sessionStore && ws.id) {
    sessionStore.clearListenerLanguage(ws.id);
  }
}

export function hasActiveBroadcaster(activeBroadcasts) {
  return Object.values(activeBroadcasts).some(Boolean);
}
