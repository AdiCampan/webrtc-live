import React, { useRef, useEffect, useState } from "react";
import "./Broadcaster.css";
import spanishFlag from "./Assets/spanish-flag4.webp";
import englishFlag from "./Assets/english-flag.webp";
import romanianFlag from "./Assets/romanian-flag2.webp";
import liveMicIcon from "./Assets/live.png";

// 🔹 Configuración ICE desde variables de entorno
const rtcConfig = {
  iceServers: [
    process.env.REACT_APP_STUN_URL && { urls: process.env.REACT_APP_STUN_URL },

    process.env.REACT_APP_TURN_URL && {
      urls: process.env.REACT_APP_TURN_URL,
      username: process.env.REACT_APP_TURN_USERNAME,
      credential: process.env.REACT_APP_TURN_CREDENTIAL,
    },

    process.env.REACT_APP_TURN_TCP_URL && {
      urls: process.env.REACT_APP_TURN_TCP_URL,
      username: process.env.REACT_APP_TURN_USERNAME,
      credential: process.env.REACT_APP_TURN_CREDENTIAL,
    },

    process.env.REACT_APP_TURN_443_URL && {
      urls: process.env.REACT_APP_TURN_443_URL,
      username: process.env.REACT_APP_TURN_USERNAME,
      credential: process.env.REACT_APP_TURN_CREDENTIAL,
    },

    process.env.REACT_APP_TURNS_443_TCP_URL && {
      urls: process.env.REACT_APP_TURNS_443_TCP_URL,
      username: process.env.REACT_APP_TURN_USERNAME,
      credential: process.env.REACT_APP_TURN_CREDENTIAL,
    },
  ].filter(Boolean),
};

