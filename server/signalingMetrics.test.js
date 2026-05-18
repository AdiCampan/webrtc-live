import assert from "node:assert";
import { test, afterEach } from "node:test";

import {
  buildSignalingMetricsPayload,
  countClientsByRole,
  recordBroadcasterRegistration,
  recordSignalingError,
  resetSignalingMetricsForTests,
} from "./signalingMetrics.js";

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
    },
    {
      id: "d",
      readyState: OPEN,
      isBroadcaster: false,
      language: "en",
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
