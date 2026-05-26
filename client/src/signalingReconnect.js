export const SERVER_SHUTDOWN_DEFAULT_RETRY_MS = 3000;

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
