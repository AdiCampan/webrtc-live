import express from "express";
import { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import cors from "cors";
import admin from "firebase-admin";

import { createDebouncedCallback } from "./listenerCountScheduler.js";
import {
  buildListenerCountPayload,
  computeListenerCounts,
  parseListenerBackgroundGraceMs,
} from "./listenerCount.js";
import { createClientSessionStore } from "./clientSessions.js";
import { applyClientIdentify } from "./identifyClient.js";
import { canRelaySignaling } from "./signalingRelay.js";
import {
  buildStopConnectionPayload,
  isSignalingTargetOnline,
  resolveBroadcasterSocket,
  shouldBufferSignalingForTarget,
  shouldNotifyBroadcasterOnListenerClose,
  shouldUpdateListenerCountOnClose,
} from "./signalingTarget.js";
import {
  clearListenerSession,
  handleRegisterListener,
  hasActiveBroadcaster,
  persistListenerLanguage,
} from "./registerListener.js";
import {
  findStandbyBroadcaster,
  parseStaleAfterMs,
} from "./broadcasterStandby.js";
import {
  buildSignalingMetricsPayload,
  recordBroadcasterRegistration,
  recordSignalingError,
} from "./signalingMetrics.js";
import { registerGracefulShutdown } from "./gracefulShutdown.js";
import {
  buildClientLogContext,
  createSignalingLogger,
  describeCloseCode,
  errorFields,
  isVerboseLoggingEnabled,
} from "./signalingLogger.js";

dotenv.config();

const signalingLog = createSignalingLogger({
  verboseEnabled: isVerboseLoggingEnabled(process.env.SIGNALING_VERBOSE),
  onErrorRecorded: recordSignalingError,
});

// 🔹 Definir __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const SECRET_KEY = process.env.SECRET_KEY;

// Middleware
app.use(cors());
app.use(express.json());

// Usuarios administradores desde .env
const users = [
  {
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
    role: "broadcaster",
  },
];

// =====================================================
// 🟢 ENDPOINTS API
// =====================================================

// Endpoint login
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = users.find(
    (u) => u.username === username && u.password === password
  );

  if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

  const token = jwt.sign(
    { username: user.username, role: user.role },
    SECRET_KEY,
    { expiresIn: "12h" }
  );

  res.json({ token, role: user.role });
});

// Middleware para verificar JWT
const verifyToken = (token) => {
  try {
    return jwt.verify(token, SECRET_KEY);
  } catch {
    return null;
  }
};


// Inicializar Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
signalingLog.info("server.firebase.connected");

function parseListenerCountDebounceMs() {
  const raw = Number.parseInt(process.env.LISTENER_COUNT_DEBOUNCE_MS ?? "500", 10);
  if (!Number.isFinite(raw)) return 500;
  return Math.min(Math.max(raw, 50), 15000);
}

// Obtener fecha del evento desde Firestore
app.get("/next-event", async (req, res) => {
  try {
    const docRef = db.collection('events').doc('next-event');
    const doc = await docRef.get();
    
    if (doc.exists) {
      const date = doc.data().date || "2025-10-15T12:00:00";
      res.json({ date });
    } else {
      // Si no existe, crear con fecha por defecto
      const defaultDate = "2025-10-15T12:00:00";
      await docRef.set({ date: defaultDate, updatedAt: new Date() });
      res.json({ date: defaultDate });
    }
  } catch (err) {
    signalingLog.error("server.firestore.read_failed", {
      collection: "events",
      doc: "next-event",
      ...errorFields(err),
    });
    recordSignalingError(
      err instanceof Error ? err.message : "Firestore next-event read failed"
    );
    res.json({ date: "2025-10-15T12:00:00" });
  }
});

// Actualizar fecha en Firestore
app.post("/next-event", async (req, res) => {
  const { date, token } = req.body;
  const decoded = verifyToken(token);
  if (decoded?.role !== "broadcaster") {
    return res.status(403).json({ error: "No autorizado" });
  }

  try {
    const docRef = db.collection('events').doc('next-event');
    await docRef.set({ 
      date, 
      updatedAt: admin.firestore.FieldValue.serverTimestamp() 
    });
    signalingLog.verbose("server.firestore.event_updated", { date });
    res.json({ success: true, date });
  } catch (err) {
    signalingLog.error("server.firestore.write_failed", {
      collection: "events",
      doc: "next-event",
      ...errorFields(err),
    });
    recordSignalingError(
      err instanceof Error ? err.message : "Firestore next-event write failed"
    );
    res.status(500).json({ error: "Error guardando fecha" });
  }
});




