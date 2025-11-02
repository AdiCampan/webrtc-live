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
import { FaWhatsapp } from "react-icons/fa";

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
  const [listenerCounts, setListenerCounts] = useState({
    es: 0,
    en: 0,
    ro: 0,
  });
  // Usuario logueado y rol
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);

  // NUEVO ESTADO: reconexión WebSocket y broadcast
  const [reconnecting, setReconnecting] = useState(false);
  const broadcastingRef = useRef(false); // Para saber si estaba transmitiendo
  const lastBroadcastLangRef = useRef(null); // Guarda último idioma activo

  const [prevCount, setPrevCount] = useState(0);
  const [pop, setPop] = useState(false);

  const currentCount = listenerCounts[activeLanguage] || 0;

  useEffect(() => {
    if (currentCount !== prevCount) {
      setPop(true);
      const timeout = setTimeout(() => setPop(false), 200);
      setPrevCount(currentCount);
      return () => clearTimeout(timeout);
    }
  }, [currentCount, prevCount]);

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

    setReconnecting(true); // Al crear un nuevo socket, estamos reconectando
    const socket = new WebSocket(url);
    wsRef.current = socket;
    setWs(socket);

    socket.onopen = () => {
      setReconnecting(false);
      console.log("✅ WebSocket conectado");
      reconnectAttemptRef.current = 0;
      startKeepalive();

      // Si usuario es broadcaster y estaba transmitiendo, re-registra
      if (
        role?.role === "broadcaster" &&
        user?.token &&
        broadcastingRef.current &&
        lastBroadcastLangRef.current
      ) {
        // Esperamos un poco más y verificamos que el socket siga abierto
        setTimeout(() => {
          try {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(
                JSON.stringify({
                  type: "broadcaster",
                  language: lastBroadcastLangRef.current,
                  token: user.token,
                })
              );
              console.log(
                "🔄 Broadcaster re-registrado automáticamente después de reconexión"
              );
            }
          } catch (e) {
            console.warn(
              "No se pudo re-registrar broadcaster en reconexión",
              e
            );
          }
        }, 1000); // Espera un poco más para asegurar que server esté listo
      }
    };

    socket.onclose = (ev) => {
      setReconnecting(true);
      console.warn("⚠️ WebSocket cerrado", ev);
      stopKeepalive();
      scheduleReconnect(url);
      // NO ponemos ws a null aquí - mantenemos el socket anterior visible
      // para que el broadcaster no se oculte durante reconexión
      // setWs(null); // ❌ Comentado para mantener UI activa
    };

    socket.onerror = (err) => {
      setReconnecting(true);
      console.error("❌ Error WebSocket:", err);
      try {
        socket.close();
      } catch {}
    };
    // 🟢 ESCUCHAR ESTADO DE TRANSMISIONES ACTIVAS
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // 🔹 Actualizar idiomas activos
        if (data.type === "active-broadcasts" && data.active) {
          setActiveLanguages({
            es: !!data.active.es,
            en: !!data.active.en,
            ro: !!data.active.ro,
          });
          console.log("📡 Idiomas activos:", data.active);
        }

        // 🔹 Actualizar número de oyentes
        if (data.type === "listeners-count" && data.listeners) {
          // Reemplazar completamente el estado para reflejar la verdad actual
          setListenerCounts({
            es: data.listeners.es || 0,
            en: data.listeners.en || 0,
            ro: data.listeners.ro || 0,
          });
          console.log("👂 Oyentes activos:", data.listeners);
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
  // Solo mostrar pantalla de carga si NO hay socket Y NO estamos reconectando
  // Si estamos reconectando, mantenemos la UI visible
  if (!ws && !reconnecting)
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
                const count = listenerCounts[code] || 0; // Número de oyentes siempre confiable

                return (
                  <div className="language-option" key={code}>
                    {isActive && (
                      <div className="onair-badge">
                        ONAIR
                        <span className="listener-count">
                          {/* {currentCount > 0 ? `👂 ${currentCount}` : ""} */}
                          {count > 0 ? `👂 ${count}` : ""}
                        </span>
                      </div>
                    )}

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
              onLanguageActive={(lang) => {
                setActiveLanguage(lang);
                lastBroadcastLangRef.current = lang;
              }}
              onBroadcastingState={(isBroadcasting) => {
                broadcastingRef.current = isBroadcasting;
              }}
              reconnecting={reconnecting}
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
            <a
              href="https://wa.me/34637951683?text=Hola!%20Quisiera%20más%20información%20sobre%20la%20transmisión"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-contact"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="white"
                style={{ marginRight: "8px" }}
              >
                <path d="M12.04 2C6.49 2 2 6.47 2 11.99c0 2.11.57 4.05 1.63 5.79L2 22l4.41-1.61c1.67.91 3.56 1.39 5.63 1.39h.01c5.55 0 10.04-4.47 10.04-9.99C22.08 6.47 17.59 2 12.04 2zm5.69 14.31c-.24.68-1.38 1.3-1.89 1.38-.48.07-1.08.1-1.74-.11-.4-.13-.92-.29-1.58-.57-2.78-1.19-4.6-3.97-4.74-4.15-.14-.18-1.13-1.49-1.13-2.84 0-1.35.72-2.02.98-2.3.26-.28.57-.35.76-.35.18 0 .38.01.55.01.18 0 .42-.07.65.5.24.57.82 1.98.89 2.12.07.14.11.3.02.48-.09.18-.13.3-.25.46-.13.16-.27.36-.39.49-.13.14-.27.29-.12.57.14.28.61.99 1.31 1.6.9.8 1.65 1.05 1.94 1.19.3.14.46.12.63-.07.18-.2.72-.83.92-1.12.2-.28.39-.23.65-.14.26.09 1.64.77 1.92.9.28.14.47.2.54.31.06.11.06.64-.18 1.32z" />
              </svg>
              SOLICITA UN TÉCNICO
            </a>
          </div>
        </div>
      </div>

      <footer className="footer">© EBEN-EZER Media 2025</footer>
    </div>
  );
}

export default App;
