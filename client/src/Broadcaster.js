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
  const heartbeatRef = useRef(null); // 🔹 Heartbeat para mantener registro activo

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
    if (!signalingServer) return; // No hacer nada si no hay socket

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

        const existingPeer = peers.current[data.clientId];
        if (existingPeer) {
          const state = existingPeer.iceConnectionState;
          if (state === "connected" || state === "completed") {
            console.log(`🟢 El cliente ${data.clientId} ya está conectado. Ignorando oferta redundante.`);
            return;
          }
          // Si el estado es desconectado o fallido, limpiamos y creamos uno nuevo
          existingPeer.close();
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
      // Listener se desconectó → cerrar solo su PeerConnection
      // ==========================
      if (data.type === "stop-connection" && data.target) {
        console.log("🛑 Cerrando PeerConnection del oyente:", data.target);

        const peer = peers.current[data.target];
        if (peer) {
          try {
            peer.close();
            console.log("✔️ PeerConnection cerrada:", data.target);
          } catch (err) {
            console.warn("⚠️ Error al cerrar peer:", err);
          }
          delete peers.current[data.target];
        }
        return;
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
    return () => {
      if (signalingServer) {
        signalingServer.removeEventListener("message", handleMessage);
      }
    };
  }, [signalingServer]);

  const createPeer = async (clientId) => {
    if (!signalingServer || signalingServer.readyState !== WebSocket.OPEN) {
      console.warn("⚠️ No hay socket disponible para crear peer, esperando...");
      // Intentar de nuevo después de un breve delay
      setTimeout(() => {
        if (signalingServer && signalingServer.readyState === WebSocket.OPEN) {
          createPeer(clientId);
        }
      }, 1000);
      return;
    }

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

      if (state === "disconnected") {
        console.log(`⏳ ICE Disconnected con ${clientId}. Dando 120s para recuperación automática...`);
        // No hacemos nada, dejamos que WebRTC intente recuperar solo
        setTimeout(async () => {
          const currentState = peers.current[clientId]?.iceConnectionState;
          if (currentState === "disconnected" || currentState === "failed") {
            console.warn(`🔄 Procediendo con restartIce para ${clientId} tras espera de 120s.`);
            try {
              const p = peers.current[clientId];
              if (!p) return;
              await p.restartIce();
              const offer = await p.createOffer({ iceRestart: true });
              await p.setLocalDescription(offer);
              if (signalingServer?.readyState === WebSocket.OPEN) {
                signalingServer.send(JSON.stringify({ type: "offer", offer, target: clientId }));
              }
            } catch (err) {
              console.error("❌ restartIce falló:", err);
            }
          }
        }, 120000);
      }

      if (state === "failed") {
        console.error(`❌ ICE Falló con ${clientId}. Recreando Peer.`);
        delete peers.current[clientId];
        await createPeer(clientId);
      }
    };

    peer.onicecandidate = (event) => {
      if (
        event.candidate &&
        signalingServer &&
        signalingServer.readyState === WebSocket.OPEN
      ) {
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
      if (signalingServer && signalingServer.readyState === WebSocket.OPEN) {
        signalingServer.send(
          JSON.stringify({ type: "offer", offer, target: clientId })
        );
        console.log("📤 Offer enviada a", clientId);
      } else {
        console.warn("⚠️ Socket no disponible al crear offer, reintentando...");
        setTimeout(() => {
          if (
            signalingServer &&
            signalingServer.readyState === WebSocket.OPEN &&
            peers.current[clientId]
          ) {
            signalingServer.send(
              JSON.stringify({ type: "offer", offer, target: clientId })
            );
          }
        }, 1000);
      }
    } catch (err) {
      console.error("❌ Error creando oferta:", err);
    }
  };

  // 🔹 Heartbeat para mantener registro activo
  const startHeartbeat = () => {
    if (heartbeatRef.current) return;
    
    heartbeatRef.current = setInterval(() => {
      if (
        broadcasting &&
        selectedLanguage &&
        token &&
        signalingServer &&
        signalingServer.readyState === WebSocket.OPEN
      ) {
        try {
          signalingServer.send(
            JSON.stringify({
              type: "broadcaster",
              language: selectedLanguage,
              token: token,
            })
          );
          console.log("💓 Heartbeat: Broadcaster re-registrado");
        } catch (e) {
          console.warn("⚠️ Error en heartbeat:", e);
        }
      }
    }, 10000); // Cada 10 segundos
  };

  const stopHeartbeat = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
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
          
          // 🔹 OPTIMIZACIÓN: Solo redimensionar si el tamaño ha cambiado
          // Redimensionar el canvas en cada frame (60fps) es muy costoso y causa glitches
          if (canvas.width !== rect.width || canvas.height !== rect.height) {
            canvas.width = rect.width;
            canvas.height = rect.height;
          }
          
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

    // Función helper para enviar registro cuando el socket esté listo
    const sendBroadcastRegistration = () => {
      if (signalingServer && signalingServer.readyState === WebSocket.OPEN) {
        signalingServer.send(
          JSON.stringify({ 
            type: "broadcaster", 
            language: activeLang, 
            token,
            clientId: "broadcaster-" + activeLang
          })
        );
        console.log("✅ Broadcaster registrado en servidor");
      } else if (signalingServer) {
        // Si el socket no está abierto, esperar a que se abra
        const handleOpen = () => {
          if (signalingServer.readyState === WebSocket.OPEN) {
            signalingServer.send(
              JSON.stringify({
                type: "broadcaster",
                language: activeLang,
                token,
                clientId: "broadcaster-" + activeLang
              })
            );
            console.log(
              "✅ Broadcaster registrado después de esperar a socket"
            );
          }
          signalingServer.removeEventListener("open", handleOpen);
        };
        signalingServer.addEventListener("open", handleOpen, { once: true });
      } else {
        console.warn(
          "⚠️ No hay socket disponible, se registrará cuando se reconecte"
        );
      }
    };

    // 🔹 REFORZADO: Enviar identificación inmediata si el socket ya está abierto
    if (signalingServer && signalingServer.readyState === WebSocket.OPEN) {
      signalingServer.send(JSON.stringify({ 
        type: "identify", 
        clientId: "broadcaster-" + activeLang 
      }));
    }

    sendBroadcastRegistration();

    setBroadcasting(true);
    startHeartbeat(); // 🔹 Iniciar heartbeat para mantener registro
    if (onBroadcastingState) onBroadcastingState(true); // INFORMAR A APP
  };

  // Cuando se detiene la transmisión:
  const stopBroadcast = () => {
    stopHeartbeat(); // 🔹 Detener heartbeat
    if (broadcasting && selectedLanguage) {
      if (signalingServer && signalingServer.readyState === WebSocket.OPEN) {
        signalingServer.send(
          JSON.stringify({ type: "stop-broadcast", language: selectedLanguage })
        );
      }
      if (onLanguageActive) onLanguageActive(null);
    }

    // ⚠️ IMPORTANTE: Solo detener el stream si realmente el usuario quiere parar
    // NO detener durante microcortes de red
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

  // Cleanup - solo cuando el componente se desmonta completamente
  useEffect(() => {
    return () => {
      // Solo limpiar si realmente estamos desmontando el componente
      // No limpiar durante reconexiones
      stopHeartbeat(); // 🔹 Detener heartbeat
      if (streamRef.current)
        streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      Object.values(peers.current).forEach((p) => p.close());
      peers.current = {};
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed")
        audioCtxRef.current.close().catch(() => {});
      if (onBroadcastingState) onBroadcastingState(false);
    };
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