// =====================================================
// 🎨 Servir el frontend de React
// =====================================================
const clientBuildPath = path.join(__dirname, "../client/build");
app.use(express.static(clientBuildPath));

const WS_OPEN = 1;
const WS_STALE_CHECK_MS = 15000;
const WS_STALE_AFTER_MS = parseStaleAfterMs(
  process.env.WS_STALE_AFTER_MS,
  300000
);
const LISTENER_BACKGROUND_GRACE_MS = parseListenerBackgroundGraceMs(
  process.env.LISTENER_BACKGROUND_GRACE_MS
);

// =====================================================
// 🌐 WebSocket Server
// =====================================================
const server = app.listen(PORT, () => {
  signalingLog.info("server.started", {
    port: PORT,
    wsStaleAfterMs: WS_STALE_AFTER_MS,
    wsStaleCheckMs: WS_STALE_CHECK_MS,
    listenerBackgroundGraceMs: LISTENER_BACKGROUND_GRACE_MS,
    verboseLogging: signalingLog.verboseEnabled,
  });
});

const wss = new WebSocketServer({ server });

wss.on("error", (err) => {
  signalingLog.error("ws.server.error", errorFields(err));
});

const broadcasters = {}; // { es: ws, en: ws, ro: ws }
const activeBroadcasts = { es: false, en: false, ro: false };
const clientSessions = createClientSessionStore();

function snapshotListenersForLog() {
  return computeListenerCounts(
    wss.clients,
    clientSessions,
    LISTENER_BACKGROUND_GRACE_MS
  );
}

function touchListenerSession(ws) {
  if (ws.id && ws.language && !ws.isBroadcaster) {
    clientSessions.touchListener(ws.id);
  }
}

app.get("/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    uptimeSeconds: Math.floor(process.uptime()),
    websocketClients: wss.clients.size,
  });
});

// Operational snapshot (JSON): same host as the app, e.g. https://<host>/signaling/metrics
// or http://localhost:<PORT>/signaling/metrics — not linked from the SPA; use for monitoring.
app.get("/signaling/metrics", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(
    buildSignalingMetricsPayload({
      clients: wss.clients,
      broadcasters,
      uptimeSeconds: Math.floor(process.uptime()),
      totalConnections: wss.clients.size,
    })
  );
});

app.get("/*", (req, res) => {
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

function touchClientActivity(ws) {
  ws.lastClientActivityAt = Date.now();
}

function shouldEnforceStaleDisconnect(ws) {
  return Boolean(ws.isBroadcaster || ws.language);
}

const heartbeatInterval = setInterval(() => {
  const now = Date.now();
  wss.clients.forEach((client) => {
    if (client.readyState !== WS_OPEN) return;
    if (shouldEnforceStaleDisconnect(client)) {
      const last = client.lastClientActivityAt ?? 0;
      if (now - last > WS_STALE_AFTER_MS) {
        signalingLog.warn("ws.client.stale_closed", {
          ...buildClientLogContext(client),
          staleThresholdMs: WS_STALE_AFTER_MS,
          listeners: snapshotListenersForLog(),
        });
        if (client.id && client.language) {
          clientSessions.clearListenerLanguage(client.id);
        }
        try {
          client.close(4001, "stale_connection");
        } catch {
          client.terminate();
        }
        return;
      }
    }
    try {
      client.ping();
    } catch (err) {
      signalingLog.warn("ws.ping.failed", {
        ...buildClientLogContext(client),
        ...errorFields(err),
      });
    }
  });
}, WS_STALE_CHECK_MS);

server.on("close", () => clearInterval(heartbeatInterval));

// 🔹 Buffer de mensajes para clientes desconectados temporalmente (60s vida útil)
const messageQueue = {}; // { clientId: [{msg, expiry}, ...] }

function clearMessageQueueForTarget(targetId) {
  delete messageQueue[targetId];
}

function notifyBroadcasterStopListener(listenerId, options = {}) {
  const { language, broadcasterSocket, reason = "unknown" } = options;
  clearMessageQueueForTarget(listenerId);
  const bc = resolveBroadcasterSocket(
    broadcasters,
    language,
    broadcasterSocket
  );
  if (!bc) {
    signalingLog.verbose("signaling.peer.prune_skipped", {
      listenerId,
      language: language ?? null,
      reason,
    });
    return;
  }
  try {
    bc.send(JSON.stringify(buildStopConnectionPayload(listenerId)));
    signalingLog.info("signaling.peer.pruned", {
      listenerId,
      language: language ?? null,
      reason,
      broadcasterId: bc.id ?? null,
    });
  } catch (err) {
    signalingLog.error("signaling.peer.prune_failed", {
      listenerId,
      language: language ?? null,
      reason,
      ...errorFields(err),
    });
  }
}

function pushToQueue(clientId, message) {
  if (!messageQueue[clientId]) messageQueue[clientId] = [];
  messageQueue[clientId].push({
    message,
    expiry: Date.now() + 60000 // Expira en 60 segundos
  });
  // Limitar tamaño del buffer por seguridad
  if (messageQueue[clientId].length > 50) messageQueue[clientId].shift();
  signalingLog.verbose("signaling.message.buffered", {
    targetId: clientId,
    queueSize: messageQueue[clientId].length,
    messageType: message.type ?? null,
  });
}

function flushQueue(ws) {
  const queue = messageQueue[ws.id];
  if (!queue || queue.length === 0) return;

  signalingLog.verbose("signaling.message.flushed", {
    clientId: ws.id,
    messageCount: queue.length,
  });
  const now = Date.now();
  queue.forEach(item => {
    if (item.expiry > now && ws.readyState === WS_OPEN) {
      ws.send(JSON.stringify(item.message));
    }
  });
  delete messageQueue[ws.id];
}

// Limpieza periódica del buffer global cada minuto
setInterval(() => {
  const now = Date.now();
  Object.keys(messageQueue).forEach(id => {
    messageQueue[id] = messageQueue[id].filter(item => item.expiry > now);
    if (messageQueue[id].length === 0) delete messageQueue[id];
  });
}, 60000);

// 🔹 Función para enviar un mensaje a todos los clientes conectados
function broadcastToAll(message) {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WS_OPEN) client.send(payload);
  });
}

