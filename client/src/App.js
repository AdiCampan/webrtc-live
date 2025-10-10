// src/App.js
import React, { useEffect, useRef, useState } from "react";
import Broadcaster from "./Broadcaster";
import Listener from "./Listener";
import "./App.css";
import Countdown from "./Countdown";
import Login from "./Login";
import spanishFlag from "./Assets/spanish-flag4.webp";
import englishFlag from "./Assets/english-flag.webp";
import romanianFlag from "./Assets/romanian-flag2.webp";
import logo from "./Assets/logo2.webp";
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  Globe,
  Youtube,
  MessageCircle,
} from "lucide-react";

function App() {
  // WebSocket
  const [ws, setWs] = useState(null);
  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const keepaliveIntervalRef = useRef(null);

  // Fechas y estado de idiomas
  const [nextEvent, setNextEvent] = useState(null);
  const [activeLanguage, setActiveLanguage] = useState(null);
  const [activeLanguages, setActiveLanguages] = useState({
    es: false,
    en: false,
    ro: false,
  });

  // Usuario logueado y rol
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);

  // URL WebSocket
  const signalingUrl = (() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}`;
  })();

  // ----------------- Obtener fecha del próximo evento -----------------
  useEffect(() => {
    fetch("/next-event")
      .then((res) => res.json())
      .then((data) => setNextEvent(data.date))
      .catch((err) => console.error("Error al obtener la fecha:", err));
  }, []);

  const handleSetNextEvent = async (newDate) => {
    setNextEvent(newDate);
    if (user?.token) {
      await fetch("/next-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: newDate, token: user.token }),
      });
    }
  };

  // ----------------- WEBSOCKET -----------------
  const createWebSocket = (url) => {
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      } catch {}
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
      } catch {}
    };

    // 🟢 ESCUCHAR ESTADO DE TRANSMISIONES ACTIVAS
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "active-broadcasts") {
          // 🔹 Aseguramos que siempre existan las claves
          setActiveLanguages({
            es: !!data.active?.es,
            en: !!data.active?.en,
            ro: !!data.active?.ro,
          });
          console.log("📡 Idiomas activos:", data.active);
        }
      } catch (e) {
        console.error("⚠️ Error procesando mensaje WS:", e);
      }
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
        } catch {}
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

  return (
    <div className="App">
      <div className="grid-layout">
        {/* COLUMNA IZQUIERDA */}
        <div className="left-column">
          <Countdown
            targetDate={nextEvent}
            onSetTargetDate={handleSetNextEvent}
            role={role?.role}
          />

          {!user ? (
            <Login
              onLogin={(data) => {
                setUser(data);
                if (data.role === "broadcaster") {
                  setRole({ role: "broadcaster" });
                }
              }}
            />
          ) : (
            <div className="logout-box">
              <p>
                Conectado como <strong>{user.role}</strong>
              </p>
              <button
                className="btn-logout"
                onClick={() => {
                  setUser(null);
                  setRole(null);
                }}
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>

        {/* COLUMNA CENTRAL */}
        <div className="center-column">
          <h1 className="live-title">TRADUCCIÓN EN VIVO</h1>

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
            Si necesitas auriculares o adaptadores, contacta con el equipo de
            sonido. ¡Gracias por acompañarnos!
          </div>

          {/* Botones de escuchar solo si no se ha seleccionado rol */}
          {!role && (
            <div className="language-buttons">
              {[
                { code: "es", label: "Escucha", img: spanishFlag },
                { code: "en", label: "Listen", img: englishFlag },
                { code: "ro", label: "Ascultă", img: romanianFlag },
              ].map(({ code, label, img }) => {
                const isActive =
                  activeLanguages[code] || activeLanguage === code;
                return (
                  <div className="language-option" key={code}>
                    {isActive && <div className="onair-badge">ONAIR</div>}
                    <button
                      className={`btn-language ${isActive ? "active" : ""}`}
                      onClick={() =>
                        setRole({ role: "listener", language: code })
                      }
                    >
                      <img src={img} alt={label} />
                    </button>
                    <span className="btn-label">{label}</span>
                  </div>
                );
              })}
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
            <Broadcaster
              signalingServer={ws}
              setRole={setRole}
              token={user.token}
              onLanguageActive={setActiveLanguage}
            />
          )}
        </div>

        {/* COLUMNA DERECHA */}
        <div className="right-column">
          <div className="logo-placeholder">
            <img src={logo} alt="logo" />
          </div>

          <div className="text-box right">
            <p>
              <MapPin className="inline-icon" /> <strong>Dirección:</strong>{" "}
              Camí de la Donació, 89, 12004, Castellón de la Plana
            </p>
            <p>
              <Phone className="inline-icon" /> <strong>Teléfono:</strong> +34
              687-210-586
            </p>
            <p>
              <Mail className="inline-icon" /> <strong>Email:</strong>{" "}
              biserica_ebenezer@yahoo.es
            </p>
            <p>
              <Clock className="inline-icon" /> <strong>Horario:</strong>
              <br />
              Domingos 10:00–12:00 y 18:00–20:00
              <br />
              Martes 20:00–21:30
              <br />
              Jueves 20:00–21:30
            </p>
            <p>
              <Youtube className="inline-icon" />{" "}
              <a
                href="https://www.youtube.com/@bisericaebenezercastellon"
                target="_blank"
                rel="noopener noreferrer"
              >
                youtube.com/@bisericaebenezercastellon
              </a>
            </p>
            <p>
              <Globe className="inline-icon" />
              <a
                href="https://www.bisericaebenezer.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                www.bisericaebenezer.com
              </a>
            </p>
            <p>
              <MessageCircle className="inline-icon" />{" "}
              <strong>WhatsApp:</strong> +34 624 227 214
            </p>
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
// import spanishFlag from "./Assets/spanish-flag4.webp";
// import englishFlag from "./Assets/english-flag.webp";
// import romanianFlag from "./Assets/romanian-flag2.webp";
// import logo from "./Assets/logo2.webp";
// import {
//   MapPin,
//   Phone,
//   Mail,
//   Clock,
//   Globe,
//   Youtube,
//   MessageCircle,
// } from "lucide-react";

// function App() {
//   // WebSocket
//   const [ws, setWs] = useState(null);
//   const wsRef = useRef(null);
//   const reconnectAttemptRef = useRef(0);
//   const reconnectTimeoutRef = useRef(null);
//   const keepaliveIntervalRef = useRef(null);
//   const [nextEvent, setNextEvent] = useState(null);
//   const [activeLanguage, setActiveLanguage] = useState(null);

//   // Obtén la URL del backend desde la variable de entorno
//   const apiUrl = process.env.REACT_APP_API_URL;

//   useEffect(() => {
//     fetch("/next-event") // ✅ aquí usamos la URL completa
//       .then((res) => res.json())
//       .then((data) => setNextEvent(data.date))
//       .catch((err) => console.error("Error al obtener la fecha:", err));
//   }, []);

//   const handleSetNextEvent = async (newDate) => {
//     setNextEvent(newDate);
//     if (user?.token) {
//       await fetch("/next-event", {
//         // ✅ aquí también
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ date: newDate, token: user.token }),
//       });
//     }
//   };

//   // Usuario logueado (admin)
//   const [user, setUser] = useState(null);

//   // Rol activo
//   const [role, setRole] = useState(null);

//   // URL WebSocket
//   const signalingUrl = (() => {
//     const protocol = window.location.protocol === "https:" ? "wss" : "ws";
//     return `${protocol}://${window.location.host}`;
//   })();

