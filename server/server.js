import express from "express";
import { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import fs from "fs";
import dotenv from "dotenv";
import cors from "cors";

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
    { expiresIn: "2h" }
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

// =====================================================
// 📅 Manejo de Next Event con persistencia en archivo
// =====================================================
const EVENT_FILE = "./nextEvent.json";
let nextEventDate = "2025-10-15T12:00:00";

try {
  if (fs.existsSync(EVENT_FILE)) {
    const saved = JSON.parse(fs.readFileSync(EVENT_FILE, "utf-8"));
    if (saved.date) nextEventDate = saved.date;
  }
} catch (err) {
  console.error("⚠️ No se pudo leer el archivo de evento:", err);
}

// Obtener fecha actual del evento
app.get("/next-event", (req, res) => {
  res.json({ date: nextEventDate });
});

// Actualizar fecha del evento (solo broadcaster autorizado)
app.post("/next-event", (req, res) => {
  const { date, token } = req.body;
  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== "broadcaster") {
    return res.status(403).json({ error: "No autorizado" });
  }

  nextEventDate = date;
  fs.writeFileSync(EVENT_FILE, JSON.stringify({ date }, null, 2));
  console.log("📅 Nueva fecha de evento:", date);
  res.json({ success: true, date });
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

    // 🔹 Si era listener, actualizar conteo
    if (!ws.isBroadcaster && ws.language) {
      ws.language = null;
      updateListenerCounts();
    }

    // 🔹 Si era broadcaster, marcar como inactivo
    if (ws.isBroadcaster && ws.language) {
      broadcasters[ws.language] = null;
      activeBroadcasts[ws.language] = false;
      console.log(`⚠️ Broadcaster de ${ws.language} desconectado`);
      broadcastToAll({ type: "active-broadcasts", active: activeBroadcasts });
    }
  });
});

// // server.js
// import express from "express";
// import { WebSocketServer } from "ws";
// import { v4 as uuidv4 } from "uuid";
// import path from "path";
// import { fileURLToPath } from "url";
// import jwt from "jsonwebtoken";
// import fs from "fs";
// import dotenv from "dotenv";
// import cors from "cors";

// dotenv.config();

// // 🔹 Definir __dirname en ES Modules
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// const app = express();
// const PORT = process.env.PORT || 8080;
// const SECRET_KEY = process.env.SECRET_KEY;

// // Middleware
// app.use(cors());
// app.use(express.json());

// // Usuarios administradores desde .env
// const users = [
//   {
//     username: process.env.ADMIN_USERNAME,
//     password: process.env.ADMIN_PASSWORD,
//     role: "broadcaster",
//   },
// ];

// // =====================================================
// // 🟢 ENDPOINTS API (ANTES de servir el frontend)
// // =====================================================

// // Endpoint login
// app.post("/login", (req, res) => {
//   const { username, password } = req.body;

//   const user = users.find(
//     (u) => u.username === username && u.password === password
//   );

//   if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

//   const token = jwt.sign(
//     { username: user.username, role: user.role },
//     SECRET_KEY,
//     { expiresIn: "2h" }
//   );

//   res.json({ token, role: user.role });
// });

// // Middleware para verificar JWT
// const verifyToken = (token) => {
//   try {
//     return jwt.verify(token, SECRET_KEY);
//   } catch {
//     return null;
//   }
// };

// // =====================================================
// // 📅 Manejo de Next Event con persistencia en archivo
// // =====================================================
// const EVENT_FILE = "./nextEvent.json";
// let nextEventDate = "2025-10-15T12:00:00";

// try {
//   if (fs.existsSync(EVENT_FILE)) {
//     const saved = JSON.parse(fs.readFileSync(EVENT_FILE, "utf-8"));
//     if (saved.date) nextEventDate = saved.date;
//   }
// } catch (err) {
//   console.error("⚠️ No se pudo leer el archivo de evento:", err);
// }

// // Obtener fecha actual del evento
// app.get("/next-event", (req, res) => {
//   res.json({ date: nextEventDate });
// });

// // Actualizar fecha del evento (solo broadcaster autorizado)
// app.post("/next-event", (req, res) => {
//   const { date, token } = req.body;
//   const decoded = verifyToken(token);
//   if (!decoded || decoded.role !== "broadcaster") {
//     return res.status(403).json({ error: "No autorizado" });
//   }

