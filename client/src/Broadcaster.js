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

  // Visualizador
  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const dataFreqRef = useRef(null);
  const dataWaveRef = useRef(null);
  const animRef = useRef(null);

  // Manejar mensajes WebSocket
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

  // Crear PeerConnection
  const createPeer = async (clientId) => {
    if (peers.current[clientId]) return;

    console.log("🆕 Creando PeerConnection para", clientId);
    const peer = new RTCPeerConnection(rtcConfig);
    peers.current[clientId] = peer;

    peer.oniceconnectionstatechange = () => {
      console.log(`🔄 ICE state con ${clientId}:`, peer.iceConnectionState);
    };

    streamRef.current
      .getTracks()
      .forEach((track) => peer.addTrack(track, streamRef.current));

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

        // === Configurar visualizador ===
        if (!audioCtxRef.current) {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          audioCtxRef.current = new AudioCtx();

          const analyser = audioCtxRef.current.createAnalyser();
          analyser.fftSize = 1024; // menor carga para móviles
          analyserRef.current = analyser;

          const src = audioCtxRef.current.createMediaStreamSource(
            streamRef.current
          );
          src.connect(analyser);

          dataFreqRef.current = new Uint8Array(analyser.frequencyBinCount);
          dataWaveRef.current = new Uint8Array(analyser.fftSize);

          const draw = () => {
            const canvas = canvasRef.current;
            const analyserLocal = analyserRef.current;
            if (!canvas || !analyserLocal) return;

            const ctx = canvas.getContext("2d");
            const width = canvas.width;
            const height = canvas.height;
            ctx.clearRect(0, 0, width, height);

            // Waveform
            analyserLocal.getByteTimeDomainData(dataWaveRef.current);
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

            // Spectrum
            analyserLocal.getByteFrequencyData(dataFreqRef.current);
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
          console.log("🔎 Visualizer Broadcaster iniciado");
        }
      } catch (err) {
        console.error("❌ Error accediendo micrófono:", err);
        return;
      }
    }

    if (signalingServer.readyState === WebSocket.OPEN) {
      signalingServer.send(JSON.stringify({ type: "broadcaster", language }));
      console.log(`📤 Registrado como Broadcaster (${language})`);
    } else {
      console.error("❌ WebSocket no abierto");
    }

    setBroadcasting(true);
  };

  // Limpiar visualizador al desmontar
  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  return (
    <div className="broadcaster-container">
      <div className="broadcaster-language">
        🚀 Emitir en{" "}
        {language === "espanol"
          ? "Español"
          : language === "ingles"
          ? "Inglés"
          : "Rumano"}
      </div>
      <button
        onClick={startBroadcast}
        disabled={broadcasting}
        className="broadcast-btn"
      >
        {broadcasting ? "🔴 Transmitiendo..." : "🚀 Iniciar Transmisión"}
      </button>

      {broadcasting && (
        <>
          <div className="broadcasting-text">Tu transmisión está activa</div>
          <button
            onClick={() => {
              // Detener transmisión
              if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
              }

              // Detener visualizador
              if (animRef.current) cancelAnimationFrame(animRef.current);
              if (
                audioCtxRef.current &&
                audioCtxRef.current.state !== "closed"
              ) {
                audioCtxRef.current.close().catch(() => {});
                audioCtxRef.current = null;
              }

              // Regresar a pantalla Home
              if (typeof setRole === "function") setRole(null);
            }}
            className="btn-stop"
          >
            🛑 Parar Transmisión
          </button>

          <canvas
            ref={canvasRef}
            width={600}
            height={200}
            style={{
              border: "1px solid black",
              marginTop: "10px",
              borderRadius: "15px",
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
