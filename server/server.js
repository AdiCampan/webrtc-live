import express from "express";
import { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

// 🔹 Definir __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const SECRET_KEY = process.env.SECRET_KEY;

// Middleware JSON
app.use(cors());
app.use(express.json());

const users = [
  {
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
    role: "broadcaster",
  },
];

// =====================================================
// 🟢 ENDPOINTS API (van ANTES de servir el frontend)
// =====================================================

app.use(express.json());
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

// Middleware para verificar JWT en WebSocket
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

// Leer fecha guardada al iniciar el servidor
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
// 🎨 Servir el frontend de React (DESPUÉS de las APIs)
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

wss.on("connection", (ws, req) => {
  ws.id = uuidv4();
  ws.isBroadcaster = false;
  ws.language = null;

  console.log(`🔗 Cliente conectado: ${ws.id}`);

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
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
        console.log(
          `🎙️ Broadcaster autorizado registrado para ${data.language}: ${ws.id}`
        );
        return;
      }

      // ==========================
      // Listener solicita oferta de un idioma
      // ==========================
      if (data.type === "request-offer" && data.language) {
        ws.language = data.language; // Guardamos idioma del listener

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
      // Reenvío estricto de mensajes (offer, answer, candidate)
      // ==========================
      if (["offer", "answer", "candidate"].includes(data.type)) {
        const targetClient = [...wss.clients].find(
          (client) => client.id === data.target
        );
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
    } catch (err) {
      console.error("❌ Error procesando mensaje:", err);
    }
  });

  ws.on("close", () => {
    console.log(`❌ Cliente desconectado: ${ws.id}`);
    if (ws.isBroadcaster && ws.language) {
      delete broadcasters[ws.language];
      console.log(`⚠️ Broadcaster de ${ws.language} desconectado`);
    }
  });
});

// import express from "express";
// import { WebSocketServer } from "ws";
// import { v4 as uuidv4 } from "uuid";
// import path from "path";
// import { fileURLToPath } from "url";

// // 🔹 Definir __dirname en ES Modules
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// const app = express();
// const PORT = process.env.PORT || 8080;

// // Servir React build
// const clientBuildPath = path.join(__dirname, "../client/build");
// app.use(express.static(clientBuildPath));

// app.get("/*", (req, res) => {
//   res.sendFile(path.join(clientBuildPath, "index.html"));
// });

// // Iniciar servidor HTTP
// const server = app.listen(PORT, () => {
//   console.log(`Servidor HTTP + WebSocket escuchando en puerto ${PORT}`);
// });

// // WebSocket
// const wss = new WebSocketServer({ server });

// let broadcaster = null; // solo un Broadcaster

// wss.on("connection", (ws) => {
//   ws.id = uuidv4();
//   console.log(`🔗 Cliente conectado: ${ws.id}`);
//   console.log(`Clientes conectados actualmente: ${wss.clients.size}`);

//   ws.isBroadcaster = false; // marcar si es Broadcaster

//   ws.on("message", (msg) => {
//     try {
//       const data = JSON.parse(msg.toString());
//       console.log(`📩 Mensaje recibido de ${ws.id}:`, data);

//       // Registrar quién es Broadcaster
//       if (data.type === "broadcaster") {
//         ws.isBroadcaster = true;
//         broadcaster = ws;
//         console.log(`🎙️ Broadcaster registrado: ${ws.id}`);
//         return;
//       }

//       // Si es request-offer, solo Broadcaster puede responder
//       if (data.type === "request-offer") {
//         if (broadcaster && broadcaster.readyState === ws.OPEN) {
//           // Enviar al Broadcaster que hay un nuevo oyente
//           broadcaster.send(
//             JSON.stringify({ type: "request-offer", clientId: ws.id })
//           );
//           console.log(
//             `📡 Solicitud de oferta enviada al Broadcaster para oyente ${ws.id}`
//           );
//         }
//         return;
//       }

//       // Reenviar messages entre Broadcaster y oyentes
//       if (data.target) {
//         // enviar a cliente específico
//         const targetClient = [...wss.clients].find(
//           (client) => client.id === data.target
//         );
//         if (targetClient && targetClient.readyState === ws.OPEN) {
//           targetClient.send(JSON.stringify({ ...data, clientId: ws.id }));
//           console.log(`➡️ Mensaje enviado a ${data.target} desde ${ws.id}`);
//         }
//         return;
//       }

//       // Reenviar a todos menos quien envió
//       wss.clients.forEach((client) => {
//         if (client !== ws && client.readyState === ws.OPEN) {
//           client.send(JSON.stringify({ ...data, clientId: ws.id }));
//         }
//       });
//     } catch (err) {
//       console.error("❌ Error procesando mensaje:", err);
//     }
//   });

//   ws.on("close", () => {
//     console.log(`❌ Cliente desconectado: ${ws.id}`);
//     if (ws.isBroadcaster) {
//       console.log("⚠️ Broadcaster desconectado");
//       broadcaster = null;
//     }
//   });
// });
