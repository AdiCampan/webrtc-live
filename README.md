🌐 WebRTC Streaming Platform – Transmisión y Traducción en Tiempo Real

Este proyecto utiliza WebRTC (Web Real-Time Communication) para ofrecer una solución moderna y eficiente de transmisión de video, audio y datos en tiempo real.
Está especialmente pensado para iglesias, organizaciones comunitarias, pequeñas empresas y eventos locales que desean transmitir contenido en vivo o realizar traducciones simultáneas sin depender de plataformas comerciales costosas.

🚀 ¿Qué es WebRTC?

WebRTC es una tecnología de código abierto que permite la comunicación directa entre navegadores y dispositivos sin necesidad de plugins o software adicional.
Gracias a su soporte nativo en la mayoría de los navegadores modernos (como Chrome, Firefox, Edge y Safari), es posible establecer conexiones punto a punto (P2P) seguras para compartir audio, video y datos en tiempo real.

En este proyecto, WebRTC se utiliza para:

Transmitir video y audio en vivo desde un emisor (por ejemplo, una cámara en una iglesia o sala de conferencias).

Permitir que múltiples usuarios visualicen la transmisión simultáneamente.

Habilitar canales de traducción simultánea, donde un intérprete puede transmitir audio en otro idioma sincronizado con la transmisión principal.

Reducir la latencia (retraso) en comparación con servicios tradicionales de streaming.

🖥️ Infraestructura del Proyecto

Para garantizar la estabilidad y accesibilidad del sistema, se recomienda implementar la infraestructura de la siguiente manera:

1. Servidor principal alojado en Render.com

Render proporciona una plataforma en la nube sencilla y escalable para desplegar aplicaciones web.
En este proyecto, el servidor cumple funciones esenciales:

Servir la interfaz web del sistema (frontend y backend).

Gestionar las señales de conexión entre usuarios (signaling server).

Administrar las sesiones y usuarios conectados.

El servidor de señalización (Signaling Server) es el encargado de intercambiar mensajes iniciales (SDP, ICE candidates) entre los clientes para que puedan establecer la conexión P2P de WebRTC.

2. Servicio TURN/STUN con Metered.ca

Aunque WebRTC se basa en conexiones P2P, en muchos entornos (como redes corporativas, universidades o iglesias con firewalls estrictos) las conexiones directas pueden verse bloqueadas.
Para solucionar este problema, se utiliza un servidor TURN/STUN.

STUN (Session Traversal Utilities for NAT): ayuda a los clientes a descubrir su dirección IP pública y cómo están conectados a la red.

TURN (Traversal Using Relays around NAT): actúa como intermediario cuando las conexiones P2P directas no son posibles, retransmitiendo el tráfico de audio y video entre los usuarios.

En este proyecto, el servicio TURN/STUN de Metered.ca se recomienda por su facilidad de configuración, escalabilidad y compatibilidad con WebRTC.

El uso de TURN garantiza que los usuarios puedan conectarse aun detrás de firewalls o redes privadas, mejorando la confiabilidad del sistema de streaming.

🔒 Seguridad

Todas las conexiones se establecen a través de HTTPS y WSS (WebSocket Secure) para proteger los datos transmitidos.

WebRTC cifra automáticamente los canales de audio, video y datos usando SRTP (Secure Real-time Transport Protocol).

El servidor se aloja en un entorno seguro y con certificados SSL válidos para garantizar la comunicación cifrada entre cliente y servidor.

🧩 Casos de Uso

🎤 Traducciones en tiempo real durante misas, conferencias o eventos.

📡 Transmisión en vivo de servicios religiosos, talleres o charlas.

🤝 Comunicación interna entre equipos o grupos comunitarios sin depender de plataformas externas.

🎧 Audio simultáneo en múltiples idiomas, gestionado por intérpretes conectados al mismo sistema.

⚙️ Requisitos Básicos

Node.js (versión 18 o superior)

Cuenta en Render.com
 para desplegar el servidor

Credenciales de Metered.ca
 para el servicio TURN/STUN

Certificado SSL válido (Render lo genera automáticamente)

Navegador compatible con WebRTC (Chrome, Firefox, Edge, Safari)

### Producción: Render, domingo concurrido y qué revisar

**Por qué puede fallar con mucha gente (ej. domingo con audiencia alta)**

El servidor solo **reenvía señalización WebRTC** (SDP / ICE); el audio va entre navegadores/apps con Metered y P2P. Eso limita la CPU necesaria en el servidor, pero:

1. **Plan gratis en Render**  
   La instancia **duerme** tras ~15 minutos sin tráfico. La primera conexión del día puede tardar en arrancar (cold start). En una misa con todos entrando a la vez, muchos ven errores de conexión si el servicio estaba dormido o sobrecargado al despertar.  
   **Recomendación:** usar un plan **Starter** (o superior) para que el servicio esté **siempre activo** el día del culto, o programar un “wake” previo (p. ej. peticiones HTTPS unos minutos antes) si solo tienes gratis.

2. **Límites de RAM / CPU / timeouts del proxy**  
   Con docenas de WebSockets abiertos, cualquier sobrecarga (muchísimos `console.log`, broadcasts muy frecuentes hacia todos los clientes, picos de reconexión) puede acercarse al techo del tier gratis.

3. **Sin registros históricos en el repo**  
   Para saber con seguridad qué pasó el **domingo 26 de abril de 2026**, hay que revisar **los logs de Render** en ese intervalo (dashboard → tu Web Service → Logs / Metrics): errores 502/503, OOM, restarts, conteos de conexiones WebSocket.

**Mejoras aplicadas en el servidor**

- **Debouncing del mensaje `listeners-count`** para que reconectar muchos oyentes no dispare un broadcast global por usuario en cascada (menos tráfico WS cuando hay pico).
- **Logging legible en Render** (frases en español, una línea por evento) con slug técnico al final para filtrar; opcionalmente JSON con `SIGNALING_LOG_FORMAT=json`.
- **`GET /health`**, antes del SPA (`index.html`), devuelve JSON (`ok`, `uptimeSeconds`, `websocketClients`) para vigilar uptime desde cron u otros sistemas.
- **`GET /signaling/metrics`**: snapshot operativo (oyentes por idioma, broadcasters activos, último error registrado).

**Variables útiles en Render**

| Variable | Uso |
|----------|-----|
| `NODE_ENV=production` | Comportamiento típico de Node en producción. |
| `SIGNALING_VERBOSE=1` o `true` | Activa logs detallados (`verbose`): cada mensaje WS, relays ICE, buffers, etc. Solo para investigar incidentes. |
| `SIGNALING_LOG_FORMAT` | `human` (por defecto), `json` (línea JSON antigua) o `both` (las dos). |
| `LISTENER_COUNT_DEBOUNCE_MS` | Ms entre refrescos agrupados del conteo (por defecto 500). |
| `WS_STALE_AFTER_MS` | Ms sin actividad del cliente antes de cerrar un WS de oyente/broadcaster (por defecto 300000, mínimo 30000). |
| `LISTENER_BACKGROUND_GRACE_MS` | Ms durante los que un oyente sigue contando en el panel aunque el WebSocket se haya cortado (p. ej. Android en segundo plano con audio activo; por defecto 1800000). |

---

## Logs del servidor de señalización

En producción, el servidor escribe **una línea legible por evento** (español), con el identificador técnico al final para filtrar en Render. No hace falta tener el código delante para entender qué pasó.

### Formato (por defecto)

```
2026-05-31T15:54:49.663Z [INFO] Emisión iniciada en es. Sin oyentes aún · broadcaster.registered
2026-05-31T16:25:30.140Z [AVISO] Oyente dd1c5cb4… (es) desconectado: conexión cortada sin aviso (red o segundo plano), conectado 29 min 1 s, inactivo 26 s. Quedan 6 oyentes (es: 6) · ws.client.disconnected
2026-05-31T16:25:30.218Z [AVISO] Reinicio o deploy en curso (SIGTERM). Clientes conectados: 0 · server.shutdown.started
2026-05-31T16:26:23.241Z [INFO] Servidor listo en puerto 8080 (corte por inactividad WS: 300 s) · server.started
2026-05-31T18:00:16.348Z [AVISO] Emisor es desconectado (pestaña o app cerrada). No hay otra sesión de emisión activa. Quedan 2 oyentes (es: 2) · broadcaster.disconnected
2026-05-31T18:12:45.218Z [AVISO] Conexión fantasma cerrada: oyente dd1c5cb4… (es) sin actividad durante 2 min 15 s (límite 300 s). Quedan 1 oyente (es: 1) · ws.client.stale_closed
```

Niveles: `[INFO]`, `[AVISO]`, `[ERROR]`, `[DETALLE]` (este último solo con `SIGNALING_VERBOSE=1`).

