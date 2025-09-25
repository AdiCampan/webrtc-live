import React, { useRef, useEffect, useState } from "react";
import "./Broadcaster.css";

function Broadcaster({ signalingServer }) {
  const peers = useRef({});
  const streamRef = useRef(null);
  const [broadcasting, setBroadcasting] = useState(false);

  useEffect(() => {
    const handleMessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "request-offer") {
        if (!streamRef.current) return;
        if (!peers.current[data.clientId]) {
          await createPeer(data.clientId);
        }
      }

      if (data.type === "answer") {
        const peer = peers.current[data.clientId];
        if (peer) {
          await peer.setRemoteDescription(
            new RTCSessionDescription(data.answer)
          );
        }
      }

      if (data.type === "candidate") {
        const peer = peers.current[data.clientId];
        if (peer) {
          await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      }
    };

    signalingServer.addEventListener("message", handleMessage);
    return () => signalingServer.removeEventListener("message", handleMessage);
  }, [signalingServer]);

  const createPeer = async (clientId) => {
    const peer = new RTCPeerConnection();
    peers.current[clientId] = peer;

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
      }
    };

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    signalingServer.send(
      JSON.stringify({ type: "offer", offer, target: clientId })
    );
  };

  const startBroadcast = async () => {
    if (!streamRef.current) {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
      } catch (err) {
        console.error("No se pudo acceder al micrófono", err);
        return;
      }
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