function Broadcaster({
  signalingServer,
  language,
  token,
  setRole,
  onLanguageActive,
  onBroadcastingState, // NUEVO callback para App.js
  reconnecting = false, // NUEVO estado para mostrar reconexión
}) {
  const peers = useRef({});
  const streamRef = useRef(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState(null);
  const [listenerCounts, setListenerCounts] = useState({ es: 0, en: 0, ro: 0 });
  const [prevCount, setPrevCount] = useState(0);
  const [pop, setPop] = useState(false);

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

  useEffect(() => {
    if (selectedLanguage) {
      const current = listenerCounts[selectedLanguage] || 0;
      if (current !== prevCount) {
        setPop(true);
        setTimeout(() => setPop(false), 200); // duración de la animación
        setPrevCount(current);
      }
    }
  }, [listenerCounts, selectedLanguage, prevCount]);

  // Manejar mensajes WebSocket
  useEffect(() => {
    const handleMessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log("📩 Broadcaster recibió:", data);

      // ==========================
      // Mensajes WebRTC
      // ==========================
      if (data.type === "request-offer") {
        if (!streamRef.current) {
          console.warn("⚠️ No hay stream activo, no se puede crear Peer");
          return;
        }
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

      // ==========================
      // Actualizar número de oyentes en tiempo real
      // ==========================
      if (data.type === "listeners-count") {
        setListenerCounts((prev) => ({
          ...prev,
          ...data.listeners,
        }));
        console.log("👂 Oyentes activos:", data.listeners);
      }
    };

    signalingServer.addEventListener("message", handleMessage);
    return () => signalingServer.removeEventListener("message", handleMessage);
  }, [signalingServer]);

  const createPeer = async (clientId) => {
    console.log("🆕 Creando PeerConnection para", clientId);
    const peer = new RTCPeerConnection(rtcConfig);
    peers.current[clientId] = peer;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        peer.addTrack(track, streamRef.current);
      });
    }

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

  // Cuando se inicia la transmisión:
  const startBroadcast = async (lang) => {
    const activeLang = lang || selectedLanguage || language;

    if (!token) {
      alert("⚠️ No tienes autorización para emitir. Por favor inicia sesión.");
      return;
    }

    if (!activeLang) {
      alert("⚠️ Por favor selecciona un idioma para transmitir.");
      return;
    }

    setSelectedLanguage(activeLang);
    if (onLanguageActive) onLanguageActive(activeLang);

    if (!streamRef.current) {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId } }
            : true,
        });

        if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
          await audioCtxRef.current.close();
        }

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
        await audioCtxRef.current.resume();

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
          if (!canvas) {
            animRef.current = requestAnimationFrame(draw);
            return;
          }

          const ctx = canvas.getContext("2d");
          const rect = canvas.getBoundingClientRect();
          canvas.width = rect.width;
          canvas.height = rect.height;
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
            ctx.fillRect(i * barWidth, height - barHeight, barWidth, barHeight);
          }

          animRef.current = requestAnimationFrame(draw);
        };

        animRef.current = requestAnimationFrame(draw);
      } catch (err) {
        console.error("❌ Error accediendo micrófono:", err);
        return;
      }
    }

    if (signalingServer.readyState === WebSocket.OPEN) {
      signalingServer.send(
        JSON.stringify({ type: "broadcaster", language: activeLang, token })
      );
    } else {
      signalingServer.addEventListener(
        "open",
        () => {
          signalingServer.send(
            JSON.stringify({ type: "broadcaster", language: activeLang, token })
          );
        },
        { once: true }
      );
    }

    setBroadcasting(true);
    if (onBroadcastingState) onBroadcastingState(true); // INFORMAR A APP
  };

  // Cuando se detiene la transmisión:
  const stopBroadcast = () => {
    if (broadcasting && selectedLanguage) {
      if (signalingServer.readyState === WebSocket.OPEN) {
        signalingServer.send(
          JSON.stringify({ type: "stop-broadcast", language: selectedLanguage })
        );
      }
      if (onLanguageActive) onLanguageActive(null);
    }

    if (streamRef.current)
      streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    Object.values(peers.current).forEach((p) => p.close());
    peers.current = {};
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed")
      audioCtxRef.current.close().catch(() => {});

    setBroadcasting(false);
    if (onBroadcastingState) onBroadcastingState(false); // INFORMAR A APP
    setSelectedLanguage(null);
  };

  // Cleanup
  useEffect(() => {
    return () => stopBroadcast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBack = () => {
    stopBroadcast();
  };

  return (
    <div className="broadcaster-container">
      {reconnecting && (
        <div className="reconnecting-overlay">
          <span>Reconectando con el servidor...</span>
        </div>
      )}
      {!language && !selectedLanguage ? (
        <>
          <h3>🎙️ Selecciona el idioma que deseas transmitir</h3>
          <div className="language-buttons">
            {[
              { code: "es", label: "Emitir", img: spanishFlag },
              { code: "en", label: "Broadcast", img: englishFlag },
              { code: "ro", label: "Transmite", img: romanianFlag },
            ].map(({ code, label, img }) => (
              <div className="language-option" key={code}>
                <button
                  className="btn-language"
                  onClick={() => setSelectedLanguage(code)}
                >
                  <img src={img} alt={label} />
                </button>
                <span className="btn-label">{label}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="broadcast-panel">
          {!broadcasting ? (
            <>
              <h3 className="broadcast-title">
                🚀 Transmitiendo en{" "}
                <span className="lang-highlight">
                  {selectedLanguage === "es"
                    ? "Español"
                    : selectedLanguage === "en"
                    ? "Inglés"
                    : "Rumano"}
                </span>
              </h3>
              <div className="mic-selector">
                <label htmlFor="mic">🎤 Micrófono:</label>
                <select
                  id="mic"
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
              <button
                className="broadcast-btn"
                onClick={() => startBroadcast(selectedLanguage || language)}
              >
                🚀 Iniciar Transmisión
              </button>
              <button className="back-btn" onClick={handleBack}>
                ⬅️ Volver
              </button>
            </>
          ) : (
            <div className="broadcasting-section">
              <div className="broadcasting-header">
                <img src={liveMicIcon} alt="live icon" className="live-icon" />
                <h3 className="broadcasting-text">
                  Emitiendo en{" "}
                  {selectedLanguage === "es"
                    ? "Español"
                    : selectedLanguage === "en"
                    ? "Inglés"
                    : "Rumano"}
                </h3>
                <span
                  className={`listener-count-broadcaster ${pop ? "pop" : ""}`}
                >
                  👂 {listenerCounts[selectedLanguage] || 0} oyentes
                </span>
              </div>
              <canvas
                ref={canvasRef}
                width={600}
                height={200}
                className="audio-visualizer"
              />
              <button className="stop-btn" onClick={handleBack}>
                🛑 Parar Transmisión
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Broadcaster;

// import React, { useRef, useEffect, useState } from "react";
// import "./Broadcaster.css";
// import spanishFlag from "./Assets/spanish-flag4.webp";
// import englishFlag from "./Assets/english-flag.webp";
// import romanianFlag from "./Assets/romanian-flag2.webp";
// import liveMicIcon from "./Assets/live.png";

// // 🔹 Configuración ICE desde variables de entorno
// const rtcConfig = {
//   iceServers: [
//     process.env.REACT_APP_STUN_URL && { urls: process.env.REACT_APP_STUN_URL },

//     process.env.REACT_APP_TURN_URL && {
//       urls: process.env.REACT_APP_TURN_URL,
//       username: process.env.REACT_APP_TURN_USERNAME,
//       credential: process.env.REACT_APP_TURN_CREDENTIAL,
//     },

//     process.env.REACT_APP_TURN_TCP_URL && {
//       urls: process.env.REACT_APP_TURN_TCP_URL,
//       username: process.env.REACT_APP_TURN_USERNAME,
//       credential: process.env.REACT_APP_TURN_CREDENTIAL,
//     },

//     process.env.REACT_APP_TURN_443_URL && {
//       urls: process.env.REACT_APP_TURN_443_URL,
//       username: process.env.REACT_APP_TURN_USERNAME,
//       credential: process.env.REACT_APP_TURN_CREDENTIAL,
//     },

//     process.env.REACT_APP_TURNS_443_TCP_URL && {
//       urls: process.env.REACT_APP_TURNS_443_TCP_URL,
//       username: process.env.REACT_APP_TURN_USERNAME,
//       credential: process.env.REACT_APP_TURN_CREDENTIAL,
//     },
//   ].filter(Boolean), // 👈 elimina las entradas undefined automáticamente
// };

// function Broadcaster({
//   signalingServer,
//   language,
//   token,
//   setRole,
//   onLanguageActive,
// }) {
//   const peers = useRef({});
//   const streamRef = useRef(null);
//   const [broadcasting, setBroadcasting] = useState(false);
//   const [audioDevices, setAudioDevices] = useState([]);
//   const [selectedDeviceId, setSelectedDeviceId] = useState(null);
//   const [selectedLanguage, setSelectedLanguage] = useState(null);
//   const canvasRef = useRef(null);
//   const audioCtxRef = useRef(null);
//   const analyserRef = useRef(null);
//   const dataFreqRef = useRef(null);
//   const dataWaveRef = useRef(null);
//   const animRef = useRef(null);

//   // Enumerar micrófonos
//   useEffect(() => {
//     navigator.mediaDevices.enumerateDevices().then((devices) => {
//       const mics = devices.filter((d) => d.kind === "audioinput");
//       setAudioDevices(mics);
//       if (mics.length > 0) setSelectedDeviceId(mics[0].deviceId);
//     });
//   }, []);

//   // Manejar mensajes WebSocket
//   useEffect(() => {
//     const handleMessage = async (event) => {
//       const data = JSON.parse(event.data);
//       console.log("📩 Broadcaster recibió:", data);

//       if (data.type === "request-offer") {
//         if (!streamRef.current) {
//           console.warn("⚠️ No hay stream activo, no se puede crear Peer");
//           return;
//         }
//         // Elimina Peer antiguo si existe para el mismo clientId
//         if (peers.current[data.clientId]) {
//           peers.current[data.clientId].close();
//           delete peers.current[data.clientId];
//         }
//         await createPeer(data.clientId);
//       }

//       if (data.type === "answer") {
//         const peer = peers.current[data.clientId];
//         if (peer) {
//           try {
//             await peer.setRemoteDescription(
//               new RTCSessionDescription(data.answer)
//             );
//             console.log("✅ Answer aplicada de", data.clientId);
//           } catch (err) {
//             console.error("❌ Error aplicando answer:", err);
//           }
//         }
//       }

//       if (data.type === "candidate") {
//         const peer = peers.current[data.clientId];
//         if (peer) {
//           try {
//             await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
//             console.log("✅ Candidate agregado de", data.clientId);
//           } catch (err) {
//             console.error("❌ Error agregando candidate:", err);
//           }
//         }
//       }
//     };

//     signalingServer.addEventListener("message", handleMessage);
//     return () => signalingServer.removeEventListener("message", handleMessage);
//   }, [signalingServer]);

//   // Crear PeerConnection para cada Listener
//   const createPeer = async (clientId) => {
//     console.log("🆕 Creando PeerConnection para", clientId);
//     const peer = new RTCPeerConnection(rtcConfig);
//     peers.current[clientId] = peer;

//     if (streamRef.current) {
//       streamRef.current.getTracks().forEach((track) => {
//         peer.addTrack(track, streamRef.current);
//       });
//     }

//     peer.oniceconnectionstatechange = async () => {
//       const state = peer.iceConnectionState;
//       console.log(`🔄 ICE state con ${clientId}:`, state);

//       if (state === "failed" || state === "disconnected") {
//         console.warn(`⚠️ ICE falló con ${clientId}, intentando restartIce`);
//         try {
//           await peer.restartIce();
//           const offer = await peer.createOffer({ iceRestart: true });
//           await peer.setLocalDescription(offer);
//           signalingServer.send(
//             JSON.stringify({ type: "offer", offer, target: clientId })
//           );
//         } catch (err) {
//           console.error("❌ restartIce falló, recreando Peer:", err);
//           delete peers.current[clientId];
//           await createPeer(clientId);
//         }
//       }
//     };

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

//     try {
//       const offer = await peer.createOffer();
//       await peer.setLocalDescription(offer);
//       signalingServer.send(
//         JSON.stringify({ type: "offer", offer, target: clientId })
//       );
//       console.log("📤 Offer enviada a", clientId);
//     } catch (err) {
//       console.error("❌ Error creando oferta:", err);
//     }
//   };

//   // Iniciar transmisión
//   const startBroadcast = async (lang) => {
//     const activeLang = lang || selectedLanguage || language;

//     if (!token) {
//       alert("⚠️ No tienes autorización para emitir. Por favor inicia sesión.");
//       return;
//     }

//     if (!activeLang) {
//       alert("⚠️ Por favor selecciona un idioma para transmitir.");
//       return;
//     }
//     if (onLanguageActive) onLanguageActive(activeLang);

//     if (!streamRef.current) {
//       try {
//         // 🔹 Obtener el stream de audio del micrófono seleccionado
//         streamRef.current = await navigator.mediaDevices.getUserMedia({
//           audio: selectedDeviceId
//             ? { deviceId: { exact: selectedDeviceId } }
//             : true,
//         });

//         // 🔹 Visualizador de audio
//         // Cerrar AudioContext viejo si existe
//         if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
//           await audioCtxRef.current.close();
//         }

//         const AudioCtx = window.AudioContext || window.webkitAudioContext;
//         audioCtxRef.current = new AudioCtx();
//         await audioCtxRef.current.resume(); // ⚡ Asegurar que no esté suspendido

//         const analyser = audioCtxRef.current.createAnalyser();
//         analyser.fftSize = 1024;
//         analyserRef.current = analyser;

//         const src = audioCtxRef.current.createMediaStreamSource(
//           streamRef.current
//         );
//         src.connect(analyser);

//         // Opcional: si quieres escuchar el audio local
//         // analyser.connect(audioCtxRef.current.destination);

//         dataFreqRef.current = new Uint8Array(analyser.frequencyBinCount);
//         dataWaveRef.current = new Uint8Array(analyser.fftSize);

//         const draw = () => {
//           const canvas = canvasRef.current;
//           if (!canvas) {
//             animRef.current = requestAnimationFrame(draw);
//             return;
//           }

//           const ctx = canvas.getContext("2d");
//           const rect = canvas.getBoundingClientRect();
//           canvas.width = rect.width;
//           canvas.height = rect.height;
//           const width = canvas.width;
//           const height = canvas.height;

//           ctx.clearRect(0, 0, width, height);

//           // 🎵 Forma de onda
//           analyser.getByteTimeDomainData(dataWaveRef.current);
//           ctx.lineWidth = 2;
//           ctx.strokeStyle = "lime";
//           ctx.beginPath();
//           let x = 0;
//           const slice = width / dataWaveRef.current.length;
//           for (let i = 0; i < dataWaveRef.current.length; i++) {
//             const v = dataWaveRef.current[i] / 128.0;
//             const y = (v * height) / 2;
//             if (i === 0) ctx.moveTo(x, y);
//             else ctx.lineTo(x, y);
//             x += slice;
//           }
//           ctx.stroke();

//           // 🎚️ Frecuencia (barras)
//           analyser.getByteFrequencyData(dataFreqRef.current);
//           const barWidth = Math.max(1, width / dataFreqRef.current.length);
//           for (let i = 0; i < dataFreqRef.current.length; i++) {
//             const barHeight = (dataFreqRef.current[i] / 255) * height;
//             ctx.fillStyle = "rgba(0,255,255,0.4)";
//             ctx.fillRect(i * barWidth, height - barHeight, barWidth, barHeight);
//           }

//           animRef.current = requestAnimationFrame(draw);
//         };

//         animRef.current = requestAnimationFrame(draw);
//       } catch (err) {
//         console.error("❌ Error accediendo micrófono:", err);
//         return;
//       }
//     }

//     // 🔹 Registrar Broadcaster en el signaling server
//     console.log("📡 Registrando broadcaster en idioma:", activeLang);
//     if (signalingServer.readyState === WebSocket.OPEN) {
//       signalingServer.send(
//         JSON.stringify({ type: "broadcaster", language: activeLang, token })
//       );
//     } else {
//       signalingServer.addEventListener(
//         "open",
//         () => {
//           signalingServer.send(
//             JSON.stringify({ type: "broadcaster", language: activeLang, token })
//           );
//         },
//         { once: true }
//       );
//     }

//     setBroadcasting(true);
//   };

//   // Cleanup
//   useEffect(() => {
//     return () => {
//       if (animRef.current) cancelAnimationFrame(animRef.current);
//       if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
//         audioCtxRef.current.close().catch(() => {});
//       }
//       if (streamRef.current) {
//         streamRef.current.getTracks().forEach((t) => t.stop());
//         streamRef.current = null;
//       }
//       Object.values(peers.current).forEach((p) => p.close());
//       peers.current = {};
//     };
//   }, []);

//   const handleBack = () => {
//     if (broadcasting) {
//       // Si está transmitiendo, primero detener correctamente
//       if (streamRef.current)
//         streamRef.current.getTracks().forEach((t) => t.stop());
//       streamRef.current = null;
//       Object.values(peers.current).forEach((p) => p.close());
//       peers.current = {};
//       if (animRef.current) cancelAnimationFrame(animRef.current);
//       if (audioCtxRef.current && audioCtxRef.current.state !== "closed")
//         audioCtxRef.current.close().catch(() => {});
//       setBroadcasting(false);
//     }

//     // En cualquier caso, volvemos a la selección de idioma
//     setSelectedLanguage(null);
//   };

//   return (
//     <div className="broadcaster-container">
//       {!language && !selectedLanguage ? (
//         <>
//           <h2>🎙️ Selecciona el idioma que deseas transmitir</h2>

//           <div className="language-buttons">
//             <div className="language-option">
//               <button
//                 className="btn-language"
//                 onClick={() => setSelectedLanguage("es")}
//               >
//                 <img src={spanishFlag} alt="Español" />
//               </button>
//               <span className="btn-label">Emitir</span>
//             </div>

//             <div className="language-option">
//               <button
//                 className="btn-language"
//                 onClick={() => setSelectedLanguage("en")}
//               >
//                 <img src={englishFlag} alt="Inglés" />
//               </button>
//               <span className="btn-label">Broadcast</span>
//             </div>

//             <div className="language-option">
//               <button
//                 className="btn-language"
//                 onClick={() => setSelectedLanguage("ro")}
//               >
//                 <img src={romanianFlag} alt="Rumano" />
//               </button>
//               <span className="btn-label">Transmite</span>
//             </div>
//           </div>
//         </>
//       ) : (
//         <div className="broadcast-panel">
//           {/* Pantalla 1️⃣: Selección de micrófono y botones */}
//           {!broadcasting ? (
//             <>
//               <h3 className="broadcast-title">
//                 🚀 Transmitiendo en{" "}
//                 <span className="lang-highlight">
//                   {selectedLanguage === "es"
//                     ? "Español"
//                     : selectedLanguage === "en"
//                     ? "Inglés"
//                     : selectedLanguage === "ro"
//                     ? "Rumano"
//                     : language === "es"
//                     ? "Español"
//                     : language === "en"
//                     ? "Inglés"
//                     : "Rumano"}
//                 </span>
//               </h3>

//               <div className="mic-selector">
//                 <label htmlFor="mic">🎤 Micrófono:</label>
//                 <select
//                   id="mic"
//                   value={selectedDeviceId || ""}
//                   onChange={(e) => setSelectedDeviceId(e.target.value)}
//                 >
//                   {audioDevices.map((d) => (
//                     <option key={d.deviceId} value={d.deviceId}>
//                       {d.label || d.deviceId}
//                     </option>
//                   ))}
//                 </select>
//               </div>

//               <button
//                 className="broadcast-btn"
//                 onClick={() => startBroadcast(selectedLanguage || language)}
//               >
//                 🚀 Iniciar Transmisión
//               </button>

//               <button className="back-btn" onClick={handleBack}>
//                 ⬅️ Volver
//               </button>
//             </>
//           ) : (
//             <div className="broadcasting-section">
//               {/* Icono y texto "Emitiendo en ..." */}
//               <div className="broadcasting-header">
//                 <img src={liveMicIcon} alt="live icon" className="live-icon" />
//                 <h3 className="broadcasting-text">
//                   Emitiendo en{" "}
//                   {selectedLanguage === "es"
//                     ? "Español"
//                     : selectedLanguage === "en"
//                     ? "Inglés"
//                     : "Rumano"}
//                 </h3>
//               </div>

//               {/* Canvas */}
//               <canvas
//                 ref={canvasRef}
//                 width={600}
//                 height={200}
//                 className="audio-visualizer"
//               />

//               {/* Botón de detener transmisión */}
//               <button className="stop-btn" onClick={handleBack}>
//                 🛑 Parar Transmisión
//               </button>
//             </div>
//           )}
//         </div>
//       )}
//     </div>
//   );
// }

// export default Broadcaster;