Para volver al JSON antiguo (una línea JSON por evento), define `SIGNALING_LOG_FORMAT=json`. Con `both` se imprimen las dos.

### Ejemplo JSON (solo si `SIGNALING_LOG_FORMAT=json`)

```json
{
  "ts": "2026-05-28T21:00:00.000Z",
  "level": "warn",
  "event": "ws.client.disconnected",
  "clientId": "abc-123",
  "role": "listener",
  "language": "es",
  "closeCode": 1006,
  "closeKind": "abnormal_no_close_frame",
  "idleMs": 125000,
  "listeners": {
    "totalListeners": 2,
    "byLanguage": { "es": 2, "en": 0, "ro": 0 }
  }
}
```

| Campo | Descripción |
|-------|-------------|
| `ts` | Marca de tiempo ISO 8601 (UTC). |
| `level` | `info`, `warn`, `error` o `verbose` (este último solo con `SIGNALING_VERBOSE=1`). |
| `event` | Identificador del evento (usar para filtrar en Render). |
| Resto | Contexto específico del evento (IDs, idioma, códigos de cierre, errores, etc.). |

### Cómo buscar en Render

En el dashboard del Web Service → **Logs**, busca por texto en español o por el slug técnico al final de la línea:

| Objetivo | Filtro sugerido |
|----------|-----------------|
| Desconexiones de oyentes | `desconectado` o `ws.client.disconnected` |
| Conexiones fantasma eliminadas | `Conexión fantasma` o `ws.client.stale_closed` |
| Caída del broadcaster | `Emisor` y `desconectado` o `broadcaster.disconnected` |
| Reinicio/deploy del servidor | `Reinicio o deploy` o `server.shutdown.started` |
| Oyente sin broadcaster | `no hay emisor activo` o `signaling.offer.no_broadcaster` |
| Emisión iniciada | `Emisión iniciada` o `broadcaster.registered` |
| Errores graves | `[ERROR]` |

También puedes consultar en vivo: `GET https://<tu-host>/signaling/metrics` (JSON con oyentes, broadcasters y `lastError`).

### Eventos que sí aparecen en producción (sin `SIGNALING_VERBOSE`)

#### Arranque y apagado

| Evento | Nivel | Cuándo |
|--------|-------|--------|
| `server.started` | info | Servidor HTTP + WebSocket listo (puerto, `wsStaleAfterMs`, etc.). |
| `server.firebase.connected` | info | Firebase Admin inicializado. |
| `server.shutdown.started` | warn | SIGTERM/SIGINT (deploy o reinicio en Render). Incluye `signal` y `connectedClients`. |
| `server.shutdown.completed` | info | Apagado limpio completado. |
| `server.shutdown.timeout` | error | Apagado forzado tras 10 s. |

#### Broadcaster

| Evento | Nivel | Cuándo |
|--------|-------|--------|
| `broadcaster.registered` | info | Broadcaster autorizado para un idioma. Incluye conteo de oyentes. |
| `broadcaster.stopped` | info | Transmisión detenida (`stop-broadcast`). |
| `broadcaster.disconnected` | warn | Socket del broadcaster cerrado. Incluye `closeCode`, `closeKind`, `replacementClientId` si hay suplente. |
| `broadcaster.replaced_previous` | info | Nueva pestaña/sesión reemplazó al broadcaster anterior del mismo idioma. |
| `broadcaster.replace_previous_failed` | error | No se pudo cerrar el broadcaster anterior. |

#### Oyentes y WebSocket

| Evento | Nivel | Cuándo |
|--------|-------|--------|
| `ws.client.disconnected` | info / warn | Oyente con idioma activo se desconecta. **info** si cierre normal (`closeCode` 1000); **warn** si anómalo. Incluye `idleMs`, `connectedDurationMs`, oyentes restantes. |
| `ws.client.stale_closed` | warn | Conexión inactiva > `WS_STALE_AFTER_MS` (fantasma, app en segundo plano colgada, etc.). |
| `ws.client.duplicate_replaced` | warn | Dos sockets con el mismo `clientId`; se cierra el duplicado. |
| `ws.client.language_restored` | info | Tras `identify`, se restaura el idioma de una sesión previa. |
| `listener.stopped` | info | Oyente envió `stop-listening` explícitamente. |

#### Señalización WebRTC

| Evento | Nivel | Cuándo |
|--------|-------|--------|
| `signaling.offer.no_broadcaster` | warn | `request-offer` sin broadcaster activo para ese idioma. |
| `signaling.relay.language_mismatch` | warn | Offer/answer/candidate ignorado por idioma incompatible. |
| `signaling.peer.pruned` | info | Broadcaster notificado para cerrar peer de un oyente que ya no existe (`stop-connection`). |

