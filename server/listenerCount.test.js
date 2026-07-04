import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildListenerCountPayload,
  computeListenerCounts,
  parseListenerBackgroundGraceMs,
} from "./listenerCount.js";
import { createClientSessionStore } from "./clientSessions.js";

test("parseListenerBackgroundGraceMs clamps and defaults", () => {
  assert.equal(parseListenerBackgroundGraceMs(undefined), 10_800_000);
  assert.equal(parseListenerBackgroundGraceMs("120000"), 120_000);
  assert.equal(parseListenerBackgroundGraceMs("1000"), 60_000);
  assert.equal(parseListenerBackgroundGraceMs("10800000"), 10_800_000);
  assert.equal(parseListenerBackgroundGraceMs("99999999"), 10_800_000);
});

test("computeListenerCounts includes grace sessions without open socket", () => {
  const store = createClientSessionStore();
  store.setListenerLanguage("listener-bg", "es", "android");

  const clients = [
    {
      id: "listener-live",
      readyState: 1,
      isBroadcaster: false,
      language: "es",
      platform: "web",
    },
  ];

  const withGrace = computeListenerCounts(clients, store, 1_800_000);
  assert.equal(withGrace.totalListeners, 2);
  assert.equal(withGrace.byLanguage.es, 2);
  assert.deepEqual(withGrace.byPlatform, {
    web: 1,
    android: 1,
    ios: 0,
    unknown: 0,
  });

  const withoutGrace = computeListenerCounts(clients, store, 0);
  assert.equal(withoutGrace.totalListeners, 1);
});

test("computeListenerCounts deduplicates open sockets by listener id", () => {
  const store = createClientSessionStore();
  const clients = [
    {
      id: "listener-duplicate",
      readyState: 1,
      isBroadcaster: false,
      language: "es",
      platform: "web",
    },
    {
      id: "listener-duplicate",
      readyState: 1,
      isBroadcaster: false,
      language: "es",
      platform: "android",
    },
  ];

  const counts = computeListenerCounts(clients, store, 0);
  assert.equal(counts.totalListeners, 1);
  assert.deepEqual(counts.byLanguage, { es: 1, en: 0, ro: 0 });
  assert.deepEqual(counts.byPlatform, {
    web: 1,
    android: 0,
    ios: 0,
    unknown: 0,
  });
});

test("computeListenerCounts ignores unsupported listener languages", () => {
  const store = createClientSessionStore();
  store.setListenerLanguage("listener-session-unsupported", "fr", "android");
  const clients = [
    {
      id: "listener-unsupported",
      readyState: 1,
      isBroadcaster: false,
      language: "fr",
      platform: "web",
    },
  ];

  const counts = computeListenerCounts(clients, store, 1_800_000);
  assert.equal(counts.totalListeners, 0);
  assert.deepEqual(counts.byLanguage, { es: 0, en: 0, ro: 0 });
  assert.deepEqual(counts.byPlatform, {
    web: 0,
    android: 0,
    ios: 0,
    unknown: 0,
  });
});

test("buildListenerCountPayload matches broadcast shape", () => {
  const store = createClientSessionStore();
  const payload = buildListenerCountPayload([], store, 1_800_000);
  assert.deepEqual(payload, {
    listeners: { es: 0, en: 0, ro: 0 },
    listenersByPlatform: { web: 0, android: 0, ios: 0, unknown: 0 },
  });
});
