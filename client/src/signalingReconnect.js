export const SERVER_SHUTDOWN_DEFAULT_RETRY_MS = 3000;
export const WS_RECONNECT_MAX_DELAY_MS = 30000;

export function computeWsReconnectDelayMs(attempt) {
  const normalized = Math.max(1, attempt);
  return Math.min(WS_RECONNECT_MAX_DELAY_MS, 2 ** (normalized - 1) * 1000);
}

export function isIceConnectionHealthy(iceConnectionState) {
  return (
    iceConnectionState === "connected" || iceConnectionState === "completed"
  );
}

export function shouldRequestOfferOnBroadcastActive(
  language,
  activeLangs,
  hasRemoteStream,
  iceConnectionState
) {
  if (!language || !activeLangs[language]) {
    return false;
  }
  if (hasRemoteStream && isIceConnectionHealthy(iceConnectionState)) {
    return false;
  }
  return true;
}

export function resolveStreamRecoveryAction(
  hasLanguage,
  wsOpen,
  hasRemoteStream,
  iceConnectionState
) {
  if (!hasLanguage || !wsOpen) {
    return "none";
  }
  if (hasRemoteStream && isIceConnectionHealthy(iceConnectionState)) {
    return "register-listener";
  }
  return "request-offer";
}

export function parseServerShutdownRetryMs(retryAfterMs) {
  if (
    typeof retryAfterMs === "number" &&
    Number.isFinite(retryAfterMs) &&
    retryAfterMs >= 0
  ) {
    return retryAfterMs;
  }
  return SERVER_SHUTDOWN_DEFAULT_RETRY_MS;
}

export function isServerShutdownMessage(data) {
  return (
    data !== null &&
    typeof data === "object" &&
    data.type === "server-shutdown"
  );
}

export function buildBroadcasterReregisterPayload(language, token) {
  return {
    type: "broadcaster",
    language,
    token,
  };
}

export function shouldReregisterBroadcasterOnOpen({
  role,
  token,
  wasBroadcasting,
  language,
}) {
  return (
    role === "broadcaster" &&
    Boolean(token) &&
    wasBroadcasting &&
    Boolean(language)
  );
}
