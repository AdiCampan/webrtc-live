import express from "express";
import { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";

// 🔹 Definir __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Servir React build
const clientBuildPath = path.join(__dirname, "../client/build");
app.use(express.static(clientBuildPath));

app.get("/*", (req, res) => {
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

// Iniciar servidor HTTP
const server = app.listen(PORT, () => {
  console.log(`Servidor HTTP + WebSocket escuchando en puerto ${PORT}`);
});

// WebSocket
const wss = new WebSocketServer({ server });

// Mapa de Broadcasters por idioma
const broadcasters = {}; // { es: ws, en: ws, ro: ws }

wss.on("connection", (ws) => {
  ws.id = uuidv4();
  console.log(`🔗 Cliente conectado: ${ws.id}`);
  ws.isBroadcaster = false;
  ws.language = null;

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      console.log(`📩 Mensaje recibido de ${ws.id}:`, data);

      // Registrar Broadcaster
      if (data.type === "broadcaster" && data.language) {
        ws.isBroadcaster = true;
        ws.language = data.language;
        broadcasters[data.language] = ws;
        console.log(
          `🎙️ Broadcaster registrado para ${data.language}: ${ws.id}`
        );
        return;
      }

      // Listener solicita oferta de un idioma
      if (data.type === "request-offer" && data.language) {
        const targetBroadcaster = broadcasters[data.language];
        if (targetBroadcaster && targetBroadcaster.readyState === ws.OPEN) {
          targetBroadcaster.send(
            JSON.stringify({ type: "request-offer", clientId: ws.id })
          );
          console.log(
            `📡 Solicitud de oferta enviada al Broadcaster ${data.language} para oyente ${ws.id}`
          );
        }
        return;
      }

      // Reenviar mensajes a target específico
      if (data.target) {
        const targetClient = [...wss.clients].find(
          (client) => client.id === data.target
        );
        if (targetClient && targetClient.readyState === ws.OPEN) {
          targetClient.send(JSON.stringify({ ...data, clientId: ws.id }));
          console.log(`➡️ Mensaje enviado a ${data.target} desde ${ws.id}`);
        }
        return;
      }

      // Listener solicita oferta de un idioma
      if (data.type === "request-offer" && data.language) {
        ws.language = data.language; // guardamos idioma del listener
        const targetBroadcaster = broadcasters[data.language];
        if (targetBroadcaster && targetBroadcaster.readyState === ws.OPEN) {
          targetBroadcaster.send(
            JSON.stringify({ type: "request-offer", clientId: ws.id })
          );
          console.log(
            `📡 Solicitud de oferta enviada al Broadcaster ${data.language} para oyente ${ws.id}`
          );
        }
        return;
      }

      // Reenvío estricto entre broadcaster y listener del mismo idioma
      if (["offer", "answer", "candidate"].includes(data.type)) {
        if (!data.language) {
          console.warn("⚠️ Mensaje sin language, ignorado:", data);
          return;
        }
        const targetClient = [...wss.clients].find(
          (client) =>
            client.id === data.target && client.language === data.language
        );
        if (targetClient && targetClient.readyState === ws.OPEN) {
          targetClient.send(JSON.stringify({ ...data, clientId: ws.id }));
          console.log(
            `➡️ ${data.type} (${data.language}) reenviado de ${ws.id} a ${data.target}`
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
      broadcasters[ws.language] = null;
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
