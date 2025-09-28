import React, { useRef, useEffect, useState } from "react";
import "./Broadcaster.css";

// Función para obtener credenciales TURN desde Metered
const obtenerCredencialesTURN = async () => {
  try {
    const response = await fetch(
      "https://webrtc-live-ct59.metered.live/api/v1/turn/credentials?apiKey=dafe83b1623c380eb0a596b67f4f26cec1b3"
    );
    const iceServers = await response.json();
    console.log("✅ Credenciales TURN obtenidas:", iceServers);
    return iceServers;
  } catch (err) {
    console.error("❌ Error obteniendo credenciales TURN:", err);
    return []; // fallback: sin TURN
  }
};

function Broadcaster({ signalingServer }) {
  const peers = useRef({});
  const streamRef = useRef(null);
  const [broadcasting, setBroadcasting] = useState(false);

  // Manejar mensajes entrantes del servidor
  useEffect(() => {
    const handleMessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log("📩 Mensaje recibido en Broadcaster:", data);

      // Nuevo oyente solicita oferta
      if (data.type === "request-offer") {
        if (streamRef.current) {
          console.log("📡 Nuevo oyente pidió oferta:", data.clientId);
          await createPeer(data.clientId);
        } else {
          console.warn(
            "⚠️ Oyente pidió oferta, pero no hay transmisión activa"
          );
        }
      }

      // Respuesta del oyente
      if (data.type === "answer") {
        const peer = peers.current[data.clientId];
        if (peer) {
          try {
            await peer.setRemoteDescription(
              new RTCSessionDescription(data.answer)
            );
            console.log("✅ Answer aplicada de", data.clientId);
          } catch (err) {
            console.error("❌ Error aplicando answer:", err);
          }
        }
      }

      // ICE candidate entrante
      if (data.type === "candidate") {
        const peer = peers.current[data.clientId];
        if (peer) {
          try {
            await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log("✅ Candidate agregado de", data.clientId);
          } catch (err) {
            console.error("❌ Error agregando ICE candidate:", err);
          }
        }
      }
    };

    signalingServer.addEventListener("message", handleMessage);
    return () => signalingServer.removeEventListener("message", handleMessage);
  }, [signalingServer]);

  // Crear PeerConnection para un oyente
  const createPeer = async (clientId) => {
    if (peers.current[clientId]) {
      console.log("ℹ️ Ya existe conexión con", clientId);
      return;
    }

    console.log("🆕 Creando PeerConnection para", clientId);

    // Obtener ICE servers con TURN
    const rtcConfig = { iceServers: await obtenerCredencialesTURN() };
    const peer = new RTCPeerConnection(rtcConfig);
    peers.current[clientId] = peer;

    // Agregar tracks de audio
    streamRef.current.getTracks().forEach((track) => {
      peer.addTrack(track, streamRef.current);
    });

    // ICE candidates
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("📤 Enviando candidate a", clientId);
        signalingServer.send(
          JSON.stringify({
            type: "candidate",
            candidate: event.candidate,
            target: clientId,
          })
        );
      }
    };

    // Crear y enviar oferta
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      console.log("📤 Enviando oferta a", clientId);
      signalingServer.send(
        JSON.stringify({ type: "offer", offer, target: clientId })
      );
    } catch (err) {
      console.error("❌ Error creando oferta:", err);
    }
  };

  // Iniciar transmisión
  const startBroadcast = async () => {
    console.log("🟢 CLICK en Iniciar Transmisión");

    if (!streamRef.current) {
      try {
        console.log("🎙️ Solicitando acceso al micrófono...");
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        console.log("✅ Micrófono listo");
      } catch (err) {
        console.error("❌ No se pudo acceder al micrófono:", err);
        return;
      }
    }

    // Registrar Broadcaster en el servidor
    if (signalingServer.readyState === WebSocket.OPEN) {
      signalingServer.send(JSON.stringify({ type: "broadcaster" }));
      console.log("📤 Enviado al servidor: { type: 'broadcaster' }");
    } else {
      console.error("❌ WebSocket no está abierto");
    }

    setBroadcasting(true);
    console.log("🔴 Transmisión iniciada");
  };

  return (
    <div className="broadcaster-container">
      <button
        onClick={startBroadcast}
        disabled={broadcasting}
        className="broadcast-btn"
      >
        {broadcasting ? "🔴 Transmitiendo..." : "🚀 Iniciar Transmisión"}
      </button>

      {broadcasting && (
        <div className="broadcasting-text">Tu transmisión está activa</div>
      )}
    </div>
  );
}

export default Broadcaster;

// import React, { useRef, useEffect, useState } from "react";
// import "./Broadcaster.css";

// function Broadcaster({ signalingServer }) {
//   const peers = useRef({});
//   const streamRef = useRef(null);

//   const [broadcasting, setBroadcasting] = useState(false);

//   useEffect(() => {
//     const handleMessage = async (event) => {
//       const data = JSON.parse(event.data);

//       if (data.type === "request-offer") {
//         if (!streamRef.current) return;
//         if (!peers.current[data.clientId]) {
//           await createPeer(data.clientId);
//         }
//       }

//       if (data.type === "answer") {
//         const peer = peers.current[data.clientId];
//         if (peer) {
//           await peer.setRemoteDescription(
//             new RTCSessionDescription(data.answer)
//           );
//         }
//       }

//       if (data.type === "candidate") {
//         const peer = peers.current[data.clientId];
//         if (peer) {
//           await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
//         }
//       }
//     };

//     signalingServer.addEventListener("message", handleMessage);
//     return () => signalingServer.removeEventListener("message", handleMessage);
//   }, [signalingServer]);

//   const createPeer = async (clientId) => {
//     const peer = new RTCPeerConnection();
//     peers.current[clientId] = peer;

//     streamRef.current.getTracks().forEach((track) => {
//       peer.addTrack(track, streamRef.current);
//     });

//     peer.onicecandidate = (event) => {
//       if (event.candidate) {
//         signalingServer.send(
//           JSON.stringify({
//             type: "candidate",
//             candidate: event.candidate,
//             target: clientId,
//           })
//         );
//       }
//     };

//     const offer = await peer.createOffer();
//     await peer.setLocalDescription(offer);

//     signalingServer.send(
//       JSON.stringify({ type: "offer", offer, target: clientId })
//     );
//   };

//   const startBroadcast = async () => {
//     if (!streamRef.current) {
//       try {
//         streamRef.current = await navigator.mediaDevices.getUserMedia({
//           audio: true,
//         });
//       } catch (err) {
//         console.error("No se pudo acceder al micrófono", err);
//         return;
//       }
//     }
//     setBroadcasting(true);
//   };

//   return (
//     <div className="broadcaster-container">
//       <button
//         onClick={startBroadcast}
//         disabled={broadcasting}
//         className="broadcast-btn"
//       >
//         {broadcasting ? "🔴 Transmitiendo..." : "🚀 Iniciar Transmisión"}
//       </button>

//       {broadcasting && (
//         <div className="broadcasting-text">Tu transmisión está activa</div>
//       )}
//     </div>
//   );
// }

// export default Broadcaster;
