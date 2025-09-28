import React, { useRef, useEffect, useState } from "react";
import "./Broadcaster.css";

function Broadcaster({ signalingServer }) {
  const peers = useRef({});
  const streamRef = useRef(null);
  const [broadcasting, setBroadcasting] = useState(false);

  // Manejar mensajes entrantes de WebSocket
  useEffect(() => {
    const handleMessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log("🟢 Broadcaster recibió mensaje:", data);

      // Un oyente pide una oferta
      if (data.type === "request-offer") {
        console.log(`Solicitud de oferta de: ${data.clientId}`);
        if (streamRef.current) {
          await createPeer(data.clientId);
        } else {
          console.warn(
            "Un oyente pidió oferta, pero no hay transmisión activa"
          );
        }
      }

      // El oyente responde con una answer
      if (data.type === "answer") {
        const peer = peers.current[data.clientId];
        console.log(`Answer recibido de: ${data.clientId}`, data.answer);
        if (peer) {
          try {
            await peer.setRemoteDescription(
              new RTCSessionDescription(data.answer)
            );
            console.log(`✅ Answer aplicada para ${data.clientId}`);
          } catch (err) {
            console.error("Error al aplicar answer:", err);
          }
        }
      }

      // Recibo un ICE candidate del oyente
      if (data.type === "candidate") {
        const peer = peers.current[data.clientId];
        console.log(
          `ICE candidate recibido de: ${data.clientId}`,
          data.candidate
        );
        if (peer) {
          try {
            await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log(`✅ Candidate agregado para ${data.clientId}`);
          } catch (err) {
            console.error("Error agregando ICE candidate:", err);
          }
        }
      }
    };

    signalingServer.addEventListener("message", handleMessage);
    return () => signalingServer.removeEventListener("message", handleMessage);
  }, [signalingServer]);

  // Crear conexión WebRTC con un oyente
  const createPeer = async (clientId) => {
    if (peers.current[clientId]) {
      console.log(`Ya existe conexión con ${clientId}`);
      return;
    }

    console.log(`Creando peer para: ${clientId}`);
    const peer = new RTCPeerConnection();
    peers.current[clientId] = peer;

    // Agregar tracks de audio
    streamRef.current.getTracks().forEach((track) => {
      peer.addTrack(track, streamRef.current);
    });

    // Manejo de ICE candidates
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`Enviando candidate a ${clientId}:`, event.candidate);
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
      console.log(`Enviando offer a ${clientId}:`, offer);

      signalingServer.send(
        JSON.stringify({ type: "offer", offer, target: clientId })
      );
    } catch (err) {
      console.error("Error creando oferta:", err);
    }
  };

  // Iniciar transmisión
  const startBroadcast = async () => {
    if (!streamRef.current) {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        console.log("🎤 Acceso a micrófono concedido");
      } catch (err) {
        console.error("No se pudo acceder al micrófono:", err);
        return;
      }
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
