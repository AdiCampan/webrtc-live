// src/App.js
import React, { useEffect, useRef, useState } from "react";
import Broadcaster from "./Broadcaster";
import Listener from "./Listener";
import "./App.css";
import Countdown from "./Countdown";
import Login from "./Login";

function App() {
  const nextEvent = "2025-10-05T12:00:00";

  // WebSocket
  const [ws, setWs] = useState(null);
  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const keepaliveIntervalRef = useRef(null);

  // Usuario logueado (admin)
  const [user, setUser] = useState(null);

  // Rol activo
  const [role, setRole] = useState(null);

  // URL WebSocket
  const signalingUrl = (() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}`;
  })();

  // ----------------- WEBSOCKET -----------------
  const createWebSocket = (url) => {
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
    setWs(socket);

    socket.onopen = () => {
      console.log("✅ WebSocket conectado");
      reconnectAttemptRef.current = 0;
      startKeepalive();
    };

    socket.onclose = (ev) => {
      console.warn("⚠️ WebSocket cerrado", ev);
      stopKeepalive();
      scheduleReconnect(url);
      setWs(null);
    };

    socket.onerror = (err) => {
      console.error("❌ Error WebSocket:", err);
      try {
        socket.close();
      } catch (e) {}
    };

    return socket;
  };

  const scheduleReconnect = (url) => {
    if (reconnectTimeoutRef.current) return;
    const attempt = reconnectAttemptRef.current + 1;
    reconnectAttemptRef.current = attempt;
    const delay = Math.min(30000, Math.pow(2, attempt - 1) * 1000);
    console.log(`🔁 Intento de reconexión #${attempt} en ${delay}ms`);
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      createWebSocket(url);
    }, delay);
  };

  const startKeepalive = () => {
    stopKeepalive();
    keepaliveIntervalRef.current = setInterval(() => {
      const s = wsRef.current;
      if (s && s.readyState === WebSocket.OPEN) {
        try {
          s.send(JSON.stringify({ type: "ping", ts: Date.now() }));
        } catch (e) {
          console.warn("⚠️ Error enviando ping:", e);
        }
      }
    }, 25000);
  };

  const stopKeepalive = () => {
    if (keepaliveIntervalRef.current) {
      clearInterval(keepaliveIntervalRef.current);
      keepaliveIntervalRef.current = null;
    }
  };

  useEffect(() => {
    createWebSocket(signalingUrl);
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      stopKeepalive();
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
  }, []);

  // ----------------- UI -----------------
  if (!ws) {
    return (
      <p className="text-center mt-10">
        Conectando al servidor de señalización...
      </p>
    );
  }

  return (
    <div className="App">
      <header>
        <h1>TRADUCCIÓN EN VIVO</h1>
      </header>

      {/* 🧱 Grid principal */}
      <div className="grid-layout">
        {/* 🟣 COLUMNA IZQUIERDA */}
        <div className="left-column">
          {!user && <Login onLogin={(data) => setUser(data)} />}

          <div className="text-box">
            <h3>📜 Información general</h3>
            <p>
              Somos la Iglesia EBEN-EZER de Castellón de la Plana. Nuestro
              objetivo es compartir el mensaje de fe y esperanza en diferentes
              idiomas. Aquí encontrarás todos los recursos necesarios para
              conectarte a nuestras transmisiones y participar activamente en la
              comunidad.
            </p>
            <p>
              Transmitimos en directo cada domingo por la mañana y tarde, y
              también podrás acceder a eventos especiales y sesiones de oración.
            </p>
          </div>

          <Countdown targetDate={nextEvent} />
        </div>

        {/* 🔵 COLUMNA CENTRAL */}
        <div className="center-column">
          <div className="info-box">
            <p>
              ℹ️ Bienvenido a la sección de traducción simultánea. Aquí podrás
              escuchar las transmisiones en el idioma que elijas. Nuestras
              emisiones en directo se realizan los domingos de 10:00 a 12:00 y
              de 18:00 a 20:00.
            </p>
          </div>

          <h2>🎧 Escuchar transmisión</h2>
          <div className="language-buttons">
            <button
              className="btn-language espanol"
              onClick={() => setRole({ role: "listener", language: "es" })}
            />
            <button
              className="btn-language ingles"
              onClick={() => setRole({ role: "listener", language: "en" })}
            />
            <button
              className="btn-language rumano"
              onClick={() => setRole({ role: "listener", language: "ro" })}
            />
          </div>

          {user && user.role === "broadcaster" && (
            <div className="broadcaster-section">
              <h2>🎙️ Emitir transmisión</h2>
              <div className="broadcasters-container">
                <button
                  onClick={() =>
                    setRole({ role: "broadcaster", language: "es" })
                  }
                  className="btn-broadcaster"
                >
                  🎙️ Español
                </button>
                <button
                  onClick={() =>
                    setRole({ role: "broadcaster", language: "en" })
                  }
                  className="btn-broadcaster"
                >
                  🎙️ Inglés
                </button>
                <button
                  onClick={() =>
                    setRole({ role: "broadcaster", language: "ro" })
                  }
                  className="btn-broadcaster"
                >
                  🎙️ Rumano
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 🟢 COLUMNA DERECHA */}
        <div className="right-column">
          <div className="contact-box">
            <h3>🏛️ EBEN-EZER Castellón</h3>
            <div className="logo-placeholder">[ LOGO ]</div>
            <p>Calle Mayor 123, Castellón de la Plana</p>
            <p>Tel: +34 600 123 456</p>
            <p>Email: contacto@ebenezer.org</p>
            <p>Horario: Domingos 10:00–12:00 / 18:00–20:00</p>
            <button className="btn-contact">📩 Contactar</button>
          </div>
        </div>
      </div>

      {/* Contenido dinámico */}
      {role?.role === "broadcaster" && user?.token && (
        <Broadcaster
          signalingServer={ws}
          language={role.language}
          setRole={setRole}
          token={user.token}
        />
      )}

      {role?.role === "listener" && (
        <Listener
          signalingServer={ws}
          language={role.language}
          setRole={setRole}
        />
      )}

      <footer className="footer">
        <p>© EBEN-EZER Media 2025</p>
      </footer>
    </div>
  );
}