#### Autenticación y errores

| Evento | Nivel | Cuándo |
|--------|-------|--------|
| `auth.broadcaster_rejected` | warn | Token JWT inválido o expirado al registrar broadcaster. |
| `ws.server.error` | error | Error del WebSocketServer. |
| `ws.ping.failed` | warn | Fallo al enviar ping a un cliente. |
| `server.firestore.read_failed` / `write_failed` | error | Error leyendo/escribiendo Firestore. Incluye `errorMessage` y stack truncado. |

### Códigos de cierre WebSocket (`closeKind`)

| `closeCode` | `closeKind` | Significado |
|-------------|-------------|-------------|
| 1000 | `normal_closure` | Cierre limpio (usuario para, app cierra WS). |
| 1001 | `going_away` | Cliente se va (pestaña cerrada, etc.). |
| 1006 | `abnormal_no_close_frame` | Conexión rota sin frame de cierre (red, app matada). |
| 4000 | `replaced_by_new_registration` | Otro broadcaster tomó el mismo idioma. |
| 4001 | `stale_connection` | Servidor cerró por inactividad (conexión fantasma). |
| 4002 | `replaced_by_reconnect` | Mismo `clientId` reconectó en otro socket. |

### Logs verbose (solo con `SIGNALING_VERBOSE=1`)

Incluyen tráfico rutinario que no aporta en producción normal:

- `ws.client.connected`, `ws.message.received`, `ws.heartbeat`
- `signaling.relay.forwarded`, `signaling.relay.buffered`, `signaling.message.buffered`
- `ws.client.disconnected` duplicado tras `stale_closed` (código 4001)

Activa verbose **solo durante la investigación** de un incidente y desactívalo después.

### App móvil (logs en dispositivo)

La app usa el mismo criterio: en **producción** solo emite JSON en `warn` y `error` (desconexiones WS, ICE degradado, `server.shutdown`, reconexiones WebRTC). En desarrollo (`__DEV__`) también muestra eventos `info` y `verbose`.

Eventos móviles relevantes:

| Evento | Nivel | Cuándo |
|--------|-------|--------|
| `ws.disconnected` | warn | WebSocket cerrado. |
| `ws.error` | warn | Error de socket. |
| `ws.reconnect.scheduled` | info | Reintento programado (solo dev). |
| `ws.reconnected` | info | WS vuelve tras caída; pide oferta nueva. |
| `server.shutdown` | warn | Aviso de reinicio del servidor. |
| `webrtc.ice.degraded` | warn | ICE `disconnected` o `failed`. |
| `webrtc.reconnect.started` | warn | Recuperación WebRTC iniciada. |
| `signaling.broadcast_resumed` | info | Broadcaster activo de nuevo; solicita oferta. |

Para ver logs del móvil en pruebas: Xcode Console (iOS) o `adb logcat` filtrando por el JSON del evento.

---

**Keep-alive automático (plan gratis)**

El workflow `.github/workflows/render-keepalive.yml` hace ping a `/health` cada **10 minutos** (con reintentos y timeout ampliado para cold starts de Render) para evitar que duerma el servicio entre cultos. Actívalo haciendo push a la rama principal del repo en GitHub.

**Reinicios de Render**

En despliegues o reinicios, el servidor envía `{ type: "server-shutdown" }` a los clientes conectados para que reconecten solos. Las apps móviles recientes lo gestionan automáticamente.

📄 Estructura del Proyecto (Ejemplo)
├── server/
│   ├── index.js          # Servidor de señalización con WebSocket
│   ├── config.js         # Configuración del servicio TURN/STUN
│   └── package.json
├── public/
│   ├── index.html        # Interfaz principal de usuario
│   ├── app.js            # Lógica de conexión WebRTC en el cliente
│   └── styles.css
└── README.md

📢 Próximas Mejoras

Integración con subtítulos automáticos (Speech-to-Text).

Sistema de gestión de salas (multi-stream).

Grabación local o en la nube de transmisiones.

Panel de control para administradores e intérpretes.

💡 Conclusión

Este proyecto demuestra el potencial de WebRTC para ofrecer una solución accesible, segura y moderna de transmisión y traducción en tiempo real, ideal para comunidades, iglesias y pequeñas empresas que buscan independencia tecnológica y bajos costos operativos.
