import React, { useEffect, useRef } from "react";

function Listener({ signalingServer }) {
  const peerRef = useRef(null);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    let peer = null;
    let animationId;
    let audioCtx, analyser, source, dataArrayFreq, dataArrayWave;

    const createPeer = () => {
      peer = new RTCPeerConnection();
      peerRef.current = peer;

      peer.ontrack = (event) => {
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0];

          // Configurar visualización
          audioCtx = new AudioContext();
          analyser = audioCtx.createAnalyser();
          source = audioCtx.createMediaStreamSource(event.streams[0]);
          source.connect(analyser);

          dataArrayFreq = new Uint8Array(analyser.frequencyBinCount);
          dataArrayWave = new Uint8Array(analyser.fftSize);

          draw();
        }
      };

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          signalingServer.send(
            JSON.stringify({ type: "candidate", candidate: event.candidate })
          );
        }
      };
    };

    const draw = () => {
      if (!canvasRef.current) return;

      const ctx = canvasRef.current.getContext("2d");
      const width = canvasRef.current.width;
      const height = canvasRef.current.height;

      ctx.clearRect(0, 0, width, height);

      // Waveform
      analyser.getByteTimeDomainData(dataArrayWave);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "lime";
      ctx.beginPath();
      const sliceWidth = width / dataArrayWave.length;
      let x = 0;
      for (let i = 0; i < dataArrayWave.length; i++) {
        const v = dataArrayWave[i] / 128.0;
        const y = (v * height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();

      // Spectrum
      analyser.getByteFrequencyData(dataArrayFreq);
      const barWidth = width / dataArrayFreq.length;
      for (let i = 0; i < dataArrayFreq.length; i++) {
        const barHeight = (dataArrayFreq[i] / 255) * height;
        ctx.fillStyle = "rgba(0, 255, 255, 0.5)";
        ctx.fillRect(i * barWidth, height - barHeight, barWidth, barHeight);
      }

      animationId = requestAnimationFrame(draw);
    };

    createPeer();

    signalingServer.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "offer") {
        if (peerRef.current) {
          try {
            await peerRef.current.close();
          } catch (e) {}
        }
        createPeer();
        peer = peerRef.current;

        await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        signalingServer.send(JSON.stringify({ type: "answer", answer }));
      }

      if (data.type === "candidate" && peerRef.current) {
        try {
          await peerRef.current.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
        } catch (e) {
          console.error("Error al añadir candidate", e);
        }
      }
    };

    // Solicitar oferta al conectar
    const requestOffer = () => {
      signalingServer.send(JSON.stringify({ type: "request-offer" }));
      console.log("Solicitando stream al intérprete...");
    };

    if (signalingServer.readyState === WebSocket.OPEN) {
      requestOffer();
    } else {
      signalingServer.addEventListener("open", requestOffer, { once: true });
    }

    return () => {
      if (peerRef.current) peerRef.current.close();
      if (animationId) cancelAnimationFrame(animationId);
      if (audioCtx) audioCtx.close();
    };
  }, [signalingServer]);

  return (
    <div>
      <h2>Oyente</h2>
      <audio ref={audioRef} autoPlay controls />
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        style={{
          border: "1px solid black",
          marginTop: "10px",
          borderRadius: "15px",
        }}
      />
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
