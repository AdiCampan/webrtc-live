import { describeCloseCode } from "./wsCloseCodes.js";

/**
 * @param {number | null | undefined} ms
 */
export function formatDurationMs(ms) {
  if (ms == null || !Number.isFinite(ms)) {
    return null;
  }
  const sec = Math.round(ms / 1000);
  if (sec < 60) {
    return `${sec} s`;
  }
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min} min ${rem} s` : `${min} min`;
}

/**
 * @param {string | null | undefined} clientId
 */
export function shortenClientId(clientId) {
  if (!clientId || typeof clientId !== "string") {
    return "—";
  }
  return clientId.length > 8 ? `${clientId.slice(0, 8)}…` : clientId;
}

/**
 * @param {{ totalListeners?: number; byLanguage?: Record<string, number> } | null | undefined} listeners
 */
export function formatListenerSummary(listeners) {
  if (!listeners || listeners.totalListeners == null) {
    return "";
  }
  const total = listeners.totalListeners;
  const label = total === 1 ? "oyente" : "oyentes";
  const byLang = listeners.byLanguage ?? {};
  const activeLangs = Object.entries(byLang)
    .filter(([, count]) => count > 0)
    .map(([lang, count]) => `${lang}: ${count}`)
    .join(", ");
  const breakdown = activeLangs ? ` (${activeLangs})` : "";
  return `${total} ${label}${breakdown}`;
}

/**
 * @param {string} closeKind
 */
export function describeCloseKindHuman(closeKind) {
  /** @type {Record<string, string>} */
  const known = {
    normal_closure: "cierre normal (el usuario paró o cerró la app)",
    going_away: "pestaña o app cerrada",
    abnormal_no_close_frame:
      "señal WebSocket cortada (móvil en segundo plano, red o ahorro de batería)",
    replaced_by_new_registration: "otra pestaña o dispositivo tomó la emisión",
    stale_connection: "sin ping del cliente demasiado tiempo (conexión fantasma)",
    replaced_by_reconnect: "mismo dispositivo reconectado (socket antiguo)",
  };
  return known[closeKind] ?? closeKind;
}

/**
 * @param {import("./signalingLogger.js").LogLevel} level
 */
function eventEmoji(level, event) {
  if (level === "error") {
    return "❌";
  }
  if (level === "warn") {
    if (event.startsWith("broadcaster.")) {
      return "🎙️";
    }
    if (event.includes("listener") || event.includes("Oyente")) {
      return "👂";
    }
    return "⚠️";
  }
  if (event.startsWith("broadcaster.")) {
    return "🎙️";
  }
  if (event.includes("listener") || event.includes("ws.client")) {
    return "👂";
  }
  if (event.startsWith("server.")) {
    return "📡";
  }
  return "ℹ️";
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} context
 */
export function formatHumanLogHeadline(event, context = {}) {
  const lang = context.language != null ? String(context.language) : null;
  const clientId = shortenClientId(
    typeof context.clientId === "string" ? context.clientId : null
  );
  const listeners = formatListenerSummary(
    /** @type {{ totalListeners?: number; byLanguage?: Record<string, number> } | undefined} */ (
      context.listeners
    )
  );
  const listenersLine = listeners ? `Conteo oyentes: ${listeners}` : "";

  switch (event) {
    case "server.firebase.connected":
      return ["Firebase conectado correctamente"];
    case "server.started": {
      const port = context.port ?? "8080";
      const staleSec = Math.round(
        (typeof context.wsStaleAfterMs === "number"
          ? context.wsStaleAfterMs
          : 300000) / 1000
      );
      const graceSec = Math.round(
        (typeof context.listenerBackgroundGraceMs === "number"
          ? context.listenerBackgroundGraceMs
          : 1_800_000) / 1000
      );
      return [
        `Servidor listo en puerto ${port}`,
        `Corte WS por inactividad: ${staleSec} s · Conteo en segundo plano: ${graceSec} s`,
      ];
    }
    case "server.shutdown.started":
      return [
        `Reinicio o deploy (${context.signal ?? "señal"})`,
        `Clientes WS conectados en ese momento: ${context.connectedClients ?? 0}`,
      ];
    case "server.shutdown.completed":
      return [`Apagado limpio (${context.signal ?? "señal"})`];
    case "server.shutdown.timeout":
      return [
        `Apagado forzado tras ${formatDurationMs(typeof context.timeoutMs === "number" ? context.timeoutMs : 10000) ?? "10 s"}`,
        "Algunos clientes no cerraron a tiempo",
      ];
    case "broadcaster.registered":
      return [
        `Emisión EN VIVO en ${lang ?? "?"}`,
        listenersLine || "Sin oyentes registrados aún",
      ];
    case "broadcaster.disconnected": {
      const replacement =
        typeof context.replacementClientId === "string"
          ? shortenClientId(context.replacementClientId)
          : null;
      return [
        `Emisor ${lang ?? "?"} desconectado`,
        replacement
          ? `Otra sesión sigue activa (${replacement})`
          : "No queda otra sesión de emisión",
        listenersLine,
      ].filter(Boolean);
    }
    case "broadcaster.replaced_previous":
      return [
        `Nueva emisión ${lang ?? "?"} sustituyó a la sesión anterior`,
        `Sesión anterior: ${shortenClientId(typeof context.previousClientId === "string" ? context.previousClientId : null)}`,
      ];
    case "listener.stopped":
      return [
        `Oyente ${clientId} dejó de escuchar ${lang ?? "?"}`,
        listenersLine,
      ].filter(Boolean);
    case "ws.client.disconnected": {
      const role =
        context.role === "broadcaster"
          ? "Emisor"
          : context.role === "listener"
            ? "Oyente"
            : "Cliente";
      const closeHuman =
        typeof context.closeKind === "string"
          ? describeCloseKindHuman(context.closeKind)
          : "motivo desconocido";
      const connected = formatDurationMs(
        typeof context.connectedDurationMs === "number"
          ? context.connectedDurationMs
          : null
      );
      const idle = formatDurationMs(
        typeof context.idleMs === "number" ? context.idleMs : null
      );
      return [
        `${role} desconectado · ${clientId}${lang ? ` · idioma ${lang}` : ""}`,
        `Motivo: ${closeHuman}`,
        connected ? `Tiempo conectado: ${connected}` : "",
        idle ? `Sin señal al servidor: ${idle}` : "",
        listenersLine,
      ].filter(Boolean);
    }
    case "ws.client.stale_closed": {
      const thresholdSec = Math.round(
        (typeof context.staleThresholdMs === "number"
          ? context.staleThresholdMs
          : 300000) / 1000
      );
      const idle = formatDurationMs(
        typeof context.idleMs === "number" ? context.idleMs : null
      );
      return [
        `Conexión fantasma cerrada · oyente ${clientId}${lang ? ` (${lang})` : ""}`,
        idle
          ? `Sin actividad ${idle} (límite ${thresholdSec} s)`
          : `Límite de inactividad: ${thresholdSec} s`,
        listenersLine,
      ].filter(Boolean);
    }
    case "ws.client.duplicate_replaced":
      return [
        `Mismo dispositivo reconectado · ${clientId}${lang ? ` (${lang})` : ""}`,
        "Se cerró el socket antiguo (normal al volver a primer plano)",
      ];
    case "ws.client.language_restored":
      return [
        `Sesión restaurada · ${clientId}`,
        `Sigue escuchando ${context.language ?? lang ?? "?"}`,
        listenersLine,
      ].filter(Boolean);
    case "signaling.offer.no_broadcaster":
      return [
        `Oyente ${clientId} pidió audio en ${lang ?? "?"}`,
        "No hay emisor activo en ese idioma",
      ];
    default:
      return [`Evento técnico: ${event}`];
  }
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} context
 */
export function formatHumanLogMessage(event, context = {}) {
  return formatHumanLogHeadline(event, context).join(" · ");
}

/**
 * @param {import("./signalingLogger.js").LogLevel} level
 */
export function formatLogLevelLabel(level) {
  /** @type {Record<string, string>} */
  const labels = {
    info: "INFO",
    warn: "AVISO",
    error: "ERROR",
    verbose: "DETALLE",
  };
  return labels[level] ?? level.toUpperCase();
}

/**
 * @param {import("./signalingLogger.js").LogLevel} level
 * @param {string} event
 * @param {Record<string, unknown>} [context]
 */
export function formatHumanLogLine(level, event, context = {}) {
  const ts = new Date().toISOString();
  const emoji = eventEmoji(level, event);
  const headline = formatHumanLogHeadline(event, context);
  const body = headline.map((line) => `  ${line}`).join("\n");
  return `${ts} [${formatLogLevelLabel(level)}] ${emoji} ${event}\n${body}`;
}

/**
 * @param {string | undefined} raw
 */
export function resolveLogOutputFormat(raw) {
  const normalized = (raw ?? "human").trim().toLowerCase();
  if (normalized === "json" || normalized === "human" || normalized === "both") {
    return normalized;
  }
  return "human";
}
