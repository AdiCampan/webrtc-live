/**
 * Structured signaling logs for production traceability (Render, etc.).
 * One JSON line per event — grep by "event":"ws.client.disconnected".
 */

/** @typedef {'info' | 'warn' | 'error' | 'verbose'} LogLevel */

/**
 * @param {string | undefined} raw
 */
export function isVerboseLoggingEnabled(raw) {
  return raw === "1" || raw === "true";
}

/**
 * @param {number} code
 */
export function describeCloseCode(code) {
  /** @type {Record<number, string>} */
  const known = {
    1000: "normal_closure",
    1001: "going_away",
    1006: "abnormal_no_close_frame",
    4000: "replaced_by_new_registration",
    4001: "stale_connection",
    4002: "replaced_by_reconnect",
  };
  return known[code] ?? `ws_close_${code}`;
}

/**
 * @param {Error | string | null | undefined} err
 */
export function errorFields(err) {
  if (!err) {
    return {};
  }
  if (typeof err === "string") {
    return { errorMessage: err };
  }
  return {
    errorMessage: err.message,
    errorName: err.name,
    ...(err.stack ? { errorStack: err.stack.split("\n").slice(0, 5).join(" | ") } : {}),
  };
}

/**
 * @param {object | null | undefined} ws
 */
export function buildClientLogContext(ws) {
  if (!ws) {
    return {};
  }
  const now = Date.now();
  const connectedAt = ws.connectedAt ?? null;
  const lastActivityAt = ws.lastClientActivityAt ?? null;
  return {
    clientId: ws.id ?? null,
    role: ws.isBroadcaster ? "broadcaster" : ws.language ? "listener" : "idle",
    language: ws.language ?? null,
    ...(connectedAt
      ? { connectedDurationMs: now - connectedAt }
      : {}),
    ...(lastActivityAt
      ? { idleMs: now - lastActivityAt }
      : {}),
  };
}

/**
 * @param {Iterable<{ isBroadcaster?: boolean; language?: string | null; readyState?: number }>} clients
 * @param {number} [openState]
 */
export function snapshotListenerCounts(clients, openState = 1) {
  /** @type {Record<string, number>} */
  const counts = { es: 0, en: 0, ro: 0 };
  let totalListeners = 0;
  for (const client of clients) {
    if (client.readyState !== openState) continue;
    if (client.isBroadcaster || !client.language) continue;
    totalListeners += 1;
    if (counts[client.language] !== undefined) {
      counts[client.language] += 1;
    }
  }
  return { totalListeners, byLanguage: counts };
}

/**
 * @param {LogLevel} level
 * @param {boolean} verboseEnabled
 */
function shouldEmit(level, verboseEnabled) {
  if (level === "verbose") {
    return verboseEnabled;
  }
  return true;
}

/**
 * @param {LogLevel} level
 * @param {string} event
 * @param {Record<string, unknown>} [context]
 * @param {{ verboseEnabled?: boolean; onErrorRecorded?: (message: string) => void }} [options]
 */
export function logSignalingEvent(
  level,
  event,
  context = {},
  options = {}
) {
  const verboseEnabled = options.verboseEnabled ?? false;
  if (!shouldEmit(level, verboseEnabled)) {
    return;
  }

  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...context,
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    if (typeof options.onErrorRecorded === "function") {
      options.onErrorRecorded(
        typeof context.errorMessage === "string"
          ? context.errorMessage
          : event
      );
    }
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export function createSignalingLogger(options = {}) {
  const verboseEnabled = options.verboseEnabled ?? false;
  const onErrorRecorded = options.onErrorRecorded;

  return {
    verboseEnabled,
    info(event, context = {}) {
      logSignalingEvent("info", event, context, {
        verboseEnabled,
        onErrorRecorded,
      });
    },
    warn(event, context = {}) {
      logSignalingEvent("warn", event, context, {
        verboseEnabled,
        onErrorRecorded,
      });
    },
    error(event, context = {}) {
      logSignalingEvent("error", event, context, {
        verboseEnabled,
        onErrorRecorded,
      });
    },
    verbose(event, context = {}) {
      logSignalingEvent("verbose", event, context, {
        verboseEnabled,
        onErrorRecorded,
      });
    },
  };
}