// 🔹 Función para actualizar conteo de oyentes por idioma
function updateListenerCounts() {
  clientSessions.purgeExpiredSessions(LISTENER_BACKGROUND_GRACE_MS);
  const counts = buildListenerCountPayload(
    wss.clients,
    clientSessions,
    LISTENER_BACKGROUND_GRACE_MS
  );
  broadcastToAll({ type: "listeners-count", listeners: counts });
}

const listenerCountNotifier = createDebouncedCallback(
  () => updateListenerCounts(),
  parseListenerCountDebounceMs()
);

const LISTENER_COUNT_REFRESH_MS = 60000;
const listenerCountRefreshInterval = setInterval(() => {
  if (hasActiveBroadcaster(activeBroadcasts)) {
    updateListenerCounts();
  }
}, LISTENER_COUNT_REFRESH_MS);

registerGracefulShutdown({
  server,
  wss,
  heartbeatInterval,
  log: signalingLog,
  onBeforeClose: () => {
    clearInterval(listenerCountRefreshInterval);
    listenerCountNotifier.flush();
  },
});

function handleWsIdentify(ws, data) {
  if (data.type !== "identify" || !data.clientId) return false;

  const { replacedDuplicate, restoredLanguage } = applyClientIdentify({
    ws,
    clientId: data.clientId,
    clients: wss.clients,
    sessionStore: clientSessions,
    onDuplicateClosed: (clientId) => {
      signalingLog.verbose("ws.client.duplicate_closed", { clientId });
    },
  });

  signalingLog.verbose("ws.client.identified", {
    clientId: ws.id,
    replacedDuplicate,
    restoredLanguage: restoredLanguage ?? null,
  });
  if (replacedDuplicate) {
    signalingLog.warn("ws.client.duplicate_replaced", {
      clientId: ws.id,
      restoredLanguage: restoredLanguage ?? null,
    });
  }
  if (restoredLanguage) {
    clientSessions.touchListener(ws.id);
    signalingLog.info("ws.client.language_restored", {
      clientId: ws.id,
      language: restoredLanguage,
    });
    listenerCountNotifier.schedule();
  }

  flushQueue(ws);
  return true;
}

function handleWsClientPing(data) {
  return data.type === "ping";
}

