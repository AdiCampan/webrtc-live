// Countdown.js
import React, { useState, useEffect } from "react";
import "./App.css"; // o un CSS específico si prefieres

const Countdown = ({ targetDate, onSetTargetDate, role }) => {
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
  const [visible, setVisible] = useState(true); // controla si se muestra

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
              requireInteraction: true, // no desaparece sola
            }
          );

          notification.onclick = (event) => {
            event.preventDefault();
            window.focus();
            window.open("/", "_blank"); // abre tu app
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

  if (!visible) return null; // no renderiza si está cerrado

  if (!timeLeft) {
    return (
      <div className="countdown-box">
        {/* <button className="close-btn" onClick={() => setVisible(false)}>
          ✖
        </button> */}
        <p>¡Ya comenzó!</p>
        <h2>⏰ Próxima emisión</h2>
      </div>
    );
  }

  return (
    <div className="countdown-box">
      {/* Botón de cerrar */}
      {/* <button className="close-btn" onClick={() => setVisible(false)}>
        ✖
      </button> */}

      <h2>⏰ Próxima emisión</h2>
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
      {role === "broadcaster" && (
        <div className="set-next-event">
          <h3>📅 Programar próxima emisión</h3>
          <input
            type="datetime-local"
            value={new Date(targetDate).toISOString().slice(0, 16)}
            onChange={(e) => onSetTargetDate(e.target.value)}
          />
        </div>
      )}
    </div>
  );
};

export default Countdown;
