import React, { useEffect, useState } from "react";
import Broadcaster from "./Broadcaster";
import Listener from "./Listener";
import "./App.css";
import englishFlag from "./Assets/english-flag.jpeg";
import spanisFlag from "./Assets/spanish-flag2.png";

function App() {
  const [ws, setWs] = useState(null);
  const [role, setRole] = useState(null);

  useEffect(() => {
    // Detecta automáticamente el protocolo y host actuales (para Render o localhost)
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.host;
    //para rular en internet
    const signalingServer = new WebSocket(`${protocol}://${host}`);
    // parapruebas locales
    // const signalingServer = new WebSocket("ws://localhost:8080");

    signalingServer.onopen = () => {
      console.log("✅ Conectado al servidor de señalización");
      setWs(signalingServer);
    };

    signalingServer.onerror = (err) => {
      console.error("❌ Error en WebSocket:", err);
    };

    signalingServer.onclose = () => {
      console.log("⚠️ WebSocket cerrado");
      setWs(null);
    };

    return () => {
      try {
        signalingServer.close();
      } catch (e) {}
    };
  }, []);

  if (!ws)
    return <p className="text-center mt-10">Conectando al servidor...</p>;

  return (
    <div className="App">
      <div className="app-container">
        <h1>🎙️ Traducción en Vivo</h1>

        {!role && (
          <div className="flex flex-col gap-6 w-full">
            <button
              onClick={() => setRole("broadcaster")}
              className="btn-broadcaster"
            >
              🚀 Iniciar Transmisión
            </button>
            <div className="language-buttons">
              <button
                className="btn-language espanol"
                onClick={() => setRole("listener")}
              >
                🎧
              </button>

              <button
                className="btn-language ingles"
                onClick={() => setRole("listener")}
              >
                🎧
              </button>

              <button
                className="btn-language rumano"
                onClick={() => setRole("listener")}
              >
                🎧
              </button>
            </div>
          </div>
        )}

        {role === "broadcaster" && <Broadcaster signalingServer={ws} />}
        {role === "listener" && <Listener signalingServer={ws} />}
      </div>
    </div>
  );
}

export default App;
