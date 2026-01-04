import React, { useEffect, useRef, useState } from "react";
import "./Listener.css";
import { v4 as uuidv4 } from "uuid";

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

function Listener({ signalingServer, language, setRole }) {
  const pcRef = useRef(null);
  const audioRef = useRef(null);
  const videoHackRef = useRef(null); // Referencia para el video dummy
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [isStarted, setIsStarted] = useState(false);
  const candidateQueueRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animationRef = useRef(null);
  const [clientId] = useState(uuidv4());

  const requestOffer = () => {
    if (!signalingServer || signalingServer.readyState !== WebSocket.OPEN) {
      console.warn("WebSocket no disponible para solicitar oferta");
      return;
    }
    signalingServer.send(JSON.stringify({ type: "request-offer", language }));
    console.log("📡 Listener solicitó oferta para idioma", language);
    setStatus("requesting");
  };

  const drawSpectrum = () => {
    if (!analyserRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = dataArrayRef.current;

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyserRef.current.getByteFrequencyData(dataArray);

      ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] / 2;
        ctx.fillStyle = `rgb(${barHeight + 100}, 200, 100)`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    draw();
  };

  const setupAudioVisualizer = (stream) => {
    if (!stream) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          window.webkitAudioContext)();
      }
      const audioCtx = audioContextRef.current;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      source.connect(analyser);
      analyserRef.current = analyser;
      dataArrayRef.current = dataArray;

      drawSpectrum();
    } catch (err) {
      console.warn("No se pudo inicializar visualizador:", err);
    }
  };

  useEffect(() => {
    if (!signalingServer || !isStarted) return;

    const handleMessage = async (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      console.log("📩 Listener recibió:", data);

      if (data.type === "offer" && data.offer) {
        setStatus("connecting");

        if (pcRef.current) {
          try {
            pcRef.current.close();
          } catch { }
          pcRef.current = null;
        }

        const pc = new RTCPeerConnection(rtcConfig);
        pcRef.current = pc;

        pc.ontrack = (ev) => {
          const stream = ev.streams[0];
          if (audioRef.current) {
            audioRef.current.srcObject = stream;
            audioRef.current.play().catch(() => { });
          }
          setupAudioVisualizer(stream);
          setStatus("connected");
        };

        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            signalingServer.send(
              JSON.stringify({
                type: "candidate",
                candidate: ev.candidate,
                target: data.clientId,
              })
            );
          }
        };

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

          candidateQueueRef.current.forEach((c) => {
            pcRef.current
              .addIceCandidate(new RTCIceCandidate(c))
              .catch((err) => {
                console.warn("Error agregando candidate de cola:", err);
              });
          });
          candidateQueueRef.current = [];

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          signalingServer.send(
            JSON.stringify({ type: "answer", answer, target: data.clientId })
          );
          console.log("📤 Answer enviada");
        } catch (err) {
          console.error("Error procesando offer:", err);
          setStatus("error");
        }
      }

      if (data.type === "candidate" && data.candidate) {
        if (pcRef.current) {
          try {
            await pcRef.current.addIceCandidate(
              new RTCIceCandidate(data.candidate)
            );
          } catch (err) {
            console.warn("Error agregando candidate:", err);
          }
        } else {
          candidateQueueRef.current.push(data.candidate);
        }
      }
    };

    signalingServer.addEventListener("message", handleMessage);
    return () => signalingServer.removeEventListener("message", handleMessage);
  }, [signalingServer, isStarted]);

  useEffect(() => {
    if (!signalingServer || !isStarted) return;
    if (signalingServer.readyState === WebSocket.OPEN) {
      signalingServer.send(JSON.stringify({ type: "request-offer", language }));
    } else {
      signalingServer.addEventListener(
        "open",
        () => {
          signalingServer.send(
            JSON.stringify({ type: "request-offer", language })
          );
        },
        { once: true }
      );
    }
    return () => {
      signalingServer.removeEventListener("open", requestOffer);
      cancelAnimationFrame(animationRef.current);
      audioContextRef.current?.close();
      audioContextRef.current = null;
    };
  }, [signalingServer, language, isStarted]);

  const handleBack = () => {
    if (language && signalingServer.readyState === WebSocket.OPEN) {
      signalingServer.send(
        JSON.stringify({
          type: "stop-listening",
          language,
          clientId,
        })
      );
    }
    setRole(null);
    setIsStarted(false);
  };

  const handleStart = async () => {
    try {
      // 1. Reproducir silencio (Hack Audio Context)
      const silence = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU2LjYwLjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////////////////////////////////////8AAAAATGF2YzU2LjYwAAAAAAAAAAAAAAAAJAAAAAAAAAAAASAAAAEAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////////////////////////////////////8AAAAATGF2YzU2LjYwAAAAAAAAAAAAAAAAJAAAAAAAAAAAASAAAAEAAAAA";
      const audio = new Audio(silence);
      audio.loop = true;
      await audio.play().catch(e => console.warn("Error play audio hack", e));

      // 2. Reproducir Video Dummy (Hack Background Persistence)
      // WebM negro mínimo 1px
      if (videoHackRef.current) {
        videoHackRef.current.volume = 0; // Asegurar silencio
        await videoHackRef.current.play().catch(e => console.warn("Error play video hack", e));
      }

      // 3. Configurar Media Session
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Traducción en Vivo',
          artist: 'EBEN-EZER Media',
          album: 'Culto en Vivo',
          artwork: [
            { src: '/logo192.png', sizes: '192x192', type: 'image/png' },
            { src: '/logo512.png', sizes: '512x512', type: 'image/png' }
          ]
        });

        // Handlers dummy para mantener la sesion viva
        navigator.mediaSession.setActionHandler('play', () => {
          if (videoHackRef.current) videoHackRef.current.play();
          if (audioRef.current) audioRef.current.play();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          // Ignoramos pausa para evitar desconexión
          if (videoHackRef.current) videoHackRef.current.play();
        });
      }

      setIsStarted(true);
    } catch (err) {
      console.error("Error iniciando hacks:", err);
      // Continuamos igual para no bloquear al usuario
      setIsStarted(true);
    }
  };

  if (!isStarted) {
    return (
      <div className="listener-wrapper">
        <h3 className="listener-title">
          🎧 Escuchando en{" "}
          {language === "es"
            ? "Español"
            : language === "en"
              ? "Inglés"
              : "Rumano"}
        </h3>
        <div className="start-container" style={{ textAlign: "center", padding: "40px" }}>
          <button
            className="btn-start-audio"
            onClick={handleStart}
            style={{
              padding: "20px 40px",
              fontSize: "24px",
              background: "#2ecc71",
              color: "white",
              border: "none",
              borderRadius: "50px",
              cursor: "pointer",
              boxShadow: "0 4px 15px rgba(46, 204, 113, 0.4)",
              transition: "transform 0.2s"
            }}
          >
            🔊 Tocar para Activar Audio
          </button>
          <p style={{ marginTop: "20px", color: "#666" }}>
            Necesario para escuchar en segundo plano
          </p>
          <button className="btn-back" onClick={() => handleBack()} style={{ marginTop: "20px" }}>
            ← Volver
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="listener-wrapper">
      <h3 className="listener-title">
        🎧 Escuchando en{" "}
        {language === "es"
          ? "Español"
          : language === "en"
            ? "Inglés"
            : "Rumano"}
      </h3>

      <audio ref={audioRef} controls autoPlay playsInline style={{ display: 'none' }} />

      {/* 
        VIDEO DUMMY HACK:
        Video invisible pero renderizado (opacity 0) para forzar modo background en Android/iOS 
      */}
      <video
        ref={videoHackRef}
        playsInline
        autoPlay
        muted
        loop
        src="data:video/webm;base64,GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKCQAR3ZWJtQoeBAkKFgQIYX4BNQi1jxPpYt4EEd2VibUKHgQOVgouBCCHHgQKMgpOBACTINwEBQ7Z1AQAAAAAAAHunW4IvQeBninhF67jtI97TS124qF3bC0W+u4KihYECQoWBAIW1gQJChYEAm5yBAlWFA4KBAx8A64Y="
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "1px",
          height: "1px",
          opacity: 0.01,
          pointerEvents: "none",
          zIndex: -1
        }}
      />

      {/* Controles de audio customizados para visualizar estado */}
      <div style={{ padding: '10px', background: '#222', borderRadius: '8px', marginBottom: '10px' }}>
        <p style={{ margin: 0, fontSize: '0.9em', color: '#aaa' }}>
          {status === 'connected' ? '🔊 Audio Activo (WebRTC)' : 'Esperando conexión...'}
        </p>
      </div>

      <canvas
        ref={canvasRef}
        width={300}
        height={80}
        style={{
          width: "100%",
          height: "80px",
          background: "#111",
          borderRadius: "12px",
          marginTop: "10px",
        }}
      ></canvas>

      <div className={`listener-status ${status}`}>
        {status === "idle" && <span>🛑 No hay transmisión activa</span>}
        {status === "requesting" && <span>📡 Solicitando conexión...</span>}
        {status === "connecting" && <span>🔄 Conectando al transmisor...</span>}
        {status === "connected" && <span>✅ Transmisión en vivo</span>}
        {status === "error" && <span>⚠️ Error de conexión</span>}
      </div>

      <div className="listener-buttons">
        <button className="btn-back" onClick={() => handleBack()}>
          ← Volver
        </button>
        <button
          className="btn-retry"
          onClick={() => {
            if (pcRef.current) {
              try {
                pcRef.current.close();
              } catch { }
              pcRef.current = null;
            }
            cancelAnimationFrame(animationRef.current);
            candidateQueueRef.current = [];
            requestOffer();
          }}
        >
          Reintentar 🔄
        </button>
      </div>
    </div>
  );
}

export default Listener;
