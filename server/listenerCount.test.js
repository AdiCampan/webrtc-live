import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildListenerCountPayload,
  computeListenerCounts,
  parseListenerBackgroundGraceMs,
} from "./listenerCount.js";
import { createClientSessionStore } from "./clientSessions.js";

test("parseListenerBackgroundGraceMs clamps and defaults", () => {
  assert.equal(parseListenerBackgroundGraceMs(undefined), 1_800_000);
  assert.equal(parseListenerBackgroundGraceMs("120000"), 120_000);
  assert.equal(parseListenerBackgroundGraceMs("1000"), 60_000);
});

test("computeListenerCounts includes grace sessions without open socket", () => {
  const store = createClientSessionStore();
  store.setListenerLanguage("listener-bg", "es");

  const clients = [
    { id: "listener-live", readyState: 1, isBroadcaster: false, language: "es" },
  ];

  const withGrace = computeListenerCounts(clients, store, 1_800_000);
  assert.equal(withGrace.totalListeners, 2);
  assert.equal(withGrace.byLanguage.es, 2);

  const withoutGrace = computeListenerCounts(clients, store, 0);
  assert.equal(withoutGrace.totalListeners, 1);
});

test("buildListenerCountPayload matches broadcast shape", () => {
  const store = createClientSessionStore();
  const payload = buildListenerCountPayload([], store, 1_800_000);
  assert.deepEqual(payload, { es: 0, en: 0, ro: 0 });
});
