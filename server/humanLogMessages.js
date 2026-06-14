import { describeCloseCode } from "./wsCloseCodes.js";

const MADRID_RECORDED_AT_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  dateStyle: "short",
  timeStyle: "medium",
});

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
 * @param {Record<string, boolean> | null | undefined} activeBroadcasts
 */
export function formatActiveBroadcastsSummary(activeBroadcasts) {
  if (!activeBroadcasts || typeof activeBroadcasts !== "object") {
    return null;
  }
  const active = Object.entries(activeBroadcasts)
    .filter(([, isActive]) => Boolean(isActive))
    .map(([lang]) => lang);
  if (active.length === 0) {
    return "Ninguna emisión activa en este momento";
  }
  return `Emisiones activas: ${active.join(", ")}`;
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
 * @param {string | null | undefined} clientId
 * @param {Record<string, unknown>} context
 */
function formatClientRef(clientId, context = {}) {
  const id = shortenClientId(clientId);
  const lang = context.language != null ? String(context.language) : null;
  return lang ? `${id} (${lang})` : id;
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
  const listenerId = shortenClientId(
    typeof context.listenerId === "string" ? context.listenerId : null
  );
  const broadcasterId = shortenClientId(
    typeof context.broadcasterId === "string" ? context.broadcasterId : null
  );
  const listeners = formatListenerSummary(
    /** @type {{ totalListeners?: number; byLanguage?: Record<string, number> } | undefined} */ (
      context.listeners
    )
  );
  const listenersLine = listeners ? `Conteo oyentes: ${listeners}` : "";
  const activeBroadcastsLine = formatActiveBroadcastsSummary(
    /** @type {Record<string, boolean> | undefined} */ (context.activeBroadcasts)
  );
  const closeCode =
    typeof context.closeCode === "number" ? context.closeCode : null;
  const closeKind =
    typeof context.closeKind === "string" ? context.closeKind : null;
  const closeHuman = closeKind ? describeCloseKindHuman(closeKind) : null;

  switch (event) {
    case "server.firebase.connected":
      return ["Firebase conectado correctamente (Firestore listo para fechas de evento)"];
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
          : 10_800_000) / 1000
      );
      const verbose =
        context.verboseLogging === true ? "activado" : "desactivado";
      return [
        `Servidor listo en puerto ${port}`,
        `Corte WS por inactividad: ${staleSec} s · Conteo en segundo plano: ${graceSec} s`,
        `Log detallado (SIGNALING_VERBOSE): ${verbose}`,
      ];
    }
    case "server.shutdown.started":
      return [
        `Reinicio o deploy (${context.signal ?? "señal"})`,
        `Clientes WS conectados en ese momento: ${context.connectedClients ?? 0}`,
        activeBroadcastsLine ?? "",
      ].filter(Boolean);
    case "server.shutdown.completed":
      return [`Apagado limpio (${context.signal ?? "señal"})`];
    case "server.shutdown.timeout":
      return [
        `Apagado forzado tras ${formatDurationMs(typeof context.timeoutMs === "number" ? context.timeoutMs : 10000) ?? "10 s"}`,
        "Algunos clientes WebSocket no cerraron a tiempo",
      ];
    case "server.firestore.read_failed":
      return [
        "No se pudo leer la fecha del próximo evento en Firestore",
        `Colección: ${context.collection ?? "events"} · Documento: ${context.doc ?? "next-event"}`,
        typeof context.errorMessage === "string"
          ? `Error: ${context.errorMessage}`
          : "",
      ].filter(Boolean);
    case "server.firestore.write_failed":
      return [
        "No se pudo guardar la fecha del próximo evento en Firestore",
        `Colección: ${context.collection ?? "events"} · Documento: ${context.doc ?? "next-event"}`,
        typeof context.errorMessage === "string"
          ? `Error: ${context.errorMessage}`
          : "",
      ].filter(Boolean);
    case "broadcaster.registered":
      return [
        `Emisión EN VIVO en ${lang ?? "?"}`,
        `Emisor: ${clientId}`,
        listenersLine || "Sin oyentes registrados aún",
        activeBroadcastsLine ?? "",
      ].filter(Boolean);
    case "broadcaster.stopped":
      return [
        `Emisión detenida voluntariamente en ${lang ?? "?"}`,
        listenersLine,
        activeBroadcastsLine ?? "",
      ].filter(Boolean);
    case "broadcaster.disconnected": {
      const replacement =
        typeof context.replacementClientId === "string"
          ? shortenClientId(context.replacementClientId)
          : null;
      const connected = formatDurationMs(
        typeof context.connectedDurationMs === "number"
          ? context.connectedDurationMs
          : null
      );
      return [
        `Emisor ${lang ?? "?"} desconectado${closeCode != null ? ` (código WS ${closeCode})` : ""}`,
        closeHuman ? `Motivo: ${closeHuman}` : "",
        `Sesión emisor: ${clientId}`,
        connected ? `Tiempo emitiendo: ${connected}` : "",
        replacement
          ? `Sesión de respaldo activa: ${replacement}`
          : "No queda otra sesión de emisión en este idioma",
        listenersLine,
      ].filter(Boolean);
    }
    case "broadcaster.replaced_previous":
      return [
        `Nueva emisión ${lang ?? "?"} sustituyó a la sesión anterior`,
        `Sesión anterior: ${shortenClientId(typeof context.previousClientId === "string" ? context.previousClientId : null)}`,
        `Nueva sesión: ${shortenClientId(typeof context.newClientId === "string" ? context.newClientId : null)}`,
      ];
    case "broadcaster.replace_previous_failed":
      return [
        `No se pudo cerrar la sesión de emisión anterior en ${lang ?? "?"}`,
        `Sesión anterior: ${shortenClientId(typeof context.previousClientId === "string" ? context.previousClientId : null)}`,
        typeof context.errorMessage === "string"
          ? `Error: ${context.errorMessage}`
          : "",
      ].filter(Boolean);
    case "auth.broadcaster_rejected":
      return [
        `Registro de emisor rechazado en ${lang ?? "?"}`,
        `Cliente: ${clientId}`,
        `Motivo: ${context.reason ?? "token inválido o expirado"}`,
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
      const connected = formatDurationMs(
        typeof context.connectedDurationMs === "number"
          ? context.connectedDurationMs
          : null
      );
      const idle = formatDurationMs(
        typeof context.idleMs === "number" ? context.idleMs : null
      );
      return [
        `${role} desconectado · ${clientId}${lang ? ` · idioma ${lang}` : ""}${closeCode != null ? ` · código WS ${closeCode}` : ""}`,
        closeHuman ? `Motivo: ${closeHuman}` : "",
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
    case "ws.ping.failed":
      return [
        `Fallo al enviar ping WebSocket a ${formatClientRef(typeof context.clientId === "string" ? context.clientId : null, context)}`,
        typeof context.errorMessage === "string"
          ? `Error: ${context.errorMessage}`
          : "",
      ].filter(Boolean);
    case "ws.server.error":
      return [
        "Error interno del servidor WebSocket",
        typeof context.errorMessage === "string"
          ? `Error: ${context.errorMessage}`
          : "",
      ].filter(Boolean);
    case "signaling.offer.no_broadcaster":
      return [
        `Oyente ${listenerId} pidió audio en ${lang ?? "?"}`,
        "No hay emisor activo en ese idioma",
        activeBroadcastsLine ?? "",
      ].filter(Boolean);
    case "signaling.offer.requested":
      return [
        `Oyente ${listenerId} conectado con emisor ${broadcasterId} en ${lang ?? "?"}`,
      ];
    case "signaling.peer.pruned":
      return [
        `Emisor notificado: oyente ${listenerId} ya no está disponible`,
        `Idioma: ${lang ?? "?"} · Motivo: ${context.reason ?? "desconocido"}`,
      ];
    case "signaling.peer.prune_failed":
      return [
        `No se pudo avisar al emisor que el oyente ${listenerId} se desconectó`,
        `Idioma: ${lang ?? "?"} · Motivo: ${context.reason ?? "desconocido"}`,
        typeof context.errorMessage === "string"
          ? `Error: ${context.errorMessage}`
          : "",
      ].filter(Boolean);
    case "signaling.relay.language_mismatch":
      return [
        `Señal WebRTC ${context.messageType ?? "?"} bloqueada por idioma distinto`,
        `Origen: ${shortenClientId(typeof context.fromClientId === "string" ? context.fromClientId : null)} (${context.fromLanguage ?? "?"})`,
        `Destino: ${shortenClientId(typeof context.targetId === "string" ? context.targetId : null)} (${context.targetLanguage ?? "?"})`,
      ];
    default:
      return [`Evento técnico: ${event}`];
  }
}