//   // const signalingUrl = process.env.REACT_APP_API_URL.replace(/^http/, "ws"); // para pruebas locales

//   // ----------------- WEBSOCKET -----------------
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

//   // ----------------- UI -----------------
//   if (!ws)
//     return (
//       <div className="loading-screen">
//         <div className="logo-pulse">⛪</div>
//         <p>Conectando con EBEN-EZER Media...</p>
//       </div>
//     );

//   console.log("user:", user);
//   console.log("role:", role);

//   return (
//     <div className="App">
//       <div className="grid-layout">
//         {/* COLUMNA IZQUIERDA */}
//         <div className="left-column">
//           <Countdown
//             targetDate={nextEvent}
//             onSetTargetDate={handleSetNextEvent}
//             role={role?.role}
//           />
//           {!user ? (
//             <Login
//               onLogin={(data) => {
//                 setUser(data);
//                 if (data.role === "broadcaster") {
//                   setRole({ role: "broadcaster" });
//                 }
//               }}
//             />
//           ) : (
//             <div className="logout-box">
//               <p>
//                 Conectado como <strong>{user.role}</strong>
//               </p>
//               <button
//                 className="btn-logout"
//                 onClick={() => {
//                   setUser(null);
//                   setRole(null);
//                 }}
//               >
//                 Cerrar sesión
//               </button>
//             </div>
//           )}
//         </div>

