import assert from "node:assert/strict";
import { test } from "node:test";

import {
  describeCloseKindHuman,
  formatDurationMs,
  formatHumanLogLine,
  formatHumanLogMessage,
  formatListenerSummary,
  resolveLogOutputFormat,
  shortenClientId,
} from "./humanLogMessages.js";

test("formatDurationMs renders seconds and minutes", () => {
  assert.equal(formatDurationMs(26_000), "26 s");
  assert.equal(formatDurationMs(134_000), "2 min 14 s");
  assert.equal(formatDurationMs(null), null);
});

test("shortenClientId truncates long ids", () => {
  assert.equal(shortenClientId("dd1c5cb4-c59e-4f75-bca1-890b9972f832"), "dd1c5cb4…");
  assert.equal(shortenClientId("abc"), "abc");
});

test("formatListenerSummary renders totals and languages", () => {
  assert.equal(
    formatListenerSummary({ totalListeners: 6, byLanguage: { es: 6, en: 0, ro: 0 } }),
    "6 oyentes (es: 6)"
  );
  assert.equal(
    formatListenerSummary({ totalListeners: 1, byLanguage: { es: 1, en: 0, ro: 0 } }),
    "1 oyente (es: 1)"
  );
});

test("formatHumanLogMessage covers key production events", () => {
  assert.match(
    formatHumanLogMessage("server.started", {
      port: "8080",
      wsStaleAfterMs: 300000,
    }),
    /Servidor listo en puerto 8080/
  );

  assert.match(
    formatHumanLogMessage("broadcaster.registered", {
      language: "es",
      listeners: { totalListeners: 0, byLanguage: { es: 0, en: 0, ro: 0 } },
    }),
    /Emisión iniciada en es/
  );

  assert.match(
    formatHumanLogMessage("ws.client.disconnected", {
      clientId: "dd1c5cb4-c59e-4f75-bca1-890b9972f832",
      role: "listener",
      language: "es",
      closeCode: 1006,
      closeKind: "abnormal_no_close_frame",
      idleMs: 26_412,
      connectedDurationMs: 1_748_506,
      listeners: { totalListeners: 4, byLanguage: { es: 4, en: 0, ro: 0 } },
    }),
    /Oyente dd1c5cb4… \(es\) desconectado: conexión cortada sin aviso/
  );
  assert.match(
    formatHumanLogMessage("ws.client.disconnected", {
      clientId: "dd1c5cb4-c59e-4f75-bca1-890b9972f832",
      role: "listener",
      language: "es",
      closeCode: 1006,
      closeKind: "abnormal_no_close_frame",
      idleMs: 26_412,
      connectedDurationMs: 1_748_506,
      listeners: { totalListeners: 4, byLanguage: { es: 4, en: 0, ro: 0 } },
    }),
    /Quedan 4 oyentes/
  );

  assert.match(
    formatHumanLogMessage("ws.client.stale_closed", {
      clientId: "dd1c5cb4-c59e-4f75-bca1-890b9972f832",
      language: "es",
      idleMs: 134_512,
      staleThresholdMs: 120000,
      listeners: { totalListeners: 1, byLanguage: { es: 1, en: 0, ro: 0 } },
    }),
    /Conexión fantasma cerrada/
  );

  assert.match(
    formatHumanLogMessage("server.shutdown.started", {
      signal: "SIGTERM",
      connectedClients: 0,
    }),
    /Reinicio o deploy en curso/
  );

  assert.match(
    formatHumanLogMessage("signaling.offer.no_broadcaster", {
      language: "es",
      listenerId: "38fe1719-1268-4502-9128-8cc47e951a7b",
    }),
    /no hay emisor activo/
  );
});

test("describeCloseKindHuman maps close kinds to Spanish", () => {
  assert.equal(
    describeCloseKindHuman("abnormal_no_close_frame"),
    "conexión cortada sin aviso (red o segundo plano)"
  );
  assert.equal(
    describeCloseKindHuman("replaced_by_reconnect"),
    "reconexión del mismo dispositivo"
  );
});

test("formatHumanLogLine includes level label and event slug", () => {
  const line = formatHumanLogLine("warn", "broadcaster.disconnected", {
    language: "es",
    closeKind: "going_away",
    replacementClientId: null,
    listeners: { totalListeners: 2, byLanguage: { es: 2, en: 0, ro: 0 } },
  });
  assert.match(line, /\[AVISO\]/);
  assert.match(line, /Emisor es desconectado/);
  assert.match(line, /broadcaster\.disconnected$/);
});

test("resolveLogOutputFormat defaults to human", () => {
  assert.equal(resolveLogOutputFormat(undefined), "human");
  assert.equal(resolveLogOutputFormat("json"), "json");
  assert.equal(resolveLogOutputFormat("both"), "both");
  assert.equal(resolveLogOutputFormat("invalid"), "human");
});
