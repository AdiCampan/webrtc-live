import React, { useEffect, useState } from "react";
import Broadcaster from "./Broadcaster";
import Listener from "./Listener";
import "./App.css";

function App() {
  const [ws, setWs] = useState(null);
  const [role, setRole] = useState(null);

  useEffect(() => {
    // Detecta el protocolo y host actuales (para producción Render)
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.host;
    const signalingServer = new WebSocket(`${protocol}://${host}`);

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
            <button
              onClick={() => setRole("listener")}
              className="btn-listener"
            >
              🎧 Escuchar
            </button>
          </div>
        )}

        {role === "broadcaster" && <Broadcaster signalingServer={ws} />}
        {role === "listener" && <Listener signalingServer={ws} />}
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
//   const [role, setRole] = useState(null);

//   useEffect(() => {
//     const protocol = window.location.protocol === "https:" ? "wss" : "ws";
//     const host = window.location.hostname;
//     console.log("Conectando a WebSocket:", `${protocol}://${host}:8080`);

//     const signalingServer = new WebSocket(`${protocol}://${host}:8080`);

//     signalingServer.onopen = () => {
//       console.log("✅ Conectado al servidor de señalización");
//       setWs(signalingServer);
//     };

//     signalingServer.onerror = (err) => {
//       console.error("❌ Error en WebSocket:", err);
//     };

//     signalingServer.onclose = () => {
//       console.log("⚠️ WebSocket cerrado");
//       setWs(null);
//     };

//     return () => {
//       try {
//         signalingServer.close();
//       } catch (e) {}
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
//               onClick={() => setRole("broadcaster")}
//               className="btn-broadcaster"
//             >
//               🚀 Iniciar Transmisión
//             </button>
//             <button
//               onClick={() => setRole("listener")}
//               className="btn-listener"
//             >
//               🎧 ESPAÑOL
//             </button>
//           </div>
//         )}

//         {role === "broadcaster" && <Broadcaster signalingServer={ws} />}
//         {role === "listener" && <Listener signalingServer={ws} />}
//       </div>
//     </div>
//   );
// }

// export default App;
