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

function Listener({ signalingServer, language, setRole, onBackgroundTick }) {
  const pcRef = useRef(null);
  const audioRef = useRef(null);
  const silenceAudioRef = useRef(null); // Ref para el audio de silencio
  const videoHackRef = useRef(null); // Referencia para el video dummy
  const canvasHackRef = useRef(null); // Canvas para el truco del píxel móvil
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [isStarted, setIsStarted] = useState(false);
  const [debugInfo, setDebugInfo] = useState(""); // Info para debuggear en movil
  const [isActivating, setIsActivating] = useState(false); // Estado de cargando al iniciar
  const candidateQueueRef = useRef([]);
  const audioContextRef = useRef(null);
  const audioWorkletNodeRef = useRef(null); // Ref para el nodo de AudioWorklet
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const wakeLockRef = useRef(null); // Referencia para el Wake Lock
  const animationRef = useRef(null);
  const [clientId] = useState(uuidv4());

  const requestOffer = () => {
    if (!signalingServer || signalingServer.readyState !== WebSocket.OPEN) {
      console.warn("WebSocket no disponible para solicitar oferta");
      return;
    }
    signalingServer.send(JSON.stringify({ 
      type: "request-offer", 
      language, 
      clientId 
    }));
    console.log("📡 Listener solicitó oferta para idioma", language, "con ID", clientId);
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

  const setupAudioClock = async (ctx) => {
    try {
      if (audioWorkletNodeRef.current) return;
      
      console.log("⏱️ Iniciando reloj de audio via AudioWorklet...");
      
      // Cargar el módulo del worklet (archivo estático en /public)
      await ctx.audioWorklet.addModule('/audio-clock-processor.js');
      
      const workletNode = new AudioWorkletNode(ctx, 'audio-clock-processor');
      
      // Escuchar ticks desde el worklet
      workletNode.port.onmessage = (event) => {
        if (event.data.type === 'tick') {
          if (onBackgroundTick) onBackgroundTick();
          
          // 🔄 METADATOS VIVOS: Información cambiante para mantener prioridad
          if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new window.MediaMetadata({
              title: `Live ${language.toUpperCase()} • Señal Activa`,
              artist: "Iglesia Eben-Ezer",
              album: `Actualizado: ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'})}`,
              artwork: [
                { src: "/logo192.png", sizes: "192x192", type: "image/png" },
              ],
            });
          }
        }
      };

      // Conectar a la salida para mantener el flujo activo (silencioso)
      workletNode.connect(ctx.destination);
      audioWorkletNodeRef.current = workletNode;
      setDebugInfo(prev => prev + " | Worklet OK");
      
      // 🛡️ AUTO-RESUME: Si el sistema suspende el contexto, intentamos despertarlo
      ctx.onstatechange = () => {
        console.log("🔊 AudioContext state change:", ctx.state);
        if (ctx.state === 'suspended') {
          ctx.resume().then(() => console.log("✅ AudioContext reanudado tras suspensión externa"));
        }
      };
      
    } catch (err) {
      console.warn("⚠️ No se pudo iniciar AudioWorklet:", err);
      setDebugInfo(prev => prev + " | Worklet Err");
    }
  };
  
  // 🎨 TRUCO DEL PÍXEL MÓVIL (Active Pixel Trick)
  // Genera un stream de video de 1x1 que cambia constantemente
  // Esto engaña al SO para que crea que hay decodificación de video activa
  const setupCanvasHack = () => {
    if (!canvasHackRef.current || !videoHackRef.current) return;
    
    console.log("🎨 Iniciando truco del píxel móvil...");
    const canvas = canvasHackRef.current;
    const ctx = canvas.getContext('2d');
    
    // Función que cambia el color de un píxel
    const animatePixel = () => {
      if (!isStarted) return;
      ctx.fillStyle = `rgb(${Math.random()*255},${Math.random()*255},${Math.random()*255})`;
      ctx.fillRect(0, 0, 1, 1);
      setTimeout(animatePixel, 100); // 10 fps es suficiente
    };
    
    animatePixel();
    
    // Capturar el stream del canvas y ponerlo en el video hack
    try {
      const stream = canvas.captureStream(10); // 10 fps
      videoHackRef.current.srcObject = stream;
      videoHackRef.current.play().catch(e => console.warn("Video hack stream failed:", e));
    } catch (e) {
      console.warn("CaptureStream not supported or failed:", e);
    }
  };

  const setupAudioVisualizer = (stream) => {
    if (!stream) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          window.webkitAudioContext)({ latencyHint: 'playback' });
      }
      const audioCtx = audioContextRef.current;
      
      // Iniciar el reloj de audio si no está ya
      setupAudioClock(audioCtx);

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
            audioRef.current.muted = false; // 🔊 Explícitamente NO muted
            audioRef.current.volume = 1.0;
            audioRef.current.play().catch(() => { });
          }
          setupAudioVisualizer(stream);
          setStatus("connected");

          // 🔑 CLAVE: Registrar MediaSession AQUÍ, cuando el stream real llega.
          // Chrome Android sólo crea la notificación de pantalla de bloqueo cuando
          // detecta que un <video>/<audio> REAL está reproduciendo. Si lo registramos
          // antes, Chrome lo ignora porque no hay stream todavía.
          if ('mediaSession' in navigator) {
            try {
              navigator.mediaSession.metadata = new MediaMetadata({
                title: 'Traducción en Vivo',
                artist: 'Iglesia Eben-Ezer',
                album: language === 'es' ? '🇪🇸 Español' : language === 'en' ? '🇬🇧 English' : '🇷🇴 Română',
                artwork: [
                  { src: '/logo192.png', sizes: '192x192', type: 'image/png' },
                  { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
                ]
              });
              navigator.mediaSession.playbackState = 'playing';
              // Handlers obligatorios para que aparezca la notificación con botones
              navigator.mediaSession.setActionHandler('play', () => {
                audioRef.current?.play().catch(() => {});
                silenceAudioRef.current?.play().catch(() => {});
                navigator.mediaSession.playbackState = 'playing';
              });
              navigator.mediaSession.setActionHandler('pause', () => {
                // Ignorar pausa — nunca queremos que se pause
                navigator.mediaSession.playbackState = 'playing';
              });
              navigator.mediaSession.setActionHandler('stop', null);
              navigator.mediaSession.setActionHandler('seekbackward', null);
              navigator.mediaSession.setActionHandler('seekforward', null);
              setDebugInfo(prev => prev + ' | MS-LIVE');
            } catch(e) {
              console.warn('MediaSession ontrack error:', e);
            }
          }
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
    
    const maybeRequest = () => {
      // 1. Identificarse ante el servidor con ID persistente
      if (signalingServer.readyState === WebSocket.OPEN) {
        signalingServer.send(JSON.stringify({ type: "identify", clientId }));
        console.log("🆔 Enviada identificación persistente:", clientId);
      }

      // 2. Pedir oferta (El Broadcaster decidirá si ignorarla si ya estamos conectados)
      // Esto es necesario porque si el servidor reinicia, el Broadcaster pierde
      // nuestra sesión aunque nosotros creamos que seguimos "connected" localmente.
      if (signalingServer.readyState === WebSocket.OPEN) {
        signalingServer.send(JSON.stringify({ 
          type: "request-offer", 
          language, 
          clientId 
        }));
      }
    };

    if (signalingServer.readyState === WebSocket.OPEN) {
      maybeRequest();
    } else {
      signalingServer.addEventListener("open", maybeRequest, { once: true });
    }
    
    // 🔹 RESCUE LOOP: Intervalo de seguridad para segundo plano
    const rescueInterval = setInterval(() => {
      if (isStarted) {
        // Asegurar que el audio de silencio siga sonando
        if (silenceAudioRef.current && silenceAudioRef.current.paused) {
          console.log("⚠️ Silence audio detectado en pausa, reanudando...");
          silenceAudioRef.current.play().catch(() => {});
        }
        // Asegurar que el video hack siga sonando (truco Round 4: mantener video despierto)
        if (videoHackRef.current && videoHackRef.current.paused) {
          videoHackRef.current.play().catch(() => {});
        }
        // 💓 HEARTBEAT AGRESIVO (Round 4): Cada segundo refrescamos MediaSession
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      }
    }, 1000); // Antes 10000ms, ahora 1000ms para máxima persistencia

    return () => {
      clearInterval(rescueInterval);
      if (audioWorkletNodeRef.current) {
        try { audioWorkletNodeRef.current.disconnect(); } catch{}
        audioWorkletNodeRef.current = null;
      }
      signalingServer.removeEventListener("open", maybeRequest);
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
    if (isActivating) return;
    setIsActivating(true);
    setDebugInfo("Iniciando...");

    try {
      // 0. Asegurar AudioContext para el reloj
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      setupAudioClock(audioContextRef.current);

      // 1. Media Session (Prioridad absoluta para que aparezca la notificación)
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: 'Traducción en Vivo (EBEN-EZER)',
            artist: 'Transmisión Activa',
            album: language === 'es' ? 'Español' : language === 'en' ? 'Inglés' : 'Rumano',
            artwork: [
              { src: '/logo192.png', sizes: '192x192', type: 'image/png' },
              { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
            ]
          });

          navigator.mediaSession.playbackState = 'playing';

          navigator.mediaSession.setActionHandler('play', () => {
            if (silenceAudioRef.current) silenceAudioRef.current.play().catch(() => { });
            if (audioRef.current) audioRef.current.play().catch(() => { });
          });

          navigator.mediaSession.setActionHandler('pause', () => {
            // Ignoramos pausa
            navigator.mediaSession.playbackState = 'playing';
          });
          setDebugInfo(prev => prev + " | Media OK");
        } catch (msErr) {
          console.error("MediaSession Err:", msErr);
          setDebugInfo(prev => prev + " | MS Err");
        }
      }

      // 2. Wake Lock API (Fire and Forget)
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen')
          .then(lock => {
            wakeLockRef.current = lock;
            setDebugInfo(prev => prev + " | Lock OK");
          })
          .catch(e => console.warn("WakeLock Err:", e));
      }

      // 3. Reproducir hacks (Fire and Forget - NO AWAIT)
      // Lanzamos la reproducción pero no esperamos el resultado para no bloquear al usuario
      if (silenceAudioRef.current) {
        // 🔊 TRUCO MAESTRO (Round 4): El audio NO debe estar silenciado (muted=false)
        // y lo ponemos a VOLUMEN MÁXIMO (1.0). Como el archivo silence.mp3 es 
        // silencio digital puro, no se oirá nada, pero el SO Android creerá
        // que es una sesión multimedia de alta prioridad.
        silenceAudioRef.current.muted = false;
        silenceAudioRef.current.volume = 1.0; 
        
        silenceAudioRef.current.play()
          .then(() => setDebugInfo(prev => prev + " | Audio OK"))
          .catch(e => {
            console.warn("Audio hack promise rejected", e);
            setDebugInfo(prev => prev + " | Audio Blocked");
          });
      }

      if (videoHackRef.current) {
        // Primero intentamos con el archivo screenshare.webm
        videoHackRef.current.play()
          .then(() => {
            setDebugInfo(prev => prev + " | Video OK");
            // Si funciona el video estático, reforzamos con el canvas hack
            setupCanvasHack();
          })
          .catch(e => {
            console.warn("Video hack file rejected, trying canvas only", e);
            setupCanvasHack();
          });
      }

      // 4. Activar interfaz inmediatamente
      setIsStarted(true);
    } catch (err) {
      console.error("Global handleStart error:", err);
      setDebugInfo(prev => prev + " | Global Err: " + err.message.substring(0, 20));
      // Intentamos arrancar de todos modos para que al menos intente el WebRTC
      setIsStarted(true);
    } finally {
      setIsActivating(false);
    }
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

      {/* 
        HACKS DE AUDIO Y VIDEO: 
        Cambiamos 'display: none' por visibilidad mínima para que el navegador 
        no considere estos elementos como 'inactivos' en segundo plano.
      */}
      <audio
        ref={silenceAudioRef}
        loop
        preload="auto"
        onEnded={() => {
          // Si por alguna razón el loop falla, forzamos reinicio
          silenceAudioRef.current?.play().catch(() => {});
        }}
        style={{ 
          position: 'fixed', 
          bottom: 0, 
          opacity: 0.01, 
          pointerEvents: 'none', 
          width: '1px', 
          height: '1px' 
        }}
      >
        <source src="/silence.mp3" type="audio/mpeg" />
      </audio>

      <video
        ref={videoHackRef}
        playsInline
        muted
        loop
        preload="auto"
        style={{
          position: "fixed",
          bottom: "10px",
          left: "10px",
          width: "10px",
          height: "10px",
          opacity: 0.05, // Un poco más visible para que Safari no lo descarte
          pointerEvents: "none",
          zIndex: 9999,
          background: "black"
        }}
        onPlaying={() => setDebugInfo(prev => prev.includes("Video PLAY") ? prev : prev + " | Video PLAY")}
      >
        <source src="/screenshare.webm" type="video/webm" />
      </video>

      {/* Canvas oculto para el truco del píxel */}
      <canvas 
        ref={canvasHackRef} 
        width="1" 
        height="1" 
        style={{ position: 'fixed', left: '-100px', pointerEvents: 'none' }}
      />

      {/* 📹 TRUCO CRÍTICO (Round 4): <video> para el stream de audio WebRTC.
          Debe ser ligeramente visible (no display:none, no opacity:0) para que
          Chrome Android lo adopte como sesión multimedia y muestre la notificación
          de pantalla de bloqueo — sin esto, Android mata el audio en segundo plano. */}
      <video
        ref={audioRef}
        autoPlay
        playsInline
        style={{ 
          position: 'fixed', 
          bottom: '2px', 
          right: '2px',
          opacity: 0.05,
          pointerEvents: 'none', 
          width: '2px', 
          height: '2px',
          zIndex: 9998
        }}
      />

      {!isStarted ? (
        <div className="start-container" style={{ textAlign: "center", padding: "40px" }}>
          <button
            className="btn-start-audio"
            onClick={handleStart}
            disabled={isActivating}
            style={{
              padding: "20px 40px",
              fontSize: "24px",
              background: isActivating ? "#95a5a6" : "#2ecc71",
              color: "white",
              border: "none",
              borderRadius: "50px",
              cursor: isActivating ? "default" : "pointer",
              boxShadow: "0 4px 15px rgba(46, 204, 113, 0.4)",
              transition: "all 0.2s",
              opacity: isActivating ? 0.7 : 1
            }}
          >
            {isActivating ? "⌛ Activando..." : "🔊 Tocar para Activar Audio"}
          </button>
          <p style={{ marginTop: "20px", color: "#666" }}>
            Necesario para escuchar en segundo plano
          </p>
          {debugInfo && <div style={{ fontSize: '10px', color: '#888', marginTop: '10px' }}>{debugInfo}</div>}
          <button className="btn-back" onClick={() => handleBack()} style={{ marginTop: "20px" }}>
            ← Volver
          </button>
        </div>
      ) : (
        <>
          {/* Info de Debug para el usuario */}
          {debugInfo && (
            <div style={{ fontSize: '10px', color: '#555', marginBottom: '5px' }}>
              {debugInfo}
            </div>
          )}

          {/* Controles de audio customizados para visualizar estado */}
          <div style={{ padding: '10px', background: '#222', borderRadius: '8px', marginBottom: '10px' }}>
            <p style={{ margin: 0, fontSize: '0.9em', color: '#aaa' }}>
              {status === 'connected' ? '🔊 Audio en Vivo Activo' : '📡 Sincronizando...'}
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
        </>
      )}
    </div>
  );
}

export default Listener;