export default App;

// // src/App.js
// import React, { useEffect, useRef, useState } from "react";
// import Broadcaster from "./Broadcaster";
// import Listener from "./Listener";
// import "./App.css";
// import Countdown from "./Countdown";
// import Login from "./Login";

// /*
//   App.js con:
//     - reconexión automática WebSocket (backoff exponencial)
//     - keepalive (ping) para mantener la conexión viva
//     - limpieza de timers y socket al desmontar
//     - JWT: login separado de selección de idioma
// */

// function App() {
//   const nextEvent = "2025-10-10T12:00:00";

//   // WebSocket
//   const [ws, setWs] = useState(null);
//   const wsRef = useRef(null);
//   const reconnectAttemptRef = useRef(0);
//   const reconnectTimeoutRef = useRef(null);
//   const keepaliveIntervalRef = useRef(null);

//   // Usuario logueado { role: "broadcaster", token: "..." }
//   const [user, setUser] = useState(null);

//   // Selección de rol e idioma { role: "broadcaster"|"listener", language: "es"|"en"|"ro" }
//   const [role, setRole] = useState(null);

//   // URL WebSocket
//   const signalingUrl = (() => {
//     const protocol = window.location.protocol === "https:" ? "wss" : "ws";
//     return `${protocol}://${window.location.host}`;
//   })();

//   // ------ FUNCIONES DE CONEXIÓN Y RECONEXIÓN ------
//   const createWebSocket = (url) => {
//     if (wsRef.current) {
//       try {
//         wsRef.current.onopen = null;
//         wsRef.current.onclose = null;
//         wsRef.current.onerror = null;
//         wsRef.current.close();
//       } catch (e) {}
//       wsRef.current = null;
//     }

//     const socket = new WebSocket(url);
//     wsRef.current = socket;
//     setWs(socket);

//     socket.onopen = () => {
//       console.log("✅ WebSocket conectado");
//       reconnectAttemptRef.current = 0;
//       startKeepalive();
//     };

//     socket.onclose = (ev) => {
//       console.warn("⚠️ WebSocket cerrado", ev);
//       stopKeepalive();
//       scheduleReconnect(url);
//       setWs(null);
//     };

//     socket.onerror = (err) => {
//       console.error("❌ Error WebSocket:", err);
//       try {
//         socket.close();
//       } catch (e) {}
//     };

//     return socket;
//   };

