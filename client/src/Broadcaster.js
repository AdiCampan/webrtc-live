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

function Broadcaster({ signalingServer, language, setRole }) {
  const peers = useRef({});
  const streamRef = useRef(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);

  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const dataFreqRef = useRef(null);
  const dataWaveRef = useRef(null);
  const animRef = useRef(null);

  // Enumerar micrófonos
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const mics = devices.filter((d) => d.kind === "audioinput");
      setAudioDevices(mics);
      if (mics.length > 0) setSelectedDeviceId(mics[0].deviceId);
    });
  }, []);

  // Manejar mensajes WebSocket
  useEffect(() => {
    const handleMessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log("📩 Broadcaster recibió:", data);

      if (data.type === "request-offer") {
        if (!streamRef.current) {
          console.warn("⚠️ No hay stream activo, no se puede crear Peer");
          return;
        }
        // Elimina Peer antiguo si existe para el mismo clientId
        if (peers.current[data.clientId]) {
          peers.current[data.clientId].close();
          delete peers.current[data.clientId];
        }
        await createPeer(data.clientId);
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

  // Crear PeerConnection para cada Listener
  const createPeer = async (clientId) => {
    console.log("🆕 Creando PeerConnection para", clientId);
    const peer = new RTCPeerConnection(rtcConfig);
    peers.current[clientId] = peer;

    // Agregar pistas de audio
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        peer.addTrack(track, streamRef.current);
      });
    }

    // ICE reconexión
    peer.oniceconnectionstatechange = async () => {
      const state = peer.iceConnectionState;
      console.log(`🔄 ICE state con ${clientId}:`, state);

      if (state === "failed" || state === "disconnected") {
        console.warn(`⚠️ ICE falló con ${clientId}, intentando restartIce`);
        try {
          await peer.restartIce();
          const offer = await peer.createOffer({ iceRestart: true });
          await peer.setLocalDescription(offer);
          signalingServer.send(
            JSON.stringify({ type: "offer", offer, target: clientId })
          );
        } catch (err) {
          console.error("❌ restartIce falló, recreando Peer:", err);
          delete peers.current[clientId];
          await createPeer(clientId);
        }
      }
    };

    // Enviar candidates
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

    // Crear y enviar offer
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      signalingServer.send(
        JSON.stringify({ type: "offer", offer, target: clientId })
      );
      console.log("📤 Offer enviada a", clientId);
    } catch (err) {
      console.error("❌ Error creando oferta:", err);
    }
  };

  // Iniciar transmisión
  const startBroadcast = async () => {
    if (!streamRef.current) {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId } }
            : true,
        });

        // Configurar visualizador
        if (!audioCtxRef.current) {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          audioCtxRef.current = new AudioCtx();
          const analyser = audioCtxRef.current.createAnalyser();
          analyser.fftSize = 1024;
          analyserRef.current = analyser;

          const src = audioCtxRef.current.createMediaStreamSource(
            streamRef.current
          );
          src.connect(analyser);
          dataFreqRef.current = new Uint8Array(analyser.frequencyBinCount);
          dataWaveRef.current = new Uint8Array(analyser.fftSize);

          const draw = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            const width = canvas.width;
            const height = canvas.height;
            ctx.clearRect(0, 0, width, height);

            analyser.getByteTimeDomainData(dataWaveRef.current);
            ctx.lineWidth = 2;
            ctx.strokeStyle = "lime";
            ctx.beginPath();
            let x = 0;
            const slice = width / dataWaveRef.current.length;
            for (let i = 0; i < dataWaveRef.current.length; i++) {
              const v = dataWaveRef.current[i] / 128.0;
              const y = (v * height) / 2;
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
              x += slice;
            }
            ctx.stroke();

            analyser.getByteFrequencyData(dataFreqRef.current);
            const barWidth = Math.max(1, width / dataFreqRef.current.length);
            for (let i = 0; i < dataFreqRef.current.length; i++) {
              const barHeight = (dataFreqRef.current[i] / 255) * height;
              ctx.fillStyle = "rgba(0,255,255,0.4)";
              ctx.fillRect(
                i * barWidth,
                height - barHeight,
                barWidth,
                barHeight
              );
            }

            animRef.current = requestAnimationFrame(draw);
          };
          animRef.current = requestAnimationFrame(draw);
        }
      } catch (err) {
        console.error("❌ Error accediendo micrófono:", err);
        return;
      }
    }

    // Registrar Broadcaster
    signalingServer.send(JSON.stringify({ type: "broadcaster", language }));
    setBroadcasting(true);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      Object.values(peers.current).forEach((p) => p.close());
      peers.current = {};
    };
  }, []);

  return (
    <div className="broadcaster-container">
      <div>
        🚀 Emitir en{" "}
        {language === "es"
          ? "Español"
          : language === "en"
          ? "Inglés"
          : "Rumano"}
      </div>
      <div className="mic-selector">
        <label>🎤 Seleccionar micrófono:</label>
        <select
          value={selectedDeviceId || ""}
          onChange={(e) => setSelectedDeviceId(e.target.value)}
        >
          {audioDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || d.deviceId}
            </option>
          ))}
        </select>
      </div>

      <button onClick={startBroadcast} disabled={broadcasting}>
        {broadcasting ? "🔴 Transmitiendo..." : "🚀 Iniciar Transmisión"}
      </button>

      {broadcasting && (
        <>
          <button
            onClick={() => {
              if (streamRef.current)
                streamRef.current.getTracks().forEach((t) => t.stop());
              streamRef.current = null;

              Object.values(peers.current).forEach((p) => p.close());
              peers.current = {};

              if (animRef.current) cancelAnimationFrame(animRef.current);
              if (audioCtxRef.current && audioCtxRef.current.state !== "closed")
                audioCtxRef.current.close().catch(() => {});

              setBroadcasting(false);
              if (typeof setRole === "function") setRole(null);
            }}
          >
            🛑 Parar Transmisión
          </button>

          <canvas
            ref={canvasRef}
            width={600}
            height={200}
            style={{
              border: "1px solid black",
              borderRadius: "15px",
              marginTop: "10px",
            }}
          />
        </>
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
