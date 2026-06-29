import assert from "node:assert/strict";
import { test } from "node:test";

import { createClientSessionStore } from "./clientSessions.js";
import { applyClientIdentify } from "./identifyClient.js";
import { canRelaySignaling, getEffectiveLanguage } from "./signalingRelay.js";

test("createClientSessionStore persists and clears listener language", () => {
  const store = createClientSessionStore();
  store.setListenerLanguage("client-a", "es", "web");
  assert.equal(store.getListenerLanguage("client-a"), "es");
  assert.equal(store.getListenerPlatform("client-a"), "web");
  assert.equal(store.getListenerSession("client-a")?.language, "es");
  assert.equal(store.getListenerSession("client-a")?.platform, "web");
  store.clearListenerLanguage("client-a");
  assert.equal(store.getListenerLanguage("client-a"), null);
  assert.equal(store.getListenerPlatform("client-a"), null);
  assert.equal(store.getListenerSession("client-a"), null);
});

test("createClientSessionStore touch and purge expired sessions", () => {
  const store = createClientSessionStore();
  store.setListenerLanguage("client-b", "en");
  const before = Date.now();
  store.touchListener("client-b");
  let lastSeen = 0;
  store.forEachActiveListenerSession((id, session) => {
    if (id === "client-b") {
      lastSeen = session.lastSeenAt;
    }
  });
  assert.ok(lastSeen >= before);
  store.purgeExpiredSessions(-1);
  assert.equal(store.getListenerLanguage("client-b"), null);
});

test("getListenerSession returns a copy of the stored session", () => {
  const store = createClientSessionStore();
  store.setListenerLanguage("client-copy", "es", "android");

  const session = store.getListenerSession("client-copy");
  session.language = "ro";
  session.platform = "ios";
  session.lastSeenAt = 0;

  assert.equal(store.getListenerLanguage("client-copy"), "es");
  assert.equal(store.getListenerPlatform("client-copy"), "android");
  assert.notEqual(store.getListenerSession("client-copy")?.lastSeenAt, 0);
});

test("applyClientIdentify closes duplicate socket and restores language", () => {
  const store = createClientSessionStore();
  store.setListenerLanguage("listener-1", "es", "ios");

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
  assert.equal(newSocket.platform, "ios");
  assert.equal(result.replacedDuplicate, true);
  assert.equal(result.restoredLanguage, "es");
});

test("applyClientIdentify keeps current platform before restored session platform", () => {
  const store = createClientSessionStore();
  store.setListenerLanguage("listener-web", "es", "android");
  const newSocket = {
    id: "temp-uuid",
    readyState: 1,
    isBroadcaster: false,
    language: null,
    platform: "web",
  };

  applyClientIdentify({
    ws: newSocket,
    clientId: "listener-web",
    clients: [newSocket],
    sessionStore: store,
  });

  assert.equal(newSocket.platform, "web");
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
