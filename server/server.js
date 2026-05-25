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
  findStandbyBroadcaster,
  parseStaleAfterMs,
} from "./broadcasterStandby.js";
import {
  buildSignalingMetricsPayload,
  recordBroadcasterRegistration,
  recordSignalingError,
} from "./signalingMetrics.js";
import { registerGracefulShutdown } from "./gracefulShutdown.js";

dotenv.config();

const SIGNALING_VERBOSE =
  process.env.SIGNALING_VERBOSE === "1" ||
  process.env.SIGNALING_VERBOSE === "true";

function logVerbose(...args) {
  if (process.env.NODE_ENV === "production" && !SIGNALING_VERBOSE) return;
  console.log(...args);
}

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
console.log("✅ Conectado a Firebase Firestore");

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
    console.error("Error obteniendo fecha:", err);
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
    console.log("📅 Nueva fecha guardada en Firestore:", date);
    res.json({ success: true, date });
  } catch (err) {
    console.error("Error guardando fecha:", err);
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

// =====================================================
// 🌐 WebSocket Server
// =====================================================
const server = app.listen(PORT, () => {
  console.log(`Servidor HTTP + WebSocket escuchando en puerto ${PORT}`);
});

const wss = new WebSocketServer({ server });

wss.on("error", (err) => {
  recordSignalingError(
    err instanceof Error ? err.message : "WebSocketServer error"
  );
  console.error("❌ WebSocketServer error:", err);
});

const broadcasters = {}; // { es: ws, en: ws, ro: ws }
const activeBroadcasts = { es: false, en: false, ro: false };

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

const WS_OPEN = 1;

/**
 * Force-quit (e.g. iOS app switcher) often drops TCP without firing WS "close" promptly.
 * Track last client activity; terminate stale signaling sockets so listener counts recover.
 * Idle browsers (no language yet) are not subject to the short stale window.
 */
const WS_STALE_CHECK_MS = 15000;
/** Tunable for poor WiFi; JSON pings / heartbeats normally refresh activity well before this. */
const WS_STALE_AFTER_MS = parseStaleAfterMs(
  process.env.WS_STALE_AFTER_MS,
  120000
);

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
        console.warn(`💀 Terminating stale WebSocket: ${client.id}`);
        client.terminate();
        return;
      }
    }
    try {
      client.ping();
    } catch (err) {
      recordSignalingError(
        err instanceof Error ? err.message : "WebSocket ping failed"
      );
      console.warn("⚠️ WebSocket ping failed:", err);
    }
  });
}, WS_STALE_CHECK_MS);

server.on("close", () => clearInterval(heartbeatInterval));

// 🔹 Buffer de mensajes para clientes desconectados temporalmente (60s vida útil)
const messageQueue = {}; // { clientId: [{msg, expiry}, ...] }

function pushToQueue(clientId, message) {
  if (!messageQueue[clientId]) messageQueue[clientId] = [];
  messageQueue[clientId].push({
    message,
    expiry: Date.now() + 60000 // Expira en 60 segundos
  });
  // Limitar tamaño del buffer por seguridad
  if (messageQueue[clientId].length > 50) messageQueue[clientId].shift();
  logVerbose(
    `📥 Mensaje guardado en buffer para ${clientId} (Total: ${messageQueue[clientId].length})`
  );
}

function flushQueue(ws) {
  const queue = messageQueue[ws.id];
  if (!queue || queue.length === 0) return;

  logVerbose(`📤 Entregando ${queue.length} mensajes pendientes a ${ws.id}`);
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
  const counts = { es: 0, en: 0, ro: 0 };
  wss.clients.forEach((client) => {
    if (!client.isBroadcaster && client.language) {
      counts[client.language] = (counts[client.language] || 0) + 1;
    }
  });
  broadcastToAll({ type: "listeners-count", listeners: counts });
}

const listenerCountNotifier = createDebouncedCallback(
  () => updateListenerCounts(),
  parseListenerCountDebounceMs()
);

registerGracefulShutdown({
  server,
  wss,
  heartbeatInterval,
  onBeforeClose: () => listenerCountNotifier.flush(),
});

function handleWsIdentify(ws, data) {
  if (data.type !== "identify" || !data.clientId) return false;
  ws.id = data.clientId;
  logVerbose(`🆔 Cliente reconectado con ID persistente: ${ws.id}`);
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
    } catch (err) {
      recordSignalingError(
        err instanceof Error
          ? err.message
          : "Failed to close replaced broadcaster socket"
      );
      console.warn("⚠️ No se pudo cerrar el broadcaster anterior:", err);
    }
  }

  ws.isBroadcaster = true;
  ws.language = data.language;
  ws.broadcasterRegisteredAt = Date.now();
  broadcasters[data.language] = ws;
  activeBroadcasts[data.language] = true;

  console.log(`🎙️ Broadcaster autorizado para ${data.language}: ${ws.id}`);
  recordBroadcasterRegistration(data.language, ws.id);
  broadcastToAll({ type: "active-broadcasts", active: activeBroadcasts });
  return true;
}

