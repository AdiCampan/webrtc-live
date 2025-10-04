// Countdown.js
import React, { useState, useEffect, useRef } from "react";
import "./App.css"; // o Countdown.css

const Countdown = ({ targetDate }) => {
  const calculateTimeLeft = () => {
    const difference = +new Date(targetDate) - +new Date();
    if (difference <= 0) return null;

    return {
      días: Math.floor(difference / (1000 * 60 * 60 * 24)),
      horas: Math.floor((difference / (1000 * 60 * 60)) % 24),
      minutos: Math.floor((difference / 1000 / 60) % 60),
      segundos: Math.floor((difference / 1000) % 60),
    };
  };

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
  const [reminderSet, setReminderSet] = useState(false);
  const [visible, setVisible] = useState(true);

  // Para drag & drop
  const widgetRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  const handleReminder = () => {
    if (!("Notification" in window)) {
      alert("Tu navegador no soporta notificaciones.");
      return;
    }

    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        setReminderSet(true);

        const timeToEvent = +new Date(targetDate) - +new Date();
        const remindBefore = 5 * 60 * 1000; // 5 minutos antes

        const notify = () => {
          const notification = new Notification(
            "⏰ ¡Tu transmisión está por comenzar!",
            {
              body: "La emisión inicia pronto 🚀",
              icon: "/favicon.ico",
              requireInteraction: true,
            }
          );

          notification.onclick = (event) => {
            event.preventDefault();
            window.focus();
            window.open("/", "_blank");
          };
        };

        if (timeToEvent > remindBefore) {
          setTimeout(notify, timeToEvent - remindBefore);
        } else {
          notify();
        }
      }
    });
  };

  if (!visible) return null;

  // Drag & Drop handlers
  const handleMouseDown = (e) => {
    setDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;
    setPosition({
      x: e.clientX - dragOffset.current.x,
      y: e.clientY - dragOffset.current.y,
    });
  };

  const handleMouseUp = () => {
    setDragging(false);
  };

  return (
    <div
      ref={widgetRef}
      className="countdown-box"
      style={{
        left: position.x,
        top: position.y,
        position: "fixed",
        cursor: dragging ? "grabbing" : "grab",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Botón de cerrar */}
      <button className="close-btn" onClick={() => setVisible(false)}>
        ✖
      </button>

      <h2>⏰ Próxima emisión</h2>

      {!timeLeft ? (
        <p>¡Ya comenzó!</p>
      ) : (
        <>
          <div className="countdown-timer">
            {Object.entries(timeLeft).map(([label, value]) => (
              <span key={label}>
                {value} <small>{label}</small>
              </span>
            ))}
          </div>

          <button
            className="btn-reminder"
            onClick={handleReminder}
            disabled={reminderSet}
          >
            {reminderSet ? "🔔 Recordatorio activado" : "🔔 Recordar"}
          </button>
        </>
      )}
    </div>
  );
};

export default Countdown;
