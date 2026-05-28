const WS_OPEN = 1;

export function isSignalingTargetOnline(clients, targetId) {
  for (const client of clients) {
    if (client.id === targetId && client.readyState === WS_OPEN) {
      return true;
    }
  }
  return false;
}

/**
 * Buffer only when the target socket exists but is temporarily not ready.
 * If the target is fully gone, the broadcaster should drop the peer instead.
 */
export function shouldBufferSignalingForTarget(clients, targetId) {
  for (const client of clients) {
    if (client.id === targetId) {
      return client.readyState !== WS_OPEN;
    }
  }
  return false;
}

export function buildStopConnectionPayload(listenerId) {
  return { type: "stop-connection", target: listenerId };
}

/**
 * @param {Record<string, object | null>} broadcasters
 * @param {string | null | undefined} language
 * @param {string} listenerId
 * @param {object | null | undefined} broadcasterSocket
 */
export function resolveBroadcasterSocket(
  broadcasters,
  language,
  broadcasterSocket
) {
  if (broadcasterSocket?.readyState === WS_OPEN) {
    return broadcasterSocket;
  }
  if (!language) {
    return null;
  }
  const registered = broadcasters[language];
  if (registered?.readyState === WS_OPEN) {
    return registered;
  }
  return null;
}

export function shouldNotifyBroadcasterOnListenerClose(closeCode) {
  // 4001 = stale ghost socket; 4002 = replaced by reconnect (same clientId, skip)
  return closeCode === 4001;
}
