// src/Listener.js
import React, { useEffect, useRef, useState } from "react";
import "./Listener.css";

// 🔹 Usa los mismos ICE servers que Broadcaster para mejorar compatibilidad en redes móviles
const rtcConfig = {
  iceServers: [
    { urls: process.env.REACT_APP_STUN_URL || "stun:stun.relay.metered.ca:80" },
    {
      urls:
        process.env.REACT_APP_TURN_URL || "turn:standard.relay.metered.ca:80",
      username: process.env.REACT_APP_TURN_USERNAME,
      credential: process.env.REACT_APP_TURN_CREDENTIAL,
    },
    {
      urls:
        process.env.REACT_APP_TURN_URL ||
        "turn:standard.relay.metered.ca:80?transport=tcp",
      username: process.env.REACT_APP_TURN_USERNAME,
      credential: process.env.REACT_APP_TURN_CREDENTIAL,
    },
    {
      urls:
        process.env.REACT_APP_TURN_URL || "turn:standard.relay.metered.ca:443",
      username: process.env.REACT_APP_TURN_USERNAME,
      credential: process.env.REACT_APP_TURN_CREDENTIAL,
    },
    {
      urls:
        process.env.REACT_APP_TURN_URL ||
        "turns:standard.relay.metered.ca:443?transport=tcp",
      username: process.env.REACT_APP_TURN_USERNAME,
      credential: process.env.REACT_APP_TURN_CREDENTIAL,
    },
  ],
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

          // Procesar candidatos en cola
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
    if (signalingServer.readyState === WebSocket.OPEN) requestOffer();
    else signalingServer.addEventListener("open", requestOffer);
    return () => {
      signalingServer.removeEventListener("open", requestOffer);
      cancelAnimationFrame(animationRef.current);
      audioContextRef.current?.close();
      audioContextRef.current = null;
    };
  }, [signalingServer, language]);

  return (
    <div className="listener-wrapper">
      <h3>
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

      <p style={{ marginTop: "8px" }}>Estado: {status}</p>

      <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
        <button onClick={() => setRole(null)}>← Volver</button>
        <button
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

// import React, { useEffect, useRef } from "react";

// function Listener({ signalingServer }) {
//   const peerRef = useRef(null);
//   const audioRef = useRef(null);
//   const canvasRef = useRef(null);

//   useEffect(() => {
//     let peer = null;
//     let animationId;
//     let audioCtx, analyser, source, dataArrayFreq, dataArrayWave;

//     const createPeer = () => {
//       peer = new RTCPeerConnection();
//       peerRef.current = peer;

//       peer.ontrack = (event) => {
//         if (audioRef.current) {
//           audioRef.current.srcObject = event.streams[0];

//           // Configurar visualización
//           audioCtx = new AudioContext();
//           analyser = audioCtx.createAnalyser();
//           analyser.fftSize = 2048;
//           source = audioCtx.createMediaStreamSource(event.streams[0]);
//           source.connect(analyser);

//           dataArrayFreq = new Uint8Array(analyser.frequencyBinCount);
//           dataArrayWave = new Uint8Array(analyser.fftSize);

//           draw();
//         }
//       };

//       peer.onicecandidate = (event) => {
//         if (event.candidate) {
//           signalingServer.send(
//             JSON.stringify({ type: "candidate", candidate: event.candidate })
//           );
//         }
//       };
//     };

//     const draw = () => {
//       if (!canvasRef.current) return;

//       const ctx = canvasRef.current.getContext("2d");
//       const width = canvasRef.current.width;
//       const height = canvasRef.current.height;

//       ctx.clearRect(0, 0, width, height);

//       // Waveform
//       analyser.getByteTimeDomainData(dataArrayWave);
//       ctx.lineWidth = 2;
//       ctx.strokeStyle = "lime";
//       ctx.beginPath();
//       const sliceWidth = width / dataArrayWave.length;
//       let x = 0;
//       for (let i = 0; i < dataArrayWave.length; i++) {
//         const v = dataArrayWave[i] / 128.0; // normalizar a 0-2
//         const y = (v * height) / 2;
//         if (i === 0) ctx.moveTo(x, y);
//         else ctx.lineTo(x, y);
//         x += sliceWidth;
//       }
//       ctx.stroke();

//       // Spectrum (frecuencia)
//       analyser.getByteFrequencyData(dataArrayFreq);
//       const barWidth = width / dataArrayFreq.length;
//       for (let i = 0; i < dataArrayFreq.length; i++) {
//         const barHeight = (dataArrayFreq[i] / 255) * height;
//         ctx.fillStyle = "rgba(0, 255, 255, 0.5)";
//         ctx.fillRect(i * barWidth, height - barHeight, barWidth, barHeight);
//       }

//       animationId = requestAnimationFrame(draw);
//     };

//     createPeer();

//     signalingServer.onmessage = async (event) => {
//       const data = JSON.parse(event.data);

//       if (data.type === "offer") {
//         if (peerRef.current) {
//           try {
//             await peerRef.current.close();
//           } catch (e) {}
//         }
//         createPeer();
//         peer = peerRef.current;

//         await peer.setRemoteDescription(new RTCSessionDescription(data.offer));

//         const answer = await peer.createAnswer();
//         await peer.setLocalDescription(answer);
//         signalingServer.send(JSON.stringify({ type: "answer", answer }));
//       }

//       if (data.type === "candidate" && peerRef.current) {
//         try {
//           await peerRef.current.addIceCandidate(
//             new RTCIceCandidate(data.candidate)
//           );
//         } catch (e) {
//           console.error("Error al añadir candidate", e);
//         }
//       }
//     };

//     // Pedir oferta al conectar
//     const requestOffer = () => {
//       signalingServer.send(JSON.stringify({ type: "request-offer" }));
//       console.log("Solicitando stream al intérprete...");
//     };

//     if (signalingServer.readyState === WebSocket.OPEN) {
//       requestOffer();
//     } else {
//       signalingServer.addEventListener("open", requestOffer, { once: true });
//     }

//     return () => {
//       if (peerRef.current) peerRef.current.close();
//       if (animationId) cancelAnimationFrame(animationId);
//       if (audioCtx) audioCtx.close();
//     };
//   }, [signalingServer]);

//   return (
//     <div>
//       <h2>Oyente</h2>
//       <audio ref={audioRef} autoPlay controls />
//       <canvas
//         ref={canvasRef}
//         width={600}
//         height={200}
//         style={{
//           border: "1px solid black",
//           marginTop: "10px",
//           borderRadius: "15px",
//         }}
//       />
//     </div>
//   );
// }

// export default Listener;
