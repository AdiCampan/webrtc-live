export const SERVER_SHUTDOWN_RETRY_MS = 3000;

export function buildServerShutdownMessage(
  retryAfterMs = SERVER_SHUTDOWN_RETRY_MS
) {
  return JSON.stringify({ type: "server-shutdown", retryAfterMs });
}

/**
 * Notify clients and close the HTTP server when Render sends SIGTERM (deploy/restart).
 */
export function registerGracefulShutdown({
  server,
  wss,
  heartbeatInterval,
  onBeforeClose,
}) {
  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`🛑 ${signal} received, starting graceful shutdown…`);

    const payload = buildServerShutdownMessage();
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        try {
          client.send(payload);
        } catch {
          // Client socket may already be closing
        }
      }
    });

    clearInterval(heartbeatInterval);
    if (typeof onBeforeClose === "function") {
      onBeforeClose();
    }

    server.close(() => {
      console.log("✅ HTTP server closed");
      process.exit(0);
    });

    setTimeout(() => {
      console.warn("⚠️ Graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, 10000).unref();
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}
