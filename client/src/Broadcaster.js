import React, { useRef, useEffect, useState } from "react";
import "./Broadcaster.css";

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.relay.metered.ca:80" },
    {
      urls: "turn:standard.relay.metered.ca:80",
      username: "a84708960fcf4892420ec951",
      credential: "TXNIBjBYy24WPj2r",
    },
    {
      urls: "turn:standard.relay.metered.ca:80?transport=tcp",
      username: "a84708960fcf4892420ec951",
      credential: "TXNIBjBYy24WPj2r",
    },
    {
      urls: "turn:standard.relay.metered.ca:443",
      username: "a84708960fcf4892420ec951",
      credential: "TXNIBjBYy24WPj2r",
    },
    {
      urls: "turns:standard.relay.metered.ca:443?transport=tcp",
      username: "a84708960fcf4892420ec951",
      credential: "TXNIBjBYy24WPj2r",
    },
  ],
};

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
          console.log("📡 Oyente pidió oferta:", data.clientId);
          await createPeer(data.clientId);
        } else {
          console.warn("⚠️ No hay transmisión activa para responder");
        }
      }

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

      if (data.type === "candidate") {
        const peer = peers.current[data.clientId];
        if (peer) {
          try {
            await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log("✅ Candidate agregado de", data.clientId);
          } catch (err) {
            console.error("❌ Error agregando candidate:", err);
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
      console.log("ℹ️ Ya existe peer con", clientId);
      return;
    }

    console.log("🆕 Creando PeerConnection para", clientId);
    const peer = new RTCPeerConnection(rtcConfig);
    peers.current[clientId] = peer;

    // Log de estados ICE
    peer.oniceconnectionstatechange = () => {
      console.log(`🔄 ICE state con ${clientId}:`, peer.iceConnectionState);
    };

    streamRef.current.getTracks().forEach((track) => {
      peer.addTrack(track, streamRef.current);
    });

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

    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      console.log("📤 Enviando offer a", clientId);
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
        console.log("🎙️ Solicitando micrófono...");
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        console.log("✅ Micrófono listo");
      } catch (err) {
        console.error("❌ Error accediendo micrófono:", err);
        return;
      }
    }

    if (signalingServer.readyState === WebSocket.OPEN) {
      signalingServer.send(JSON.stringify({ type: "broadcaster" }));
      console.log("📤 Registrado como Broadcaster");
    } else {
      console.error("❌ WebSocket no abierto");
    }

    setBroadcasting(true);
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
