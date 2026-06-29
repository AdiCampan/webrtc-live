import assert from "node:assert";
import { test, afterEach } from "node:test";

import {
  buildSignalingMetricsPayload,
  countClientsByRole,
  countListenersByPlatform,
  recordBroadcasterRegistration,
  recordSignalingError,
  resetSignalingMetricsForTests,
} from "./signalingMetrics.js";
import { createClientSessionStore } from "./clientSessions.js";

const OPEN = 1;

afterEach(() => {
  resetSignalingMetricsForTests();
});

test("countClientsByRole separates idle, broadcaster, and listeners", () => {
  const clients = [
    {
      id: "a",
      readyState: OPEN,
      isBroadcaster: false,
      language: null,
    },
    {
      id: "b",
      readyState: OPEN,
      isBroadcaster: true,
      language: "es",
    },
    {
      id: "c",
      readyState: OPEN,
      isBroadcaster: false,
      language: "es",
      platform: "web",
    },
    {
      id: "d",
      readyState: OPEN,
      isBroadcaster: false,
      language: "en",
      platform: "android",
    },
    {
      id: "closed",
      readyState: 3,
      isBroadcaster: true,
      language: "es",
    },
  ];
  const got = countClientsByRole(clients);
  assert.deepStrictEqual(got.listenersByLanguage, { es: 1, en: 1, ro: 0 });
  assert.strictEqual(got.idle, 1);
  assert.strictEqual(got.broadcaster, 1);
  assert.strictEqual(got.listener, 2);
});

test("countListenersByPlatform includes open clients and grace sessions", () => {
  const store = createClientSessionStore();
  store.setListenerLanguage("listener-bg", "ro", "ios");

  const clients = [
    {
      id: "listener-web",
      readyState: OPEN,
      isBroadcaster: false,
      language: "es",
      platform: "web",
    },
    {
      id: "listener-unknown",
      readyState: OPEN,
      isBroadcaster: false,
      language: "en",
      platform: "smart-tv",
    },
    {
      id: "broadcaster",
      readyState: OPEN,
      isBroadcaster: true,
      language: "es",
      platform: "web",
    },
  ];

  assert.deepStrictEqual(countListenersByPlatform(clients, store, 1_800_000), {
    web: 1,
    android: 0,
    ios: 1,
    unknown: 1,
  });
});

test("countListenersByPlatform counts duplicate open listener ids once", () => {
  const clients = [
    {
      id: "same-listener",
      readyState: OPEN,
      isBroadcaster: false,
      language: "es",
      platform: "web",
    },
    {
      id: "same-listener",
      readyState: OPEN,
      isBroadcaster: false,
      language: "es",
      platform: "android",
    },
  ];

  assert.deepStrictEqual(countListenersByPlatform(clients, null, 0), {
    web: 1,
    android: 0,
    ios: 0,
    unknown: 0,
  });
});

test("buildSignalingMetricsPayload includes last error and last broadcaster registration", () => {
  recordSignalingError("unit-test failure");
  recordBroadcasterRegistration("es", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

  const payload = buildSignalingMetricsPayload({
    clients: [
      {
        id: "x",
        readyState: OPEN,
        isBroadcaster: false,
        language: "es",
        platform: "android",
      },
    ],
    broadcasters: {
      es: { id: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff", readyState: OPEN, broadcasterRegisteredAt: 1_700_000_000_000 },
      en: null,
      ro: null,
    },
    uptimeSeconds: 10,
    totalConnections: 3,
  });

  assert.strictEqual(payload.clientsByRole.listener, 1);
  assert.deepStrictEqual(payload.listenersByPlatform, {
    web: 0,
    android: 1,
    ios: 0,
    unknown: 0,
  });
  assert.strictEqual(payload.lastError?.message, "unit-test failure");
  assert.strictEqual(typeof payload.lastError?.at, "string");
  assert.strictEqual(
    payload.lastBroadcasterRegistration.es?.socketIdSuffix,
    "eeeeeeee"
  );
  assert.strictEqual(
    payload.activeBroadcasters.es?.socketIdSuffix,
    "ffffffff"
  );
});
