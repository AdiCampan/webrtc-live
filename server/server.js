// server.js
import express from "express";
import path from "path";
import { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";

// Puerto asignado por Render o 8080 localmente
const PORT = process.env.PORT || 8080;

// Crear servidor Express
const app = express();

// Servir la build de React
app.use(express.static(path.join(__dirname, "../client/build")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/build", "index.html"));
});

// Iniciar servidor HTTP
const server = app.listen(PORT, () => {
  console.log(`Servidor HTTP + WebSocket escuchando en puerto ${PORT}`);
});

// Configurar WebSocket
const wss = new WebSocketServer({ server });

// Mapa de clientes conectados
const clients = new Map(); // clientId -> ws

wss.on("connection", (ws) => {
  const clientId = uuidv4();
  clients.set(clientId, ws);
  console.log("Nuevo cliente conectado:", clientId);

  // Enviar ID único al cliente
  ws.send(JSON.stringify({ type: "assign-id", clientId }));

  // Manejar mensajes entrantes
  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message.toString());
    } catch (err) {
      console.error("Mensaje inválido:", message.toString());
      return;
    }

    // Mensajes dirigidos a un cliente específico
    if (data.target && clients.has(data.target)) {
      const targetWs = clients.get(data.target);
      if (targetWs.readyState === targetWs.OPEN) {
        targetWs.send(JSON.stringify({ ...data, clientId }));
      }
      return;
    }

    // Broadcast a todos los demás clientes
    clients.forEach((clientWs, id) => {
      if (id !== clientId && clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({ ...data, clientId }));
      }
    });
  });

  // Manejar cierre de conexión
  ws.on("close", () => {
    clients.delete(clientId);
    console.log("Cliente desconectado:", clientId);
  });

  ws.on("error", (err) => {
    console.error("Error en cliente:", clientId, err);
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