//         <div className="center-column">
//           <h1 className="live-title">TRADUCCIÓN EN VIVO</h1>

//           {/* Caja de texto central */}
//           <div className="info-box">
//             Bienvenidos a la transmisión en vivo con traducción simultánea de
//             Iglesia Pentecostal Rumana EBEN-EZER Castellon de la Plana <br />
//             <br /> El horario de las emisiones será:
//             <ul>
//               <li>Domingos 10:00 -12:00 y 18:00 - 20:00</li>
//               <li>Martes 20:00 - 21:30</li>
//               <li>Jueves 20:00 -21:30 </li>
//             </ul>
//             Si necesitas Auriculare/cascos o adaptadores, contacta con el equipo
//             de sonido. ¡Gracias por acompañarnos!
//           </div>

//           {/* Botones de escuchar solo si no se ha seleccionado rol */}
//           {!role && (
//             <div className="language-buttons">
//               {[
//                 { code: "es", label: "Escucha", img: spanishFlag },
//                 { code: "en", label: "Listen", img: englishFlag },
//                 { code: "ro", label: "Ascultă", img: romanianFlag },
//               ].map(({ code, label, img }) => {
//                 const isActive = activeLanguage === code;
//                 return (
//                   <div className="language-option" key={code}>
//                     {isActive && <div className="onair-badge">ONAIR</div>}
//                     <button
//                       className={`btn-language ${isActive ? "active" : ""}`}
//                       onClick={() =>
//                         setRole({ role: "listener", language: code })
//                       }
//                     >
//                       <img src={img} alt={label} />
//                     </button>
//                     <span className="btn-label">{label}</span>
//                   </div>
//                 );
//               })}
//             </div>
//           )}

//           {/* Listener */}
//           {role?.role === "listener" && (
//             <div className="listener-container">
//               <Listener
//                 signalingServer={ws}
//                 language={role.language}
//                 setRole={setRole}
//               />
//             </div>
//           )}

//           {/* Broadcaster */}
//           {role?.role === "broadcaster" && user?.token && (
//             <div>
//               <Broadcaster
//                 signalingServer={ws}
//                 setRole={setRole}
//                 token={user.token}
//                 onLanguageActive={setActiveLanguage}
//               />
//             </div>
//           )}
//         </div>

//         {/* COLUMNA DERECHA */}
//         <div className="right-column">
//           {/* <h2>Información y contacto</h2> */}
//           <div className="logo-placeholder">
//             <img src={logo} alt="logo" />
//           </div>
//           <div className="text-box right">
//             <p>
//               <MapPin className="inline-icon" /> <strong>Dirección:</strong>{" "}
//               Camí de la Donació, 89, 12004, Castellón de la Plana
//             </p>

//             <p>
//               <Phone className="inline-icon" /> <strong>Teléfono:</strong> +34
//               687-210-586
//             </p>

//             <p>
//               <Mail className="inline-icon" /> <strong>Email:</strong>{" "}
//               biserica_ebenezer@yahoo.es
//             </p>

//             <p>
//               <Clock className="inline-icon" /> <strong>Horario:</strong>
//               <br />
//               Domingos 10:00–12:00 y 18:00–20:00
//               <br />
//               Martes 20:00–21:30
//               <br />
//               Jueves 20:00–21:30
//             </p>

//             <p>
//               <Youtube className="inline-icon" />{" "}
//               <a
//                 href="https://www.youtube.com/@bisericaebenezercastellon"
//                 target="_blank"
//                 rel="noopener noreferrer"
//               >
//                 youtube.com/@bisericaebenezercastellon
//               </a>
//             </p>

//             <p>
//               <Globe className="inline-icon" />
//               <a
//                 href="https://www.bisericaebenezer.com"
//                 target="_blank"
//                 rel="noopener noreferrer"
//               >
//                 www.bisericaebenezer.com
//               </a>
//             </p>

//             <p>
//               <MessageCircle className="inline-icon" />{" "}
//               <strong>WhatsApp:</strong> +34 624 227 214
//             </p>
//           </div>
//           <div></div>
//           <div className="contact-box">
//             <button className="btn-contact">Contáctanos</button>
//           </div>
//         </div>
//       </div>

//       <footer className="footer">© EBEN-EZER Media 2025</footer>
//     </div>
//   );
// }

// export default App;
