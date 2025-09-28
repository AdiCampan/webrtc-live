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
      console.log("📩 Broadcaster recibió:", data);

      if (data.type === "request-offer") {
        if (streamRef.current) {
          console.log(`🎯 Creando Peer para Listener ${data.clientId}`);
          await createPeer(data.clientId);
        } else {
          console.warn(
            "⚠️ Un oyente pidió oferta, pero no hay transmisión activa"
          );
        }
      }

      if (data.type === "answer") {
        const peer = peers.current[data.clientId];
        if (peer) {
          try {
            console.log(`✅ Recibida answer de ${data.clientId}`);
            await peer.setRemoteDescription(
              new RTCSessionDescription(data.answer)
            );
          } catch (err) {
            console.error("❌ Error al aplicar answer:", err);
          }
        }
      }

      if (data.type === "candidate") {
        const peer = peers.current[data.clientId];
        if (peer) {
          try {
            console.log(`💡 Agregando ICE candidate de ${data.clientId}`);
            await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (err) {
            console.error("❌ Error agregando ICE candidate:", err);
          }
        }
      }
    };

    signalingServer.addEventListener("message", handleMessage);
    return () => signalingServer.removeEventListener("message", handleMessage);
  }, [signalingServer]);

  const createPeer = async (clientId) => {
    if (peers.current[clientId]) {
      console.log("⚠️ Ya existe conexión con", clientId);
      return;
    }

    const peer = new RTCPeerConnection();
    peers.current[clientId] = peer;
    console.log("🔗 PeerConnection creado para", clientId);

    streamRef.current.getTracks().forEach((track) => {
      peer.addTrack(track, streamRef.current);
    });

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        signalingServer.send(
          JSON.stringify({
            type: "candidate",
            candidate: event.candidate,
            target: clientId,
          })
        );
        console.log(`💬 Enviando ICE candidate a ${clientId}`);
      }
    };

    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      signalingServer.send(
        JSON.stringify({ type: "offer", offer, target: clientId })
      );
      console.log(`📡 Oferta enviada a ${clientId}`);
    } catch (err) {
      console.error("❌ Error creando oferta:", err);
    }
  };

  const startBroadcast = async () => {
    if (!streamRef.current) {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
      } catch (err) {
        console.error("❌ No se pudo acceder al micrófono:", err);
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
