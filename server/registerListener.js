/**
 * Lightweight listener registration: sets ws.language and schedules count
 * updates without triggering a new WebRTC offer to the broadcaster.
 */

export function handleRegisterListener(ws, data, scheduleCountUpdate) {
  if (data.type !== "register-listener" || !data.language) {
    return false;
  }

  ws.language = data.language;

  if (typeof scheduleCountUpdate === "function") {
    scheduleCountUpdate();
  }

  return true;
}

export function hasActiveBroadcaster(activeBroadcasts) {
  return Object.values(activeBroadcasts).some(Boolean);
}