//   nextEventDate = date;
//   fs.writeFileSync(EVENT_FILE, JSON.stringify({ date }, null, 2));
//   console.log("📅 Nueva fecha de evento:", date);
//   res.json({ success: true, date });
// });

// // =====================================================
// // 🎨 Servir el frontend de React (DESPUÉS de las APIs)
// // =====================================================
// const clientBuildPath = path.join(__dirname, "../client/build");
// app.use(express.static(clientBuildPath));
// app.get("/*", (req, res) => {
//   res.sendFile(path.join(clientBuildPath, "index.html"));
// });

// // =====================================================
// // 🌐 WebSocket Server
// // =====================================================
// const server = app.listen(PORT, () => {
//   console.log(`Servidor HTTP + WebSocket escuchando en puerto ${PORT}`);
// });

// const wss = new WebSocketServer({ server });

// // Mapa de Broadcasters por idioma
// const broadcasters = {}; // { es: ws, en: ws, ro: ws }

// wss.on("connection", (ws, req) => {
//   ws.id = uuidv4();
//   ws.isBroadcaster = false;
//   ws.language = null;

//   console.log(`🔗 Cliente conectado: ${ws.id}`);

//   ws.on("message", (msg) => {
//     try {
//       const data = JSON.parse(msg.toString());
//       console.log(`📩 Mensaje recibido de ${ws.id}:`, data);

//       // ==========================
//       // Registrar Broadcaster (con JWT)
//       // ==========================
//       if (data.type === "broadcaster" && data.language && data.token) {
//         const decoded = verifyToken(data.token);
//         if (!decoded || decoded.role !== "broadcaster") {
//           ws.send(
//             JSON.stringify({
//               type: "error",
//               message: "Token inválido o sin permisos",
//             })
//           );
//           return;
//         }

//         ws.isBroadcaster = true;
//         ws.language = data.language;
//         broadcasters[data.language] = ws;
//         console.log(
//           `🎙️ Broadcaster autorizado registrado para ${data.language}: ${ws.id}`
//         );
//         return;
//       }

//       // ==========================
//       // Listener solicita oferta de un idioma
//       // ==========================
//       if (data.type === "request-offer" && data.language) {
//         ws.language = data.language; // Guardamos idioma del listener

//         const targetBroadcaster = broadcasters[data.language];
//         if (targetBroadcaster && targetBroadcaster.readyState === ws.OPEN) {
//           targetBroadcaster.send(
//             JSON.stringify({
//               type: "request-offer",
//               clientId: ws.id,
//               language: data.language,
//             })
//           );
//           console.log(
//             `📡 Solicitud de oferta enviada al Broadcaster ${data.language} para oyente ${ws.id}`
//           );
//         } else {
//           console.warn(
//             `⚠️ No hay Broadcaster activo para idioma ${data.language}`
//           );
//         }
//         return;
//       }

//       // ==========================
//       // Reenvío estricto de mensajes (offer, answer, candidate)
//       // ==========================
//       if (["offer", "answer", "candidate"].includes(data.type)) {
//         const targetClient = [...wss.clients].find(
//           (client) => client.id === data.target
//         );
//         if (!targetClient || targetClient.readyState !== ws.OPEN) {
//           console.warn(`⚠️ Target no disponible para ${data.type}`);
//           return;
//         }

//         if (
//           ws.language &&
//           targetClient.language &&
//           ws.language === targetClient.language
//         ) {
//           targetClient.send(JSON.stringify({ ...data, clientId: ws.id }));
//           console.log(
//             `➡️ ${data.type} (${ws.language}) reenviado de ${ws.id} a ${data.target}`
//           );
//         } else {
//           console.warn(
//             `⚠️ Idioma no coincide entre ${ws.id} y ${data.target}, mensaje ignorado`
//           );
//         }
//         return;
//       }
//     } catch (err) {
//       console.error("❌ Error procesando mensaje:", err);
//     }
//   });

//   ws.on("close", () => {
//     console.log(`❌ Cliente desconectado: ${ws.id}`);
//     if (ws.isBroadcaster && ws.language) {
//       delete broadcasters[ws.language];
//       console.log(`⚠️ Broadcaster de ${ws.language} desconectado`);
//     }
//   });
// });
