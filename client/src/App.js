// src/App.js
import React, { useEffect, useRef, useState } from "react";
import Broadcaster from "./Broadcaster";
import Listener from "./Listener";
import "./App.css";

/*
  App.js con:
    - reconexión automática WebSocket (backoff exponencial)
    - keepalive (ping) para mantener la conexión viva
    - limpieza de timers y socket al desmontar
    - explica en comentarios por qué y qué cambia
*/

function App() {
  // ws guarda la instancia actual de WebSocket que pasamos a los componentes.
  const [ws, setWs] = useState(null);

  // role: null | { role: "broadcaster"|"listener", language: "es"|"en"|"ro" }
  const [role, setRole] = useState(null);

  // refs para controlar reconexión/keepalive desde callbacks sin dependencia de render
  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const keepaliveIntervalRef = useRef(null);

  // URL del servidor de señalización (detecta ws/wss según el protocolo actual)
  const signalingUrl = (() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}`;
  })();

  // ------ FUNCIONES DE CONEXIÓN Y RECONEXIÓN ------
  // createWebSocket: crea el WebSocket y monta handlers básicos.
  const createWebSocket = (url) => {
    // Si ya hay un socket abierto o en proceso, lo cerramos antes de crear otro.
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      } catch (e) {}
      wsRef.current = null;
    }

    const socket = new WebSocket(url);
    wsRef.current = socket;
    setWs(socket); // actualiza el estado para que los child components reciban la nueva instancia

    // onopen: reset de contador de reintentos y start keepalive
    socket.onopen = () => {
      console.log("✅ WebSocket conectado");
      reconnectAttemptRef.current = 0; // reset backoff
      // iniciar el keepalive (ping) cada 25s para evitar cierres por inactividad
      startKeepalive();
    };

    // onclose: intentar reconectar con backoff exponencial
    socket.onclose = (ev) => {
      console.warn("⚠️ WebSocket cerrado", ev);
      stopKeepalive();
      // Intentar reconectar con backoff exponencial (con tope)
      scheduleReconnect(url);
      // Notificar estado a la app
      setWs(null);
    };

    socket.onerror = (err) => {
      console.error("❌ Error WebSocket:", err);
      // En caso de error, cerramos el socket para entrar en onclose y reconectar
      try {
        socket.close();
      } catch (e) {}
    };

    return socket;
  };

  // scheduleReconnect: programa un reintento con backoff exponencial (max 30s)
  const scheduleReconnect = (url) => {
    if (reconnectTimeoutRef.current) return; // ya programado
    const attempt = reconnectAttemptRef.current + 1;
    reconnectAttemptRef.current = attempt;
    // backoff exponencial: 1s, 2s, 4s, 8s, ... hasta max 30s
    const delay = Math.min(30000, Math.pow(2, attempt - 1) * 1000);
    console.log(`🔁 Intento de reconexión #${attempt} en ${delay}ms`);
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      createWebSocket(url);
    }, delay);
  };

  // startKeepalive: envia un ping periódico para mantener el socket vivo.
  // Nota: el servidor no necesita responder necesariamente, esto evita timeouts
  const startKeepalive = () => {
    stopKeepalive(); // evitar duplicados
    keepaliveIntervalRef.current = setInterval(() => {
      const s = wsRef.current;
      if (s && s.readyState === WebSocket.OPEN) {
        try {
          // Envía un mensaje simple "ping". Puedes adaptar formato si tu servidor esperara otro.
          s.send(JSON.stringify({ type: "ping", ts: Date.now() }));
        } catch (e) {
          console.warn("⚠️ Error enviando ping:", e);
        }
      }
    }, 25000); // cada 25 segundos
  };

  const stopKeepalive = () => {
    if (keepaliveIntervalRef.current) {
      clearInterval(keepaliveIntervalRef.current);
      keepaliveIntervalRef.current = null;
    }
  };

  // ------ EFECTO PRINCIPAL: crear la conexión al montar el componente ------
  useEffect(() => {
    // crear socket por primera vez
    createWebSocket(signalingUrl);

    // limpiar todo al desmontar
    return () => {
      // cancelar reconexión programada
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      stopKeepalive();

      // cerrar socket si existe
      if (wsRef.current) {
        try {
          wsRef.current.onopen = null;
          wsRef.current.onclose = null;
          wsRef.current.onerror = null;
          wsRef.current.close();
        } catch (e) {}
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // se ejecuta solo una vez al montar

  // ------ AYUDA: función para forzar re-negotiation en los peers si detectan ICE fail ------
  // No es estrictamente parte de App.js, pero útil para pasar a componentes.
  // Los componentes Broadcaster/Listener deberían escuchar el estado 'iceConnectionState'
  // y, cuando detecten "failed" o "disconnected", llamar a pc.restartIce() o re-crear la PC.
  //
  // (Aquí sólo lo dejamos documentado; la lógica de reintento ICE se implementa en esos archivos).
  //
  // Ejemplo en un PeerConnection:
  // peer.oniceconnectionstatechange = () => {
  //   if (['failed','disconnected'].includes(peer.iceConnectionState)) {
  //     try { peer.restartIce(); } catch(e) { /*recrear Peer si necesario*/ }
  //   }
  // }

  // ------ UI: selección de rol / idioma ------
  if (!ws) {
    // Mientras el WebSocket no está listo mostramos mensaje, los componentes
    // (listener/broadcaster) registran handlers 'open' para cuando ws se conecte.
    return (
      <p className="text-center mt-10">
        Conectando al servidor de señalización...
      </p>
    );
  }

  return (
    <div className="App">
      <div className="app-container">
        <h1>🎙️ Traducción en Vivo</h1>

        {!role && (
          <div className="flex flex-col gap-6 w-full">
            {/* Sección transmisores */}
            <div className="flex flex-col items-center gap-3">
              <h2>🎙️ Iniciar como Transmisor</h2>
              <button
                onClick={() => setRole({ role: "broadcaster", language: "es" })}
                className="btn-broadcaster"
              >
                🚀 Emitir en Español
              </button>
              <button
                onClick={() => setRole({ role: "broadcaster", language: "en" })}
                className="btn-broadcaster"
              >
                🚀 Emitir en Inglés
              </button>
              <button
                onClick={() => setRole({ role: "broadcaster", language: "ro" })}
                className="btn-broadcaster"
              >
                🚀 Emitir en Rumano
              </button>
            </div>

            {/* Sección oyentes */}
            <div className="language-buttons">
              <button
                className="btn-language espanol"
                onClick={() => setRole({ role: "listener", language: "es" })}
              >
                🇪🇸
              </button>
              <button
                className="btn-language ingles"
                onClick={() => setRole({ role: "listener", language: "en" })}
              >
                🇬🇧
              </button>
              <button
                className="btn-language rumano"
                onClick={() => setRole({ role: "listener", language: "ro" })}
              >
                🇷🇴
              </button>
            </div>
          </div>
        )}

        {/* Pasamos setRole para que Broadcaster/Listener puedan volver al home */}
        {role?.role === "broadcaster" && (
          <Broadcaster
            signalingServer={ws}
            language={role.language}
            setRole={setRole}
          />
        )}
        {role?.role === "listener" && (
          <Listener
            signalingServer={ws}
            language={role.language}
            setRole={setRole}
          />
        )}
      </div>
    </div>
  );
}

export default App;

// import React, { useEffect, useState } from "react";
// import Broadcaster from "./Broadcaster";
// import Listener from "./Listener";
// import "./App.css";

// function App() {
//   const [ws, setWs] = useState(null);
//   const [role, setRole] = useState(null); // { role: "broadcaster"|"listener", language: "es"|"en"|"ro" }

//   useEffect(() => {
//     const protocol = window.location.protocol === "https:" ? "wss" : "ws";
//     const host = window.location.host;
//     const signalingServer = new WebSocket(`${protocol}://${host}`);
//     // para pruebas locales
//     // const signalingServer = new WebSocket("ws://localhost:8080");

//     signalingServer.onopen = () => {
//       console.log("✅ Conectado al servidor de señalización");
//       setWs(signalingServer);
//     };

//     signalingServer.onerror = (err) =>
//       console.error("❌ Error en WebSocket:", err);
//     signalingServer.onclose = () => {
//       console.log("⚠️ WebSocket cerrado");
//       setWs(null);
//     };

//     return () => {
//       try {
//         signalingServer.close();
//       } catch {}
//     };
//   }, []);

//   if (!ws)
//     return <p className="text-center mt-10">Conectando al servidor...</p>;

//   return (
//     <div className="App">
//       <div className="app-container">
//         <h1>🎙️ Traducción en Vivo</h1>

//         {!role && (
//           <div className="flex flex-col gap-6 w-full">
//             <button
//               onClick={() => setRole({ role: "broadcaster", language: "es" })}
//               className="btn-broadcaster"
//             >
//               🚀 Iniciar Transmisión Español
//             </button>
//             <button
//               onClick={() => setRole({ role: "broadcaster", language: "en" })}
//               className="btn-broadcaster"
//             >
//               🚀 Iniciar Transmisión Inglés
//             </button>
//             <button
//               onClick={() => setRole({ role: "broadcaster", language: "ro" })}
//               className="btn-broadcaster"
//             >
//               🚀 Iniciar Transmisión Rumano
//             </button>

//             <div className="language-buttons">
//               <button
//                 className="btn-language espanol"
//                 onClick={() => setRole({ role: "listener", language: "es" })}
//               >
//                 🇪🇸 Escuchar Español
//               </button>
//               <button
//                 className="btn-language ingles"
//                 onClick={() => setRole({ role: "listener", language: "en" })}
//               >
//                 🇬🇧 Escuchar Inglés
//               </button>
//               <button
//                 className="btn-language rumano"
//                 onClick={() => setRole({ role: "listener", language: "ro" })}
//               >
//                 🇷🇴 Escuchar Rumano
//               </button>
//             </div>
//           </div>
//         )}

//         {role?.role === "broadcaster" && (
//           <Broadcaster
//             signalingServer={ws}
//             language={role.language}
//             setRole={setRole}
//           />
//         )}
//         {role?.role === "listener" && (
//           <Listener
//             signalingServer={ws}
//             language={role.language}
//             setRole={setRole}
//           />
//         )}
//       </div>
//     </div>
//   );
// }

// export default App;
