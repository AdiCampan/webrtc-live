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
- **Menos logging por defecto en producción** (mensajes por cliente ocultos salvo `SIGNALING_VERBOSE=1`).
- **`GET /health`**, antes del SPA (`index.html`), devuelve JSON (`ok`, `uptimeSeconds`, `websocketClients`) para vigilar uptime desde cron u otros sistemas.

**Variables útiles en Render**

| Variable | Uso |
|----------|-----|
| `NODE_ENV=production` | Comportamiento típico de Node en producción; con el servidor actual reduce logs por defecto. |
| `SIGNALING_VERBOSE=1` | Volver a los logs detallados por cliente si necesitas investigar un incidente. |
| `LISTENER_COUNT_DEBOUNCE_MS` | Ms entre refrescos agrupados del conteo (por defecto 500). |
| `WS_STALE_AFTER_MS` | Ms sin ping antes de cerrar un WS de oyente/broadcaster (por defecto 120000). |

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
