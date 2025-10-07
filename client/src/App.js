// src/App.js
import React, { useEffect, useRef, useState } from "react";
import Broadcaster from "./Broadcaster";
import Listener from "./Listener";
import "./App.css";
import Countdown from "./Countdown";
import Login from "./Login";

function App() {
  const nextEvent = "2025-10-15T12:00:00";

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

  // const signalingUrl = "ws://localhost:8080"; // para pruebas locales

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
  if (!ws)
    return (
      <div className="loading-screen">
        <div className="logo-pulse">⛪</div>
        <p>Conectando con EBEN-EZER Media...</p>
      </div>
    );
  // if (!ws)
  //   return (
  //     <div className="loading-screen">
  //       <p>
  //         Conectando
  //         <span className="dots">
  //           <span>.</span>
  //           <span>.</span>
  //           <span>.</span>
  //         </span>
  //       </p>
  //     </div>
  //   );
  console.log("user:", user);
  console.log("role:", role);

  return (
    <div className="App">
      <div className="grid-layout">
        {/* COLUMNA IZQUIERDA */}
        <div className="left-column">
          {!user && (
            <Login
              onLogin={(data) => {
                setUser(data);
                if (data.role === "broadcaster") {
                  setRole({ role: "broadcaster" });
                }
              }}
            />
          )}

          {/* <div className="text-box small">
            Aquí va la información extra de la columna izquierda (15 líneas
            aprox)...
          </div> */}
          <Countdown targetDate={nextEvent} />
        </div>

        <div className="center-column">
          <h1>TRADUCCIÓN EN VIVO</h1>

          {/* Caja de texto central */}
          <div className="info-box">
            Bienvenidos a la transmisión en vivo con traducción simultánea de
            Iglesia Pentecostal Rumana EBEN-EZER Castellon de la Plana <br />
            <br /> El horario de las emisiones será:
            <ul>
              <li>Domingos 10:00 -12:00 y 18:00 - 20:00</li>
              <li>Martes 20:00 - 21:30</li>
              <li>Jueves 20:00 -21:30 </li>
            </ul>
            Si necesitas Auriculare/cascos adaptadores, contacta con el equipo
            de sonido. ¡Gracias por acompañarnos!
          </div>

          {/* Botones de escuchar solo si no se ha seleccionado rol */}
          {!role && (
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
          )}

          {/* Listener */}
          {role?.role === "listener" && (
            <div className="listener-container">
              <Listener
                signalingServer={ws}
                language={role.language}
                setRole={setRole}
              />
            </div>
          )}

          {/* Broadcaster */}
          {role?.role === "broadcaster" && user?.token && (
            <div className="broadcaster-container">
              <Broadcaster
                signalingServer={ws}
                setRole={setRole}
                token={user.token}
              />
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA */}
        <div className="right-column">
          <h2>Información y contacto</h2>
          <div className="logo-placeholder">Logo</div>
          <div className="text-box right">
            Dirección: Calle Ejemplo 123, Ciudad
            <br />
            Teléfono: +34 123 456 789
            <br />
            Email: contacto@ejemplo.com
            <br />
            Horario: Lunes a Viernes 9:00 - 18:00
          </div>
          <div className="contact-box">
            <button className="btn-contact">Contáctanos</button>
          </div>
        </div>
      </div>

      <footer className="footer">© EBEN-EZER Media 2025</footer>
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

//   const signalingUrl = "ws://localhost:8080"; // para pruebas locales

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
