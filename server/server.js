import express from "express";
import { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";

// Definir __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Servir React build
const clientBuildPath = path.join(__dirname, "../client/build");
app.use(express.static(clientBuildPath));

// Para cualquier ruta que no coincida, devolver index.html
app.get("/*", (req, res) => {
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

// Iniciar servidor HTTP
const server = app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});

// WebSocket
const wss = new WebSocketServer({ server });

// Guardar clientes conectados
const clients = new Map();

wss.on("connection", (ws) => {
  ws.id = uuidv4();
  clients.set(ws.id, ws);
  console.log(`Cliente conectado: ${ws.id}`);

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      console.error("Mensaje inválido:", msg.toString());
      return;
    }

    // Si el mensaje tiene target, enviarlo solo a ese cliente
    if (data.target && clients.has(data.target)) {
      clients.get(data.target).send(JSON.stringify({ ...data, from: ws.id }));
      return;
    }

    // Si es un "request-offer" de un Listener, reenviarlo al Broadcaster
    if (data.type === "request-offer") {
      // reenviar a todos los que no sean el que pidió
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === ws.OPEN) {
          client.send(JSON.stringify({ ...data, clientId: ws.id }));
        }
      });
      return;
    }

    // Mensajes generales -> reenviar a todos excepto el remitente
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === ws.OPEN) {
        client.send(JSON.stringify({ ...data, from: ws.id }));
      }
    });
  });

  ws.on("close", () => {
    clients.delete(ws.id);
    console.log(`Cliente desconectado: ${ws.id}`);
  });
});

// import { WebSocketServer } from "ws";
// import { v4 as uuidv4 } from "uuid";

// const wss = new WebSocketServer({ host: "0.0.0.0", port: 8080 }, () => {
//   console.log("Servidor WebSocket iniciado en ws://0.0.0.0:8080");
// });

// const clients = new Map(); // clientId -> ws

// wss.on("connection", (ws) => {
//   const clientId = uuidv4();
//   clients.set(clientId, ws);
//   console.log("Nuevo cliente conectado:", clientId);

//   // Enviar ID único al cliente
//   ws.send(JSON.stringify({ type: "assign-id", clientId }));

//   ws.on("message", (message) => {
//     let data;
//     try {
//       data = JSON.parse(message.toString());
//     } catch (err) {
//       console.error("Mensaje inválido:", message.toString());
//       return;
//     }

//     // Si el mensaje tiene un "target", solo lo enviamos a ese cliente
//     if (data.target && clients.has(data.target)) {
//       const targetWs = clients.get(data.target);
//       if (targetWs.readyState === targetWs.OPEN) {
//         targetWs.send(JSON.stringify({ ...data, clientId }));
//       }
//       return;
//     }

//     // Si no hay target → se reenvía a todos los demás (broadcast)
//     clients.forEach((clientWs, id) => {
//       if (id !== clientId && clientWs.readyState === clientWs.OPEN) {
//         clientWs.send(JSON.stringify({ ...data, clientId }));
//       }
//     });
//   });

//   ws.on("close", () => {
//     clients.delete(clientId);
//     console.log("Cliente desconectado:", clientId);
//   });

//   ws.on("error", (err) => {
//     console.error("Error en cliente:", clientId, err);
//   });
// });