//   const scheduleReconnect = (url) => {
//     if (reconnectTimeoutRef.current) return;
//     const attempt = reconnectAttemptRef.current + 1;
//     reconnectAttemptRef.current = attempt;
//     const delay = Math.min(30000, Math.pow(2, attempt - 1) * 1000);
//     console.log(`🔁 Intento de reconexión #${attempt} en ${delay}ms`);
//     reconnectTimeoutRef.current = setTimeout(() => {
//       reconnectTimeoutRef.current = null;
//       createWebSocket(url);
//     }, delay);
//   };

//   const startKeepalive = () => {
//     stopKeepalive();
//     keepaliveIntervalRef.current = setInterval(() => {
//       const s = wsRef.current;
//       if (s && s.readyState === WebSocket.OPEN) {
//         try {
//           s.send(JSON.stringify({ type: "ping", ts: Date.now() }));
//         } catch (e) {
//           console.warn("⚠️ Error enviando ping:", e);
//         }
//       }
//     }, 25000);
//   };

//   const stopKeepalive = () => {
//     if (keepaliveIntervalRef.current) {
//       clearInterval(keepaliveIntervalRef.current);
//       keepaliveIntervalRef.current = null;
//     }
//   };

//   // ------ EFECTO PRINCIPAL ------
//   useEffect(() => {
//     createWebSocket(signalingUrl);

//     return () => {
//       if (reconnectTimeoutRef.current) {
//         clearTimeout(reconnectTimeoutRef.current);
//         reconnectTimeoutRef.current = null;
//       }
//       stopKeepalive();

//       if (wsRef.current) {
//         try {
//           wsRef.current.onopen = null;
//           wsRef.current.onclose = null;
//           wsRef.current.onerror = null;
//           wsRef.current.close();
//         } catch (e) {}
//         wsRef.current = null;
//       }
//     };
//   }, []);

//   // ------ UI ------
//   if (!ws) {
//     return (
//       <p className="text-center mt-10">
//         Conectando al servidor de señalización...
//       </p>
//     );
//   }

//   return (
//     <div className="App">
//       <div className="app-container">
//         <h1 style={{ margin: "20px" }}>TRADUCCIÓN EN VIVO</h1>

//         {/* LOGIN */}
//         {!user && <Login onLogin={(data) => setUser(data)} />}

//         {/* SELECCIÓN DE ROL E IDIOMA */}
//         {user && !role && (
//           <div className="flex flex-col gap-6 w-full">
//             {/* Sección Broadcaster */}
//             {user.role === "broadcaster" && (
//               <div className="broadcaster-section">
//                 <h2>🎙️ Emitir transmisión</h2>
//                 <div className="broadcasters-container">
//                   <button
//                     onClick={() =>
//                       setRole({ role: "broadcaster", language: "es" })
//                     }
//                     className="btn-broadcaster"
//                   >
//                     🎙️ Español
//                   </button>
//                   <button
//                     onClick={() =>
//                       setRole({ role: "broadcaster", language: "en" })
//                     }
//                     className="btn-broadcaster"
//                   >
//                     🎙️ Inglés
//                   </button>
//                   <button
//                     onClick={() =>
//                       setRole({ role: "broadcaster", language: "ro" })
//                     }
//                     className="btn-broadcaster"
//                   >
//                     🎙️ Rumano
//                   </button>
//                 </div>
//               </div>
//             )}

//             {/* Sección Listener */}
//             <div className="language-buttons">
//               <button
//                 className="btn-language espanol"
//                 onClick={() => setRole({ role: "listener", language: "es" })}
//               />
//               <button
//                 className="btn-language ingles"
//                 onClick={() => setRole({ role: "listener", language: "en" })}
//               />
//               <button
//                 className="btn-language rumano"
//                 onClick={() => setRole({ role: "listener", language: "ro" })}
//               />
//             </div>
//           </div>
//         )}

//         {/* Broadcaster */}
//         {role?.role === "broadcaster" && user?.token && (
//           <Broadcaster
//             signalingServer={ws}
//             language={role.language}
//             setRole={setRole}
//             token={user.token}
//           />
//         )}

//         {/* Listener */}
//         {role?.role === "listener" && (
//           <Listener
//             signalingServer={ws}
//             language={role.language}
//             setRole={setRole}
//           />
//         )}
//       </div>

//       <Countdown targetDate={nextEvent} />

//       {/* Footer */}
//       <footer className="footer">
//         <p>© EBEN-EZER Media 2025</p>
//       </footer>
//     </div>
//   );
// }

// export default App;