function handleWsBroadcasterRegister(ws, data) {
  if (data.type !== "broadcaster" || !data.language || !data.token) return false;
  const decoded = verifyToken(data.token);
  if (decoded?.role !== "broadcaster") {
    signalingLog.warn("auth.broadcaster_rejected", {
      clientId: ws.id,
      language: data.language,
      reason: "invalid_or_expired_token",
    });
    recordSignalingError(
      "Broadcaster register rejected: invalid or expired token"
    );
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Token inválido o sin permisos",
      })
    );
    return true;
  }

  const prev = broadcasters[data.language];
  if (prev && prev !== ws && prev.readyState === WS_OPEN) {
    try {
      prev.isBroadcaster = false;
      prev.language = null;
      prev.close(4000, "replaced_by_new_registration");
      signalingLog.info("broadcaster.replaced_previous", {
        language: data.language,
        previousClientId: prev.id,
        newClientId: ws.id,
      });
    } catch (err) {
      signalingLog.error("broadcaster.replace_previous_failed", {
        language: data.language,
        previousClientId: prev.id,
        ...errorFields(err),
      });
    }
  }

  ws.isBroadcaster = true;
  ws.language = data.language;
  ws.broadcasterRegisteredAt = Date.now();
  broadcasters[data.language] = ws;
  activeBroadcasts[data.language] = true;

  signalingLog.info("broadcaster.registered", {
    language: data.language,
    clientId: ws.id,
    listeners: snapshotListenersForLog(),
  });
  recordBroadcasterRegistration(data.language, ws.id);
  broadcastToAll({ type: "active-broadcasts", active: activeBroadcasts });
  return true;
}

function handleWsStopBroadcast(data) {
  if (data.type !== "stop-broadcast" || !data.language) return false;
  broadcasters[data.language] = null;
  activeBroadcasts[data.language] = false;
  signalingLog.info("broadcaster.stopped", {
    language: data.language,
    listeners: snapshotListenersForLog(),
  });
  broadcastToAll({ type: "active-broadcasts", active: activeBroadcasts });
  return true;
}

function handleWsRegisterListener(ws, data) {
  return handleRegisterListener(
    ws,
    data,
    () => listenerCountNotifier.schedule(),
    clientSessions
  );
}

function handleWsRequestOffer(ws, data) {
  if (data.type !== "request-offer" || !data.language) return false;
  persistListenerLanguage(ws, data.language, clientSessions);
  listenerCountNotifier.schedule();

  const targetBroadcaster = broadcasters[data.language];
  if (targetBroadcaster?.readyState === WS_OPEN) {
    targetBroadcaster.send(
      JSON.stringify({
        type: "request-offer",
        clientId: ws.id,
        language: data.language,
      })
    );
    signalingLog.verbose("signaling.offer.requested", {
      language: data.language,
      listenerId: ws.id,
      broadcasterId: targetBroadcaster.id,
    });
  } else {
    signalingLog.warn("signaling.offer.no_broadcaster", {
      language: data.language,
      listenerId: ws.id,
      activeBroadcasts: { ...activeBroadcasts },
    });
  }
  return true;
}

function handleWsStopListening(ws, data) {
  if (data.type !== "stop-listening" || !data.language) return false;
  if (ws.language !== data.language) return true;

  clearListenerSession(ws, clientSessions);
  listenerCountNotifier.schedule();
  signalingLog.info("listener.stopped", {
    clientId: ws.id,
    language: data.language,
    listeners: snapshotListenersForLog(),
  });

  const bc = broadcasters[data.language];
  if (bc?.readyState === WS_OPEN) {
    bc.send(
      JSON.stringify({
        type: "stop-connection",
        target: ws.id,
      })
    );
  }
  return true;
}

function handleWsSignalingRelay(ws, data) {
  if (!["offer", "answer", "candidate"].includes(data.type)) return false;

  const targetClient = [...wss.clients].find((c) => c.id === data.target);

  if (!isSignalingTargetOnline(wss.clients, data.target)) {
    if (ws.isBroadcaster) {
      notifyBroadcasterStopListener(data.target, {
        language: ws.language,
        broadcasterSocket: ws,
        reason: "signaling_target_offline",
      });
      return true;
    }

    if (shouldBufferSignalingForTarget(wss.clients, data.target)) {
      signalingLog.verbose("signaling.relay.buffered", {
        messageType: data.type,
        fromClientId: ws.id,
        targetId: data.target,
      });
      pushToQueue(data.target, { ...data, clientId: ws.id });
      return true;
    }

    signalingLog.verbose("signaling.relay.dropped", {
      messageType: data.type,
      fromClientId: ws.id,
      targetId: data.target,
    });
    return true;
  }

  if (canRelaySignaling(ws, targetClient, clientSessions)) {
    targetClient.send(JSON.stringify({ ...data, clientId: ws.id }));
    signalingLog.verbose("signaling.relay.forwarded", {
      messageType: data.type,
      fromClientId: ws.id,
      targetId: data.target,
      language: ws.language ?? targetClient.language ?? null,
    });
  } else {
    signalingLog.warn("signaling.relay.language_mismatch", {
      messageType: data.type,
      fromClientId: ws.id,
      fromLanguage: ws.language ?? clientSessions.getListenerLanguage(ws.id),
      targetId: data.target,
      targetLanguage:
        targetClient.language ??
        clientSessions.getListenerLanguage(data.target),
    });
  }
  return true;
}

