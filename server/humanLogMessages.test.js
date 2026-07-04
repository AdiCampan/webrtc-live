import assert from "node:assert/strict";
import { test } from "node:test";

import {
  describeCloseKindHuman,
  formatDurationMs,
  formatHumanLogDiagnosis,
  formatHumanLogLine,
  formatHumanLogMessage,
  formatListenerSummary,
  formatServerRecordedAtFooter,
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
    formatListenerSummary({
      totalListeners: 6,
      byLanguage: { es: 6, en: 0, ro: 0 },
      byPlatform: { web: 2, android: 3, ios: 1, unknown: 0 },
    }),
    "6 oyentes (es: 6 · origen: web: 2, Android: 3, iPhone: 1)"
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
      clientId: "emisor-abc-123",
      listeners: { totalListeners: 0, byLanguage: { es: 0, en: 0, ro: 0 } },
      activeBroadcasts: { es: true, en: false, ro: false },
    }),
    /Emisión EN VIVO en es/
  );
  assert.match(
    formatHumanLogMessage("broadcaster.registered", {
      language: "es",
      clientId: "emisor-abc-123",
      listeners: { totalListeners: 0, byLanguage: { es: 0, en: 0, ro: 0 } },
      activeBroadcasts: { es: true, en: false, ro: false },
    }),
    /Emisor: emisor-a/
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
    /señal WebSocket cortada/
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
    /Conteo oyentes: 4 oyentes/
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
    /Reinicio o deploy/
  );

  assert.match(
    formatHumanLogMessage("signaling.offer.no_broadcaster", {
      language: "es",
      listenerId: "38fe1719-1268-4502-9128-8cc47e951a7b",
      activeBroadcasts: { es: false, en: false, ro: false },
    }),
    /No hay emisor activo/
  );
});

test("describeCloseKindHuman maps close kinds to Spanish", () => {
  assert.equal(
    describeCloseKindHuman("abnormal_no_close_frame"),
    "señal WebSocket cortada (móvil en segundo plano, red o ahorro de batería)"
  );
  assert.equal(
    describeCloseKindHuman("replaced_by_reconnect"),
    "mismo dispositivo reconectado (socket antiguo)"
  );
});

test("formatServerRecordedAtFooter renders Madrid and UTC from the same instant", () => {
  const footer = formatServerRecordedAtFooter("2026-06-14T16:46:34.066Z");
  assert.match(footer, /Registrado servidor:/);
  assert.match(footer, /Madrid/);
  assert.match(footer, /2026-06-14T16:46:34\.066Z \(UTC\)/);
});

test("formatHumanLogLine appends OK for healthy info events", () => {
  const line = formatHumanLogLine("info", "broadcaster.registered", {
    language: "es",
    clientId: "abc12345-long-id",
    listeners: { totalListeners: 3, byLanguage: { es: 3, en: 0, ro: 0 } },
    activeBroadcasts: { es: true, en: false, ro: false },
  });
  assert.match(line, /\[INFO\]/);
  assert.match(line, /broadcaster\.registered/);
  assert.match(line, /Emisión EN VIVO en es/);
  assert.match(line, /Conteo oyentes: 3 oyentes/);
  assert.match(line, /\n  OK\n  Registrado servidor:/);
  assert.match(line, /\(UTC\)$/);
});

test("formatHumanLogLine includes diagnosis for broadcaster disconnect without replacement", () => {
  const line = formatHumanLogLine("warn", "broadcaster.disconnected", {
    language: "es",
    clientId: "emisor-xyz",
    closeCode: 1006,
    closeKind: "abnormal_no_close_frame",
    replacementClientId: null,
    connectedDurationMs: 2_700_000,
    listeners: { totalListeners: 12, byLanguage: { es: 12, en: 0, ro: 0 } },
    activeBroadcasts: { es: false, en: false, ro: false },
  });
  assert.match(line, /\[AVISO\]/);
  assert.match(line, /No queda otra sesión de emisión/);
  assert.match(line, /Por qué está mal: no hay emisor activo/i);
  assert.match(line, /Acción:/);
  assert.match(line, /Código a revisar:.*server\/server\.js/);
  assert.match(line, /Posibles fallos en código:/);
  assert.match(line, /findStandbyBroadcaster/);
  assert.doesNotMatch(line, /\n  OK\n/);
  assert.match(line, /Registrado servidor:.*\(UTC\)$/);
});

test("formatHumanLogLine includes fix guidance for firestore errors", () => {
  const diagnosis = formatHumanLogDiagnosis("error", "server.firestore.read_failed", {
    errorMessage: "permission denied",
    collection: "events",
    doc: "next-event",
  });
  assert.equal(diagnosis.isOk, false);
  assert.match(diagnosis.lines.join(" "), /FIREBASE_SERVICE_ACCOUNT/);
  assert.match(diagnosis.lines.join(" "), /Código a revisar:/);
  assert.match(diagnosis.lines.join(" "), /Posibles fallos en código:/);
  assert.match(diagnosis.lines.join(" "), /server\/server\.js/);
});

test("formatHumanLogLine marks intentional listener disconnect as OK", () => {
  const line = formatHumanLogLine("info", "ws.client.disconnected", {
    clientId: "listener-1",
    role: "listener",
    language: "es",
    closeCode: 1000,
    closeKind: "normal_closure",
    intentionalStop: true,
    listeners: { totalListeners: 1, byLanguage: { es: 1, en: 0, ro: 0 } },
  });
  assert.match(line, /\n  OK\n  Registrado servidor:/);
  assert.doesNotMatch(line, /Por qué está mal/);
});

test("formatHumanLogLine marks 4002 reconnect replacement disconnect as OK", () => {
  const line = formatHumanLogLine("info", "ws.client.disconnected", {
    clientId: "dd1c5cb4-long-id",
    role: "listener",
    language: "es",
    closeCode: 4002,
    closeKind: "replaced_by_reconnect",
    intentionalStop: true,
    connectedDurationMs: 3_380_000,
    idleMs: 6000,
    listeners: { totalListeners: 3, byLanguage: { es: 3, en: 0, ro: 0 } },
  });
  assert.match(line, /\[INFO\]/);
  assert.match(line, /código WS 4002/);
  assert.match(line, /mismo dispositivo reconectado/i);
  assert.match(line, /\n  OK\n  Registrado servidor:/);
  assert.doesNotMatch(line, /Por qué está mal/);
});

test("formatHumanLogLine marks duplicate_replaced as OK without diagnosis noise", () => {
  const line = formatHumanLogLine("info", "ws.client.duplicate_replaced", {
    clientId: "dd1c5cb4-long-id",
    restoredLanguage: "es",
  });
  assert.match(line, /ws\.client\.duplicate_replaced/);
  assert.match(line, /Mismo dispositivo reconectado/);
  assert.match(line, /\n  OK\n  Registrado servidor:/);
  assert.doesNotMatch(line, /Acción:/);
});

test("resolveLogOutputFormat defaults to human", () => {
  assert.equal(resolveLogOutputFormat(undefined), "human");
  assert.equal(resolveLogOutputFormat("json"), "json");
  assert.equal(resolveLogOutputFormat("both"), "both");
  assert.equal(resolveLogOutputFormat("invalid"), "human");
});
