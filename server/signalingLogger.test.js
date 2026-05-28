import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildClientLogContext,
  createSignalingLogger,
  describeCloseCode,
  errorFields,
  isVerboseLoggingEnabled,
  logSignalingEvent,
  snapshotListenerCounts,
} from "./signalingLogger.js";

test("describeCloseCode maps known WebSocket codes", () => {
  assert.equal(describeCloseCode(4001), "stale_connection");
  assert.equal(describeCloseCode(4002), "replaced_by_reconnect");
  assert.equal(describeCloseCode(9999), "ws_close_9999");
});

test("errorFields extracts message and truncated stack", () => {
  const err = new Error("ping failed");
  const fields = errorFields(err);
  assert.equal(fields.errorMessage, "ping failed");
  assert.equal(fields.errorName, "Error");
  assert.ok(fields.errorStack?.includes("ping failed"));
});

test("buildClientLogContext includes role language and idleMs", () => {
  const now = Date.now();
  const ctx = buildClientLogContext({
    id: "listener-1",
    isBroadcaster: false,
    language: "es",
    connectedAt: now - 60_000,
    lastClientActivityAt: now - 5_000,
  });
  assert.equal(ctx.clientId, "listener-1");
  assert.equal(ctx.role, "listener");
  assert.equal(ctx.language, "es");
  assert.equal(ctx.connectedDurationMs, 60_000);
  assert.equal(ctx.idleMs, 5_000);
});

test("snapshotListenerCounts counts open listeners by language", () => {
  const clients = [
    { readyState: 1, isBroadcaster: false, language: "es" },
    { readyState: 1, isBroadcaster: false, language: "es" },
    { readyState: 1, isBroadcaster: true, language: "es" },
  ];
  assert.deepEqual(snapshotListenerCounts(clients), {
    totalListeners: 2,
    byLanguage: { es: 2, en: 0, ro: 0 },
  });
});

test("logSignalingEvent skips verbose when disabled", () => {
  let called = 0;
  const original = console.log;
  console.log = () => {
    called += 1;
  };
  try {
    logSignalingEvent("verbose", "ws.client.connected", {}, {
      verboseEnabled: false,
    });
    assert.equal(called, 0);
    logSignalingEvent("info", "server.started", {}, { verboseEnabled: false });
    assert.equal(called, 1);
  } finally {
    console.log = original;
  }
});

test("isVerboseLoggingEnabled parses env flag", () => {
  assert.equal(isVerboseLoggingEnabled("true"), true);
  assert.equal(isVerboseLoggingEnabled("0"), false);
});

test("createSignalingLogger records errors via callback", () => {
  let recorded = "";
  const logger = createSignalingLogger({
    onErrorRecorded: (message) => {
      recorded = message;
    },
  });
  const original = console.error;
  console.error = () => {};
  try {
    logger.error("ws.server.error", { errorMessage: "boom" });
    assert.equal(recorded, "boom");
  } finally {
    console.error = original;
  }
});
