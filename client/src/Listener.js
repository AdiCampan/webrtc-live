import React, { useEffect, useRef, useState } from "react";
import "./Listener.css";

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
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const candidateQueueRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animationRef = useRef(null);

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
    if (!signalingServer) return;

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
          } catch {}
          pcRef.current = null;
        }

        const pc = new RTCPeerConnection(rtcConfig);
        pcRef.current = pc;

        pc.ontrack = (ev) => {
          const stream = ev.streams[0];
          if (audioRef.current) {
            audioRef.current.srcObject = stream;
            audioRef.current.play().catch(() => {});
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
  }, [signalingServer]);

  useEffect(() => {
    if (!signalingServer) return;
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
  }, [signalingServer, language]);

  const handleBack = () => {
    // avisar al servidor que este listener deja de escuchar
    if (signalingServer.readyState === WebSocket.OPEN) {
      signalingServer.send(
        JSON.stringify({
          type: "stop-listening",
          language: language,
          clientId: clientId, // si tienes un id local, si no se puede usar ws.id en el servidor
        })
      );
    }

    // lógica local para volver atrás
    setRole(null);
  };

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

      <audio ref={audioRef} controls autoPlay />

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
              } catch {}
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
