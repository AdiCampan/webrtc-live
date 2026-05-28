import assert from "node:assert/strict";
import { test } from "node:test";

import { createClientSessionStore } from "./clientSessions.js";
import { applyClientIdentify } from "./identifyClient.js";
import { canRelaySignaling, getEffectiveLanguage } from "./signalingRelay.js";

test("createClientSessionStore persists and clears listener language", () => {
  const store = createClientSessionStore();
  store.setListenerLanguage("client-a", "es");
  assert.equal(store.getListenerLanguage("client-a"), "es");
  store.clearListenerLanguage("client-a");
  assert.equal(store.getListenerLanguage("client-a"), null);
});

test("applyClientIdentify closes duplicate socket and restores language", () => {
  const store = createClientSessionStore();
  store.setListenerLanguage("listener-1", "es");

  const oldSocket = {
    id: "listener-1",
    readyState: 1,
    isBroadcaster: false,
    language: "es",
    close: () => {},
  };
  const newSocket = {
    id: "temp-uuid",
    readyState: 1,
    isBroadcaster: false,
    language: null,
  };

  let duplicateClosed = false;
  oldSocket.close = () => {
    duplicateClosed = true;
  };

  const result = applyClientIdentify({
    ws: newSocket,
    clientId: "listener-1",
    clients: [oldSocket, newSocket],
    sessionStore: store,
  });

  assert.equal(duplicateClosed, true);
  assert.equal(newSocket.id, "listener-1");
  assert.equal(newSocket.language, "es");
  assert.equal(result.replacedDuplicate, true);
  assert.equal(result.restoredLanguage, "es");
});

test("getEffectiveLanguage falls back to persisted session", () => {
  const store = createClientSessionStore();
  store.setListenerLanguage("listener-2", "en");

  const ws = { id: "listener-2", language: null, isBroadcaster: false };
  assert.equal(getEffectiveLanguage(ws, store), "en");
});

test("canRelaySignaling allows relay when session restores listener language", () => {
  const store = createClientSessionStore();
  store.setListenerLanguage("listener-3", "es");

  const listener = { id: "listener-3", language: null, isBroadcaster: false };
  const broadcaster = {
    id: "broadcaster-es",
    language: "es",
    isBroadcaster: true,
  };

  assert.equal(canRelaySignaling(listener, broadcaster, store), true);
});

test("canRelaySignaling rejects mismatched languages", () => {
  const store = createClientSessionStore();
  const listener = { id: "l1", language: "en", isBroadcaster: false };
  const broadcaster = {
    id: "broadcaster-es",
    language: "es",
    isBroadcaster: true,
  };

  assert.equal(canRelaySignaling(listener, broadcaster, store), false);
});
