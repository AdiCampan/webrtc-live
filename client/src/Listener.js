// src/Listener.js
import React, { useEffect, useRef, useState } from "react";
import "./Listener.css"; // si tienes estilos específicos, si no puedes quitar esta línea

// Usa los mismos ICE servers que Broadcaster para mejorar compatibilidad en redes móviles
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

function Listener({ signalingServer, language, setRole }) {
  const pcRef = useRef(null);
  const audioRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | requesting | connecting | connected | error
  const candidateQueueRef = useRef([]); // candidates recibidos antes de tener RTCPeerConnection

  // Enviar request-offer al servidor (para pedir la offer del broadcaster)
  const requestOffer = () => {
    if (!signalingServer || signalingServer.readyState !== WebSocket.OPEN) {
      console.warn("WebSocket no disponible para solicitar oferta");
      return;
    }
    signalingServer.send(JSON.stringify({ type: "request-offer", language }));
    console.log("📡 Listener solicitó oferta para idioma", language);
    setStatus("requesting");
  };

  // Manejo de mensajes entrantes del servidor
  useEffect(() => {
    if (!signalingServer) return;

    const handleMessage = async (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (parseErr) {
        console.warn("Mensaje no JSON recibido:", event.data);
        return;
      }
      console.log("📩 Listener recibió:", data);

      try {
        if (data.type === "offer" && data.offer) {
          // broadcaster envía offer; data.clientId es el id del broadcaster (target para respuestas)
          setStatus("connecting");

          // Si ya hay un PC anterior, ciérralo primero
          if (pcRef.current) {
            try {
              pcRef.current.close();
            } catch (_) {}
            pcRef.current = null;
          }

          const pc = new RTCPeerConnection(rtcConfig);
          pcRef.current = pc;

          // Cuando lleguen pistas remotas: asignar al audio element
          pc.ontrack = (trackEvent) => {
            try {
              const remoteStream = trackEvent.streams && trackEvent.streams[0];
              if (audioRef.current) {
                audioRef.current.srcObject =
                  remoteStream ||
                  new MediaStream(trackEvent.track ? [trackEvent.track] : []);
                audioRef.current.play().catch(() => {});
                setStatus("connected");
              }
            } catch (err) {
              console.error("Error en ontrack:", err);
            }
          };

          // Enviar candidates locales al broadcaster (target = id del broadcaster)
          pc.onicecandidate = (iceEvent) => {
            if (iceEvent.candidate) {
              if (
                signalingServer &&
                signalingServer.readyState === WebSocket.OPEN
              ) {
                signalingServer.send(
                  JSON.stringify({
                    type: "candidate",
                    candidate: iceEvent.candidate,
                    target: data.clientId, // importante: responder al broadcaster
                  })
                );
              }
            }
          };

          // Aplicar remoteOffer -> crear Answer y enviarla
          try {
            await pc.setRemoteDescription(
              new RTCSessionDescription(data.offer)
            );
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            signalingServer.send(
              JSON.stringify({ type: "answer", answer, target: data.clientId })
            );
            console.log("📤 Answer enviada al Broadcaster:", data.clientId);

            // Si hubo candidates que llegaron antes de crear el pc, añadirlos ahora
            if (candidateQueueRef.current.length > 0) {
              for (const queued of candidateQueueRef.current) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(queued));
                  console.log("✅ Candidate en cola agregado");
                } catch (err) {
                  console.warn("No se pudo agregar candidate en cola:", err);
                }
              }
              candidateQueueRef.current = [];
            }
          } catch (errAnswer) {
            console.error("Error procesando offer/answer:", errAnswer);
            setStatus("error");
          }
        }

        // Cuando recibimos candidate desde el broadcaster
        if (data.type === "candidate" && data.candidate) {
          if (pcRef.current) {
            try {
              await pcRef.current.addIceCandidate(
                new RTCIceCandidate(data.candidate)
              );
              console.log("✅ Candidate agregado");
            } catch (err) {
              console.warn("❌ Error agregando candidate:", err);
            }
          } else {
            // PC no creado todavía: almacenar en cola
            candidateQueueRef.current.push(data.candidate);
            console.log("📥 Candidate en cola (esperando pc)");
          }
        }

        if (data.type === "error") {
          console.warn("Error del servidor:", data.message);
        }
      } catch (err) {
        console.error("Error manejando mensaje WebSocket en Listener:", err);
      }
    };

    signalingServer.addEventListener("message", handleMessage);
    return () => {
      signalingServer.removeEventListener("message", handleMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalingServer]);

  // cuando se monta el componente o cambia el idioma, solicita oferta
  useEffect(() => {
    if (!signalingServer) return;
    // Si socket ya está abierto, solicitar directamente
    if (signalingServer.readyState === WebSocket.OPEN) {
      requestOffer();
    } else {
      // si aún no abierto, espera al evento open
      const onOpen = () => requestOffer();
      signalingServer.addEventListener("open", onOpen);
      return () => signalingServer.removeEventListener("open", onOpen);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalingServer, language]);

  // limpiar al desmontar
  useEffect(() => {
    return () => {
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch (e) {}
        pcRef.current = null;
      }
    };
  }, []);

  return (
    <div className="listener-wrapper">
      <h3>
        🔊 Escuchando:{" "}
        {language === "es"
          ? "Español"
          : language === "en"
          ? "Inglés"
          : "Rumano"}
      </h3>

      <div className="listener-controls">
        <audio ref={audioRef} controls autoPlay />
      </div>

      <div className="listener-status">
        <p>
          Estado: <strong>{status}</strong>
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => {
              setRole(null); /* volver a home para elegir otra cosa */
            }}
          >
            ← Volver
          </button>
          <button
            onClick={() => {
              // permitir reintentar manualmente
              if (pcRef.current) {
                try {
                  pcRef.current.close();
                } catch (_) {}
                pcRef.current = null;
              }
              candidateQueueRef.current = [];
              requestOffer();
            }}
          >
            Reintentar
          </button>
        </div>
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
