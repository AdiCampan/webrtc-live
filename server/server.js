import express from "express";
import { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import cors from "cors";
import admin from 'firebase-admin';

dotenv.config();

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
console.log('✅ Conectado a Firebase Firestore');

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
    res.json({ date: "2025-10-15T12:00:00" });
  }
});

// Actualizar fecha en Firestore
app.post("/next-event", async (req, res) => {
  const { date, token } = req.body;
  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== "broadcaster") {
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
    res.status(500).json({ error: "Error guardando fecha" });
  }
});




// =====================================================
// 🎨 Servir el frontend de React
// =====================================================
const clientBuildPath = path.join(__dirname, "../client/build");
app.use(express.static(clientBuildPath));
app.get("/*", (req, res) => {
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

// =====================================================
// 🌐 WebSocket Server
// =====================================================
const server = app.listen(PORT, () => {
  console.log(`Servidor HTTP + WebSocket escuchando en puerto ${PORT}`);
});

const wss = new WebSocketServer({ server });

// Mapa de Broadcasters por idioma
const broadcasters = {}; // { es: ws, en: ws, ro: ws }

// 🔹 Estado global de transmisiones activas
const activeBroadcasts = { es: false, en: false, ro: false };

// 🔹 Función para enviar un mensaje a todos los clientes conectados
function broadcastToAll(message) {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(payload);
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

wss.on("connection", (ws) => {
  ws.id = uuidv4();
  ws.isBroadcaster = false;
  ws.language = null;

  console.log(`🔗 Cliente conectado: ${ws.id}`);

  // 🔹 Enviar estado actual al nuevo cliente
  ws.send(
    JSON.stringify({ type: "active-broadcasts", active: activeBroadcasts })
  );
  updateListenerCounts();

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }
    console.log(`📩 Mensaje recibido de ${ws.id}:`, data);

    // ==========================
    // Registrar Broadcaster (con JWT)
    // ==========================
    if (data.type === "broadcaster" && data.language && data.token) {
      const decoded = verifyToken(data.token);
      if (!decoded || decoded.role !== "broadcaster") {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Token inválido o sin permisos",
          })
        );
        return;
      }

      ws.isBroadcaster = true;
      ws.language = data.language;
      broadcasters[data.language] = ws;
      activeBroadcasts[data.language] = true;

      console.log(`🎙️ Broadcaster autorizado para ${data.language}: ${ws.id}`);
      broadcastToAll({ type: "active-broadcasts", active: activeBroadcasts });
      return;
    }

    // ==========================
    // Detener transmisión manualmente
    // ==========================
    if (data.type === "stop-broadcast" && data.language) {
      broadcasters[data.language] = null;
      activeBroadcasts[data.language] = false;
      console.log(`🛑 Transmisión detenida para ${data.language}`);
      broadcastToAll({ type: "active-broadcasts", active: activeBroadcasts });
      return;
    }

    // ==========================
    // Listener solicita oferta de un idioma
    // ==========================
    if (data.type === "request-offer" && data.language) {
      ws.language = data.language;
      updateListenerCounts();

      const targetBroadcaster = broadcasters[data.language];
      if (targetBroadcaster && targetBroadcaster.readyState === ws.OPEN) {
        targetBroadcaster.send(
          JSON.stringify({
            type: "request-offer",
            clientId: ws.id,
            language: data.language,
          })
        );
        console.log(
          `📡 Solicitud de oferta enviada al Broadcaster ${data.language} para oyente ${ws.id}`
        );
      } else {
        console.warn(
          `⚠️ No hay Broadcaster activo para idioma ${data.language}`
        );
      }
      return;
    }

    // ==========================
    // Listener deja de escuchar
    // ==========================
    if (data.type === "stop-listening" && data.language) {
      if (ws.language === data.language) {
        ws.language = null;
        updateListenerCounts();
        console.log(`🛑 Listener dejó de escuchar ${data.language}`);

        // 🔥 AVISAR AL BROADCASTER QUE CORTE EL peerConnection
        const bc = broadcasters[data.language];
        if (bc && bc.readyState === ws.OPEN) {
          bc.send(
            JSON.stringify({
              type: "stop-connection",
              target: ws.id,
            })
          );
        }
      }
      return;
    }

    // ==========================
    // Reenvío de offer/answer/candidate
    // ==========================
    if (["offer", "answer", "candidate"].includes(data.type)) {
      const targetClient = [...wss.clients].find((c) => c.id === data.target);
      if (!targetClient || targetClient.readyState !== ws.OPEN) {
        console.warn(`⚠️ Target no disponible para ${data.type}`);
        return;
      }

      if (
        ws.language &&
        targetClient.language &&
        ws.language === targetClient.language
      ) {
        targetClient.send(JSON.stringify({ ...data, clientId: ws.id }));
        console.log(
          `➡️ ${data.type} (${ws.language}) reenviado de ${ws.id} a ${data.target}`
        );
      } else {
        console.warn(
          `⚠️ Idioma no coincide entre ${ws.id} y ${data.target}, mensaje ignorado`
        );
      }
      return;
    }
  });

  ws.on("close", () => {
    console.log(`❌ Cliente desconectado: ${ws.id}`);

    // 🔥 Si era un listener, avisar al broadcaster que cierre la PeerConnection
    if (!ws.isBroadcaster && ws.language) {
      const bc = broadcasters[ws.language];
      if (bc && bc.readyState === ws.OPEN) {
        bc.send(
          JSON.stringify({
            type: "stop-connection",
            target: ws.id,
          })
        );
        console.log(
          `🔌 Indicando al broadcaster que cierre la conexión con ${ws.id}`
        );
      }
    }

    // 🔹 Actualizar conteo
    if (!ws.isBroadcaster && ws.language) {
      ws.language = null;
      updateListenerCounts();
    }

    // 🔹 Si era broadcaster, marcar como inactivo SOLO si es el actual
    if (ws.isBroadcaster && ws.language) {
      if (broadcasters[ws.language] === ws) {
        broadcasters[ws.language] = null;
        activeBroadcasts[ws.language] = false;
        console.log(`⚠️ Broadcaster de ${ws.language} desconectado`);
        broadcastToAll({ type: "active-broadcasts", active: activeBroadcasts });
      }
    }
  });
});