/**
 * @param {string} situation
 * @param {string} action
 * @param {string} codeReview
 * @param {string} codeBugs
 * @returns {string[]}
 */
function buildDiagnosisLines(situation, action, codeReview, codeBugs) {
  return [
    situation,
    action,
    `Código a revisar: ${codeReview}`,
    `Posibles fallos en código: ${codeBugs}`,
  ];
}

/**
 * @param {import("./signalingLogger.js").LogLevel} level
 * @param {string} event
 * @param {Record<string, unknown>} context
 * @returns {{ lines: string[]; isOk: boolean }}
 */
export function formatHumanLogDiagnosis(level, event, context = {}) {
  const isIntentionalDisconnect =
    context.intentionalStop === true ||
    context.closeKind === "normal_closure" ||
    context.closeCode === 1000 ||
    context.closeKind === "replaced_by_reconnect" ||
    context.closeCode === 4002;

  /** @type {Set<string>} */
  const okInfoEvents = new Set([
    "server.firebase.connected",
    "server.started",
    "server.shutdown.completed",
    "broadcaster.registered",
    "broadcaster.replaced_previous",
    "broadcaster.stopped",
    "listener.stopped",
    "ws.client.duplicate_replaced",
    "ws.client.language_restored",
    "signaling.peer.pruned",
    "signaling.offer.requested",
  ]);

  if (level === "info" && okInfoEvents.has(event)) {
    return { lines: [], isOk: true };
  }
  if (
    level === "info" &&
    event === "ws.client.disconnected" &&
    isIntentionalDisconnect
  ) {
    return { lines: [], isOk: true };
  }

  const hasBroadcasterReplacement =
    typeof context.replacementClientId === "string";

  /** @type {Record<string, string[]>} */
  const diagnosisByEvent = {
    "server.shutdown.started": buildDiagnosisLines(
      "Qué implica: durante unos segundos los clientes pueden perder la conexión WebSocket hasta que el servidor vuelva a arrancar.",
      "Acción: si ocurre en plena emisión, esperar al reinicio; si es frecuente, revisar despliegues automáticos o cold starts del plan de Render.",
      "server/gracefulShutdown.js (registerGracefulShutdown, shutdown) · server/server.js (registerGracefulShutdown al final del arranque) · client/src/signalingReconnect.js y EbenEzerLive-MOBILE/src/streaming/listenerRecovery.ts (reconexión tras server-shutdown)",
      "El mensaje server-shutdown no llega a todos los clientes si el socket ya estaba cerrando; server.close() no espera a que cada WS termine el handshake; en cliente, el retry tras shutdown puede no reenviar broadcaster si el token expiró durante el deploy."
    ),
    "server.shutdown.timeout": buildDiagnosisLines(
      "Por qué está mal: el proceso no pudo cerrar todos los sockets antes del límite; puede dejar clientes colgados o cortar la emisión de forma brusca.",
      "Acción: revisar picos de conexiones simultáneas, aumentar el timeout de apagado o reducir clientes zombie (revisar WS_STALE_AFTER_MS).",
      "server/gracefulShutdown.js (setTimeout 10 s antes de process.exit) · server/server.js (heartbeatInterval y wss.clients)",
      "Timeout fijo de 10 s insuficiente con muchos oyentes; sockets que no responden a close() bloquean server.close(); clientes en segundo plano no procesan server-shutdown y quedan en estado inconsistente hasta reconectar."
    ),
    "server.firestore.read_failed": buildDiagnosisLines(
      "Por qué está mal: la web no puede leer la fecha del próximo culto desde Firestore; se usa una fecha por defecto.",
      "Acción: verificar credenciales FIREBASE_SERVICE_ACCOUNT en Render, reglas de Firestore y conectividad a Firebase.",
      "server/server.js (GET /next-event, admin.initializeApp, db.collection('events').doc('next-event')) · variables FIREBASE_SERVICE_ACCOUNT en Render",
      "JSON de service account mal formateado o truncado en env; reglas Firestore deniegan lectura anónima; el catch devuelve fecha hardcodeada y oculta el fallo en la UI; doc next-event inexistente y el set inicial también falla por permisos."
    ),
    "server.firestore.write_failed": buildDiagnosisLines(
      "Por qué está mal: un administrador no pudo guardar la fecha del evento; el cambio no se persistió.",
      "Acción: comprobar token de admin, permisos de Firestore y que el documento events/next-event sea escribible.",
      "server/server.js (POST /next-event, verifyToken) · client (panel admin que llama /next-event)",
      "verifyToken rechaza token expirado (12 h en jwt.sign); SECRET_KEY distinta entre Render y el cliente que generó el token; reglas Firestore solo permiten lectura; FieldValue.serverTimestamp() falla si el reloj del servidor está desincronizado."
    ),
    "broadcaster.disconnected": hasBroadcasterReplacement
      ? buildDiagnosisLines(
          "Qué implica: el emisor principal se cayó pero hay otra sesión de respaldo en el mismo idioma; la emisión puede continuar.",
          "Acción: confirmar que la sesión de respaldo sigue emitiendo; si no, reabrir la app de emisión.",
          "server/server.js (ws.on('close'), findStandbyBroadcaster, broadcasters/activeBroadcasts) · server/broadcasterStandby.js (findStandbyBroadcaster) · client/src/Broadcaster.js · EbenEzerLive-MOBILE/App.tsx (registro broadcaster y WebRTC)",
          "findStandbyBroadcaster elige por broadcasterRegisteredAt y puede tomar una pestaña vieja sin micrófono activo; la sesión de respaldo no reenvía active-broadcasts a oyentes ya conectados; el emisor de respaldo no recibe request-offer de oyentes que ya tenían peer con el emisor caído."
        )
      : buildDiagnosisLines(
          "Por qué está mal: no hay emisor activo en este idioma; los oyentes seguirán conectados al servidor pero sin audio.",
          "Acción: el operador debe reabrir la app de emisión y volver a iniciar transmisión; revisar red/WiFi, batería y que Android no haya matado la app en segundo plano.",
          "server/server.js (ws.on('close') líneas ~765-795, handleWsBroadcasterRegister, handleWsRequestOffer) · server/broadcasterStandby.js · client/src/Broadcaster.js · EbenEzerLive-MOBILE/App.tsx y local-modules (servicio en primer plano Android)",
          "activeBroadcasts[lang] queda false pero oyentes no reciben aviso explícito de emisión caída; findStandbyBroadcaster no encuentra socket con isBroadcaster=true; en móvil, el WS se corta en segundo plano si el foreground service no está activo; WS_STALE_AFTER_MS demasiado bajo mata al emisor Android."
        ),
    "broadcaster.replace_previous_failed": buildDiagnosisLines(
      "Por qué está mal: la nueva emisión se registró pero el socket anterior no se cerró; puede haber dos sesiones compitiendo.",
      "Acción: pedir al operador que cierre pestañas/apps duplicadas del emisor; reiniciar la app de emisión si el audio falla.",
      "server/server.js (handleWsBroadcasterRegister, prev.close(4000)) · client/src/Broadcaster.js (múltiples envíos type: broadcaster al reconectar)",
      "prev.close() lanza si el socket ya está CLOSING/CLOSED y el catch solo loguea sin limpiar broadcasters[lang]; dos pestañas envían broadcaster casi a la vez y la segunda gana pero la primera sigue emitiendo WebRTC; reconexión automática del cliente re-registra sin cerrar la sesión zombie."
    ),
    "auth.broadcaster_rejected": buildDiagnosisLines(
      "Por qué está mal: alguien intentó emitir sin un token JWT válido de administrador.",
      "Acción: volver a iniciar sesión en el panel de emisión o renovar el token en la app móvil; comprobar que SECRET_KEY en Render coincide con el entorno del cliente.",
      "server/server.js (handleWsBroadcasterRegister, verifyToken, POST /login) · client/src/Broadcaster.js (token en mensaje broadcaster) · EbenEzerLive-MOBILE/App.tsx (token al registrar emisor)",
      "Token guardado en localStorage/AsyncStorage expirado (expiresIn 12h); SECRET_KEY ausente o distinta en Render; mensaje broadcaster enviado antes de completar login; verifyToken devuelve null por JWT malformado y el cliente no muestra error claro al usuario."
    ),
    "ws.client.disconnected": buildDiagnosisLines(
      context.role === "broadcaster"
        ? "Qué implica: el socket del emisor se cortó; si no hay reemplazo, la audiencia deja de recibir audio."
        : "Qué implica: un oyente perdió la señal WebSocket; suele reconectar solo si la app sigue abierta.",
      context.closeKind === "abnormal_no_close_frame"
        ? "Acción: en móvil, suele ser red o segundo plano; si es masivo, revisar estabilidad de red del servidor o límites del plan de Render."
        : "Acción: si es un caso aislado, normalmente no requiere intervención; si es masivo, revisar reinicios del servidor o caídas de red.",
      context.role === "broadcaster"
        ? "server/server.js (ws.on('close'), heartbeatInterval) · server/wsCloseCodes.js (describeCloseCode) · client/src/Broadcaster.js · EbenEzerLive-MOBILE/App.tsx y local-modules/index.js (foreground service)"
        : "server/server.js (ws.on('close')) · server/wsCloseCodes.js · client/src/Listener.js · client/src/signalingReconnect.js · EbenEzerLive-MOBILE/src/streaming/listenerRecovery.ts",
      context.closeKind === "abnormal_no_close_frame"
        ? "Código 1006 sin close frame: red móvil inestable o OS mató el proceso; el oyente no llama a identify tras reconectar y pierde idioma persistido; el emisor en Android sin foreground service deja de responder pong y luego cae."
        : context.role === "broadcaster"
          ? "Cierre 1001 going_away al cerrar pestaña pero activeBroadcasts no se actualiza si broadcasters[lang] !== ws; reconexión del emisor tarda y hay ventana sin broadcaster.registered."
          : "Cierre 1000 no limpia sesión si shouldUpdateListenerCountOnClose devuelve false; identify tardío deja language null en el socket nuevo hasta register-listener."
    ),
    "ws.client.stale_closed": buildDiagnosisLines(
      "Por qué está mal: el cliente dejó de enviar actividad (ping/pong o mensajes) más tiempo del permitido; el servidor cerró el socket para liberar recursos.",
      "Acción: si afecta al emisor en Android, subir WS_STALE_AFTER_MS en Render; si afecta a oyentes en segundo plano, revisar LISTENER_BACKGROUND_GRACE_MS.",
      "server/server.js (heartbeatInterval, shouldEnforceStaleDisconnect, WS_STALE_AFTER_MS) · server/broadcasterStandby.js (parseStaleAfterMs) · server/listenerCount.js (parseListenerBackgroundGraceMs) · EbenEzerLive-MOBILE/local-modules/index.js",
      "WS_STALE_AFTER_MS por defecto 300 s demasiado bajo para emisor Android en segundo plano; touchClientActivity solo en message/pong pero algunos clientes no envían ping propio; stale cierra oyente pero LISTENER_BACKGROUND_GRACE_MS mantiene conteo fantasma; emisor cortado con 4001 no activa findStandbyBroadcaster si isBroadcaster ya se limpió."
    ),
    "ws.client.duplicate_replaced": buildDiagnosisLines(
      "Qué implica: el mismo dispositivo abrió un socket nuevo; el antiguo se cerró de forma esperada.",
      "Acción: ninguna si el audio sigue funcionando; si no, pedir al usuario que recargue la página o reabra la app.",
      "server/identifyClient.js (applyClientIdentify) · server/server.js (handleWsIdentify) · client/src/signalingReconnect.js · EbenEzerLive-MOBILE/src/streaming/listenerRecovery.ts",
      "El socket nuevo no reenvía register-listener/request-offer a tiempo y el audio tarda en volver; restoredLanguage en identify no coincide con el idioma WebRTC activo; el socket antiguo cerrado con 4002 pero el peer RTCPeerConnection del cliente sigue apuntando al id viejo."
    ),
    "ws.ping.failed": buildDiagnosisLines(
      "Por qué está mal: el servidor no pudo enviar keepalive a ese cliente; la conexión puede estar rota o el socket ya inválido.",
      "Acción: si se repite para el mismo emisor, revisar red del dispositivo; si es generalizado, revisar carga del servidor o reinicios en Render.",
      "server/server.js (heartbeatInterval, client.ping()) · server/signalingLogger.js (buildClientLogContext)",
      "ping() lanza si readyState no es OPEN pero el cliente sigue en wss.clients; bucle heartbeat no elimina sockets rotos hasta stale_closed; muchos clientes en ping simultáneo satura el event loop en plan gratis de Render."
    ),
    "ws.server.error": buildDiagnosisLines(
      "Por qué está mal: el servidor WebSocket encontró un error no recuperable; puede afectar a todas las conexiones activas.",
      "Acción: revisar el stack en el log, métricas de Render (OOM/restarts) y reiniciar el servicio si el error persiste.",
      "server/server.js (wss.on('error'), WebSocketServer constructor) · dependencia ws",
      "EADDRINUSE si el puerto ya está ocupado en local; OOM por demasiadas conexiones o messageQueue sin límite global; error no manejado en ws.on('message') que tumba el proceso según versión de Node/ws."
    ),
    "signaling.offer.no_broadcaster": buildDiagnosisLines(
      "Por qué está mal: un oyente pidió audio pero no hay emisor registrado en ese idioma (emisión no iniciada o emisor caído).",
      "Acción: confirmar que la app de emisión está en vivo en el idioma correcto; revisar logs broadcaster.registered y broadcaster.disconnected previos.",
      "server/server.js (handleWsRequestOffer, broadcasters[], activeBroadcasts) · client/src/Listener.js (request-offer) · client/src/Broadcaster.js (handler request-offer) · EbenEzerLive-MOBILE/App.tsx y src/streaming/listenerRecovery.ts",
      "broadcasters[lang] es null pero activeBroadcasts aún true por desincronización tras disconnect; targetBroadcaster.readyState !== OPEN y cae en rama no_broadcaster sin distinguir emisor caído vs nunca iniciado; oyente pide idioma distinto al que emite el operador; carrera entre request-offer y broadcaster.registered al inicio del culto."
    ),
    "signaling.peer.prune_failed": buildDiagnosisLines(
      "Por qué está mal: el emisor no fue avisado de que un oyente se desconectó; puede quedar un peer WebRTC zombie en el dispositivo emisor.",
      "Acción: si el emisor acumula conexiones, pedir reinicio de la app de emisión; revisar estabilidad del socket del broadcaster.",
      "server/server.js (notifyBroadcasterStopListener, buildStopConnectionPayload) · server/signalingTarget.js (resolveBroadcasterSocket) · client/src/Broadcaster.js (handler stop-connection)",
      "bc.send() falla si el socket del emisor está saturado o cerrando; resolveBroadcasterSocket devuelve null y solo loguea verbose en prune_skipped; el emisor no elimina RTCPeerConnection al no recibir stop-connection; buffer messageQueue del oyente sigue enviando ICE a un peer muerto."
    ),
    "signaling.relay.language_mismatch": buildDiagnosisLines(
      "Por qué está mal: se intentó reenviar SDP/ICE entre clientes de idiomas distintos; la señal se descartó para evitar cruces.",
      "Acción: revisar que cada oyente eligió el idioma correcto y que el emisor solo envía al idioma que emite.",
      "server/signalingRelay.js (canRelaySignaling, getEffectiveLanguage) · server/clientSessions.js · server/server.js (handleWsSignalingRelay) · client/src/Broadcaster.js y Listener.js (campo target en offer/answer/candidate)",
      "getEffectiveLanguage devuelve null tras reconexión si register-listener no llegó aún; sessionStore con idioma antiguo tras cambio de idioma en UI; target incorrecto en mensaje ICE del emisor; oyente y emisor en idiomas distintos por bug en selectedLanguage del cliente."
    ),
  };

  if (diagnosisByEvent[event]) {
    return { lines: diagnosisByEvent[event], isOk: false };
  }

  if (level === "error") {
    return {
      lines: buildDiagnosisLines(
        "Por qué está mal: el servidor registró un error que puede afectar la emisión o la señalización.",
        "Acción: buscar este evento en Render, revisar el contexto del log y correlacionar con métricas /signaling/metrics.",
        "server/server.js (buscar signalingLog.error con el slug del evento) · server/humanLogMessages.js (formatHumanLogHeadline para ese event) · server/signalingMetrics.js (/signaling/metrics)",
        "Evento sin entrada específica en humanLogMessages.js; errorMessage en contexto vacío o genérico; excepción tragada en try/catch que solo loguea sin recuperar estado (broadcasters, activeBroadcasts, clientSessions)."
      ),
      isOk: false,
    };
  }

  if (level === "warn") {
    return {
      lines: buildDiagnosisLines(
        "Qué implica: situación anómala durante la emisión o la conexión de un cliente.",
        "Acción: revisar el contexto anterior en los logs; si se repite, investigar red, dispositivo emisor o configuración en Render.",
        "server/server.js (buscar signalingLog.warn con el slug del evento) · server/humanLogMessages.js · cliente web (client/src/) o móvil (EbenEzerLive-MOBILE/) según role en el log",
        "Aviso sin diagnóstico detallado en humanLogMessages.js; contexto del log incompleto (falta clientId, language o listeners); condición de carrera entre handlers WS no contemplada en el switch del evento."
      ),
      isOk: false,
    };
  }

  return { lines: [], isOk: false };
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
 * Footer appended to every human log line so Render live-tail delay can be
 * compared against the instant the server actually emitted the event.
 *
 * @param {string} isoTs
 */
export function formatServerRecordedAtFooter(isoTs) {
  const date = new Date(isoTs);
  if (Number.isNaN(date.getTime())) {
    return `Registrado servidor: ${isoTs}`;
  }
  const madrid = MADRID_RECORDED_AT_FORMATTER.format(date);
  return `Registrado servidor: ${madrid} (Madrid) · ${isoTs} (UTC)`;
}

/**
 * @param {import("./signalingLogger.js").LogLevel} level
 * @param {string} event
 * @param {Record<string, unknown>} [context]
 * @param {string} [recordedAt] ISO timestamp shared with JSON payload `ts`
 */
export function formatHumanLogLine(level, event, context = {}, recordedAt) {
  const ts = recordedAt ?? new Date().toISOString();
  const emoji = eventEmoji(level, event);
  const headline = formatHumanLogHeadline(event, context);
  const { lines: diagnosis, isOk } = formatHumanLogDiagnosis(
    level,
    event,
    context
  );
  const bodyLines = [...headline, ...diagnosis];
  if (isOk) {
    bodyLines.push("OK");
  }
  bodyLines.push(formatServerRecordedAtFooter(ts));
  const body = bodyLines.map((line) => `  ${line}`).join("\n");
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