function handleWsStopBroadcast(data) {
  if (data.type !== "stop-broadcast" || !data.language) return false;
  broadcasters[data.language] = null;
  activeBroadcasts[data.language] = false;
  console.log(`🛑 Transmisión detenida para ${data.language}`);
  broadcastToAll({ type: "active-broadcasts", active: activeBroadcasts });
  return true;
}

function handleWsRequestOffer(ws, data) {
  if (data.type !== "request-offer" || !data.language) return false;
  ws.language = data.language;
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
    logVerbose(
      `📡 Solicitud de oferta enviada al Broadcaster ${data.language} para oyente ${ws.id}`
    );
  } else {
    console.warn(
      `⚠️ No hay Broadcaster activo para idioma ${data.language}`
    );
  }
  return true;
}

function handleWsStopListening(ws, data) {
  if (data.type !== "stop-listening" || !data.language) return false;
  if (ws.language !== data.language) return true;

  ws.language = null;
  listenerCountNotifier.schedule();
  logVerbose(`🛑 Listener dejó de escuchar ${data.language}`);

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

  if (targetClient?.readyState !== WS_OPEN) {
    console.warn(
      `⚠️ Target ${data.target} no disponible para ${data.type}. Guardando en buffer...`
    );
    pushToQueue(data.target, { ...data, clientId: ws.id });
    return true;
  }

  if (
    ws.language &&
    targetClient.language &&
    ws.language === targetClient.language
  ) {
    targetClient.send(JSON.stringify({ ...data, clientId: ws.id }));
    logVerbose(
      `➡️ ${data.type} (${ws.language}) reenviado de ${ws.id} a ${data.target}`
    );
  } else {
    console.warn(
      `⚠️ Idioma no coincide entre ${ws.id} y ${data.target}, mensaje ignorado`
    );
  }
  return true;
}

wss.on("connection", (ws) => {
  ws.id = uuidv4();
  ws.isBroadcaster = false;
  ws.language = null;
  touchClientActivity(ws);
  ws.on("pong", () => {
    touchClientActivity(ws);
  });

  logVerbose(`🔗 Cliente conectado: ${ws.id}`);

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
      return;
    }
    logVerbose(`📩 Mensaje recibido de ${ws.id}:`, data);

    if (handleWsIdentify(ws, data)) return;
    if (handleWsClientPing(data)) return;
    if (handleWsBroadcasterRegister(ws, data)) return;
    if (handleWsStopBroadcast(data)) return;
    if (handleWsRequestOffer(ws, data)) return;
    if (handleWsStopListening(ws, data)) return;
    handleWsSignalingRelay(ws, data);
  });

  ws.on("close", () => {
    logVerbose(`❌ Cliente desconectado: ${ws.id}`);

    // Si era un listener, actualizamos el conteo pero NO pedimos al broadcaster
    // que cierre la conexión WebRTC. Dejamos que WebRTC intente seguir funcionando
    // por su cuenta aunque el WebSocket se haya caído en segundo plano.
    if (!ws.isBroadcaster && ws.language) {
      logVerbose(`🔌 Listener ${ws.id} perdió WebSocket. Manteniendo WebRTC vivo...`);
    }

    // 🔹 Actualizar conteo
    if (!ws.isBroadcaster && ws.language) {
      ws.language = null;
      listenerCountNotifier.schedule();
    }

    // 🔹 Si era broadcaster, marcar como inactivo SOLO si es el actual
    if (ws.isBroadcaster && ws.language) {
      const lang = ws.language;
      if (broadcasters[lang] === ws) {
        broadcasters[lang] = null;
        activeBroadcasts[lang] = false;
        const replacement = findStandbyBroadcaster(wss.clients, lang, ws.id);
        if (replacement) {
          broadcasters[lang] = replacement;
          activeBroadcasts[lang] = true;
          console.log(
            `🎙️ Broadcaster suplente activo para ${lang}: ${replacement.id}`
          );
        } else {
          logVerbose(`⚠️ Broadcaster de ${lang} desconectado`);
        }
        broadcastToAll({ type: "active-broadcasts", active: activeBroadcasts });
      }
    }
  });
});