wss.on("connection", (ws) => {
  ws.id = uuidv4();
  ws.isBroadcaster = false;
  ws.language = null;
  ws.connectedAt = Date.now();
  touchClientActivity(ws);
  ws.on("pong", () => {
    touchClientActivity(ws);
    touchListenerSession(ws);
  });

  signalingLog.verbose("ws.client.connected", {
    clientId: ws.id,
    totalConnections: wss.clients.size,
  });

  // 🔹 Enviar estado actual al nuevo cliente
  ws.send(
    JSON.stringify({ type: "active-broadcasts", active: activeBroadcasts })
  );
  listenerCountNotifier.schedule();

  ws.on("message", (msg) => {
    touchClientActivity(ws);
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      signalingLog.verbose("ws.message.parse_failed", {
        clientId: ws.id,
      });
      return;
    }
    signalingLog.verbose("ws.message.received", {
      clientId: ws.id,
      messageType: data.type ?? null,
    });

    if (handleWsIdentify(ws, data)) return;
    if (handleWsClientPing(data)) {
      touchListenerSession(ws);
      return;
    }
    if (handleWsBroadcasterRegister(ws, data)) return;
    if (handleWsStopBroadcast(data)) return;
    if (handleWsRequestOffer(ws, data)) return;
    if (handleWsRegisterListener(ws, data)) return;
    if (handleWsStopListening(ws, data)) return;
    handleWsSignalingRelay(ws, data);
  });

  ws.on("close", (code, reason) => {
    const closeReasonText = reason?.toString?.() ?? "";
    const closeKind = describeCloseCode(code);
    const listeners = snapshotListenersForLog();

    if (!ws.isBroadcaster && ws.language) {
      if (shouldNotifyBroadcasterOnListenerClose(code)) {
        notifyBroadcasterStopListener(ws.id, {
          language: ws.language,
          reason: closeKind,
        });
      }

      const disconnectPayload = {
        ...buildClientLogContext(ws),
        closeCode: code,
        closeKind,
        closeReason: closeReasonText || null,
        intentionalStop: code === 1000,
        listeners,
      };

      if (code === 4001) {
        signalingLog.verbose("ws.client.disconnected", disconnectPayload);
      } else if (code === 1000) {
        signalingLog.info("ws.client.disconnected", disconnectPayload);
      } else {
        signalingLog.warn("ws.client.disconnected", disconnectPayload);
      }

      if (code === 1000) {
        clearListenerSession(ws, clientSessions);
      }
      ws.language = null;
      if (shouldUpdateListenerCountOnClose(wss.clients, ws, code)) {
        listenerCountNotifier.schedule();
      }
    } else if (ws.isBroadcaster && ws.language) {
      // handled below
    } else {
      signalingLog.verbose("ws.client.disconnected", {
        ...buildClientLogContext(ws),
        closeCode: code,
        closeKind,
        closeReason: closeReasonText || null,
        listeners,
      });
    }

    if (ws.isBroadcaster && ws.language) {
      const lang = ws.language;
      if (broadcasters[lang] === ws) {
        broadcasters[lang] = null;
        activeBroadcasts[lang] = false;
        const replacement = findStandbyBroadcaster(wss.clients, lang, ws.id);
        if (replacement) {
          broadcasters[lang] = replacement;
          activeBroadcasts[lang] = true;
          signalingLog.warn("broadcaster.disconnected", {
            language: lang,
            clientId: ws.id,
            closeCode: code,
            closeKind,
            closeReason: closeReasonText || null,
            replacementClientId: replacement.id,
            listeners,
          });
        } else {
          signalingLog.warn("broadcaster.disconnected", {
            language: lang,
            clientId: ws.id,
            closeCode: code,
            closeKind,
            closeReason: closeReasonText || null,
            replacementClientId: null,
            listeners,
          });
        }
        broadcastToAll({ type: "active-broadcasts", active: activeBroadcasts });
      }
    }
  });
});
