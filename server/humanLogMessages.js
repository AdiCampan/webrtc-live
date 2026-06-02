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
    normal_closure: "cierre normal",
    going_away: "pestaña o app cerrada",
    abnormal_no_close_frame: "conexión cortada sin aviso (red o segundo plano)",
    replaced_by_new_registration: "reemplazado por otra sesión de emisión",
    stale_connection: "inactivo demasiado tiempo",
    replaced_by_reconnect: "reconexión del mismo dispositivo",
  };
  return known[closeKind] ?? closeKind;
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} context
 */
export function formatHumanLogMessage(event, context = {}) {
  const lang = context.language != null ? String(context.language) : null;
  const clientId = shortenClientId(
    typeof context.clientId === "string" ? context.clientId : null
  );
  const listeners = formatListenerSummary(
    /** @type {{ totalListeners?: number; byLanguage?: Record<string, number> } | undefined} */ (
      context.listeners
    )
  );
  const listenersSuffix = listeners ? `. Quedan ${listeners}` : "";
  const idle = formatDurationMs(
    typeof context.idleMs === "number" ? context.idleMs : null
  );
  const connected = formatDurationMs(
    typeof context.connectedDurationMs === "number"
      ? context.connectedDurationMs
      : null
  );
  const closeCode =
    typeof context.closeCode === "number" ? context.closeCode : null;
  const closeKind =
    typeof context.closeKind === "string"
      ? context.closeKind
      : closeCode != null
        ? describeCloseCode(closeCode)
        : null;
  const closeHuman = closeKind ? describeCloseKindHuman(closeKind) : null;

  switch (event) {
    case "server.firebase.connected":
      return "Firebase conectado correctamente";
    case "server.started": {
      const port = context.port ?? "8080";
      const staleSec = Math.round(
        (typeof context.wsStaleAfterMs === "number"
          ? context.wsStaleAfterMs
          : 300000) / 1000
      );
      return `Servidor listo en puerto ${port} (corte por inactividad WS: ${staleSec} s)`;
    }
    case "server.shutdown.started":
      return `Reinicio o deploy en curso (${context.signal ?? "señal"}). Clientes conectados: ${context.connectedClients ?? 0}`;
    case "server.shutdown.completed":
      return `Apagado limpio completado (${context.signal ?? "señal"})`;
    case "server.shutdown.timeout":
      return `Apagado forzado tras ${formatDurationMs(typeof context.timeoutMs === "number" ? context.timeoutMs : 10000) ?? "10 s"} — algunos clientes no cerraron a tiempo`;
    case "server.firestore.read_failed":
      return `Error leyendo fecha del evento en Firestore: ${context.errorMessage ?? "desconocido"}`;
    case "server.firestore.write_failed":
      return `Error guardando fecha del evento en Firestore: ${context.errorMessage ?? "desconocido"}`;
    case "server.firestore.event_updated":
      return `Fecha del próximo evento actualizada: ${context.date ?? "—"}`;
    case "broadcaster.registered":
      return `Emisión iniciada en ${lang ?? "?"}. ${listeners || "Sin oyentes aún"}`;
    case "broadcaster.stopped":
      return `Emisión detenida en ${lang ?? "?"}${listenersSuffix}`;
    case "broadcaster.disconnected": {
      const replacement =
        typeof context.replacementClientId === "string"
          ? shortenClientId(context.replacementClientId)
          : null;
      const replacementText = replacement
        ? `. Otra sesión de emisión sigue activa (${replacement})`
        : ". No hay otra sesión de emisión activa";
      return `Emisor ${lang ?? "?"} desconectado (${closeHuman ?? "desconocido"})${replacementText}${listenersSuffix}`;
    }
    case "broadcaster.replaced_previous":
      return `Nueva sesión de emisión ${lang ?? "?"} reemplazó a la anterior (${shortenClientId(typeof context.previousClientId === "string" ? context.previousClientId : null)})`;
    case "broadcaster.replace_previous_failed":
      return `No se pudo cerrar la sesión anterior del emisor ${lang ?? "?"}: ${context.errorMessage ?? "error desconocido"}`;
    case "listener.stopped":
      return `Oyente ${clientId} dejó de escuchar ${lang ?? "?"}${listenersSuffix}`;
    case "ws.client.disconnected": {
      const role =
        context.role === "broadcaster"
          ? "Emisor"
          : context.role === "listener"
            ? "Oyente"
            : "Cliente";
      const duration = connected ? `, conectado ${connected}` : "";
      const idleText = idle ? `, inactivo ${idle}` : "";
      const intentional =
        context.intentionalStop === true ? " (parada voluntaria)" : "";
      return `${role} ${clientId}${lang ? ` (${lang})` : ""} desconectado: ${closeHuman ?? "motivo desconocido"}${intentional}${duration}${idleText}${listenersSuffix}`;
    }
    case "ws.client.stale_closed": {
      const thresholdSec = Math.round(
        (typeof context.staleThresholdMs === "number"
          ? context.staleThresholdMs
          : 300000) / 1000
      );
      return `Conexión fantasma cerrada: oyente ${clientId}${lang ? ` (${lang})` : ""} sin actividad durante ${idle ?? "?"} (límite ${thresholdSec} s)${listenersSuffix}`;
    }
    case "ws.client.duplicate_replaced":
      return `Reconexión del mismo dispositivo ${clientId}${lang ? ` (${lang})` : ""}: se cerró el socket antiguo`;
    case "ws.client.language_restored":
      return `Sesión restaurada para ${clientId}: sigue escuchando ${context.language ?? lang ?? "?"}`;
    case "ws.client.connected":
      return `Nuevo cliente conectado (${clientId}). Total conexiones WS: ${context.totalConnections ?? "?"}`;
    case "ws.client.identified":
      return `Cliente identificado como ${clientId}${context.restoredLanguage ? `, idioma restaurado ${context.restoredLanguage}` : ""}`;
    case "ws.client.duplicate_closed":
      return `Socket duplicado cerrado para ${clientId}`;
    case "ws.message.received":
      return `Mensaje recibido de ${clientId}: ${context.messageType ?? "?"}`;
    case "ws.message.parse_failed":
      return `Mensaje JSON inválido de ${clientId}`;
    case "signaling.offer.no_broadcaster":
      return `Oyente ${clientId} pidió audio en ${lang ?? "?"} pero no hay emisor activo`;
    case "signaling.offer.requested":
      return `Oyente ${clientId} (${lang ?? "?"}) solicitó oferta WebRTC al emisor`;
    case "signaling.peer.pruned":
      return `Emisor avisado para cerrar peer del oyente ${shortenClientId(typeof context.listenerId === "string" ? context.listenerId : null)} (${context.reason ?? "desconocido"})`;
    case "signaling.peer.prune_skipped":
      return `No se pudo avisar al emisor para cerrar peer de ${shortenClientId(typeof context.listenerId === "string" ? context.listenerId : null)}: sin emisor disponible`;
    case "signaling.peer.prune_failed":
      return `Fallo avisando al emisor para cerrar peer de ${shortenClientId(typeof context.listenerId === "string" ? context.listenerId : null)}: ${context.errorMessage ?? "error desconocido"}`;
    case "signaling.relay.language_mismatch":
      return `Señal WebRTC ignorada por idioma incompatible (${context.messageType ?? "?"}) entre ${shortenClientId(typeof context.fromClientId === "string" ? context.fromClientId : null)} y ${shortenClientId(typeof context.targetId === "string" ? context.targetId : null)}`;
    case "signaling.relay.forwarded":
      return `Señal WebRTC ${context.messageType ?? "?"} reenviada de ${shortenClientId(typeof context.fromClientId === "string" ? context.fromClientId : null)} a ${shortenClientId(typeof context.targetId === "string" ? context.targetId : null)}`;
    case "signaling.relay.buffered":
      return `Señal WebRTC ${context.messageType ?? "?"} en cola para ${shortenClientId(typeof context.targetId === "string" ? context.targetId : null)} (destino temporalmente no listo)`;
    case "signaling.relay.dropped":
      return `Señal WebRTC ${context.messageType ?? "?"} descartada: destino ${shortenClientId(typeof context.targetId === "string" ? context.targetId : null)} no existe`;
    case "signaling.message.buffered":
      return `Mensaje ${context.messageType ?? "?"} en cola para ${shortenClientId(typeof context.targetId === "string" ? context.targetId : null)} (${context.queueSize ?? "?"} en cola)`;
    case "signaling.message.flushed":
      return `Cola de mensajes entregada a ${clientId} (${context.messageCount ?? "?"} mensajes)`;
    case "auth.broadcaster_rejected":
      return `Intento de emisión rechazado en ${lang ?? "?"}: token inválido o expirado`;
    case "ws.server.error":
      return `Error del servidor WebSocket: ${context.errorMessage ?? "desconocido"}`;
    case "ws.ping.failed":
      return `No se pudo enviar ping al cliente ${clientId}: ${context.errorMessage ?? "error desconocido"}`;
    default:
      return `Evento ${event}`;
  }
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
  const message = formatHumanLogMessage(event, context);
  return `${ts} [${formatLogLevelLabel(level)}] ${message} · ${event}`;
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
