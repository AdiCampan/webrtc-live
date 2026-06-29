import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clearListenerSession,
  handleRegisterListener,
  hasActiveBroadcaster,
  normalizeListenerPlatform,
  persistListenerLanguage,
} from "./registerListener.js";
import { createClientSessionStore } from "./clientSessions.js";

test("handleRegisterListener sets language and schedules count update", () => {
  const ws = { id: "listener-1", language: null };
  const store = createClientSessionStore();
  let scheduled = 0;

  const handled = handleRegisterListener(
    ws,
    { type: "register-listener", language: "es", platform: "android" },
    () => {
      scheduled += 1;
    },
    store
  );

  assert.equal(handled, true);
  assert.equal(ws.language, "es");
  assert.equal(ws.platform, "android");
  assert.equal(store.getListenerLanguage("listener-1"), "es");
  assert.equal(store.getListenerPlatform("listener-1"), "android");
  assert.equal(scheduled, 1);
});

test("handleRegisterListener ignores wrong type or missing language", () => {
  const ws = { language: "en" };
  let scheduled = 0;
  const schedule = () => {
    scheduled += 1;
  };

  assert.equal(handleRegisterListener(ws, { type: "ping" }, schedule), false);
  assert.equal(
    handleRegisterListener(ws, { type: "register-listener" }, schedule),
    false
  );
  assert.equal(ws.language, "en");
  assert.equal(scheduled, 0);
});

test("handleRegisterListener works without scheduleCountUpdate callback", () => {
  const ws = { language: null };

  assert.equal(
    handleRegisterListener(ws, { type: "register-listener", language: "ro" }),
    true
  );
  assert.equal(ws.language, "ro");
  assert.equal(ws.platform, "unknown");
});

test("persistListenerLanguage and clearListenerSession update session store", () => {
  const store = createClientSessionStore();
  const ws = { id: "listener-4", language: null };

  persistListenerLanguage(ws, "ro", store, "ios");
  assert.equal(ws.language, "ro");
  assert.equal(ws.platform, "ios");
  assert.equal(store.getListenerLanguage("listener-4"), "ro");
  assert.equal(store.getListenerPlatform("listener-4"), "ios");

  clearListenerSession(ws, store);
  assert.equal(ws.language, null);
  assert.equal(ws.platform, "unknown");
  assert.equal(store.getListenerLanguage("listener-4"), null);
});

test("normalizeListenerPlatform accepts supported values only", () => {
  assert.equal(normalizeListenerPlatform("web"), "web");
  assert.equal(normalizeListenerPlatform("android"), "android");
  assert.equal(normalizeListenerPlatform("ios"), "ios");
  assert.equal(normalizeListenerPlatform("desktop"), "unknown");
  assert.equal(normalizeListenerPlatform(null), "unknown");
});

test("hasActiveBroadcaster returns true when any language is live", () => {
  assert.equal(hasActiveBroadcaster({ es: false, en: false, ro: false }), false);
  assert.equal(hasActiveBroadcaster({ es: true, en: false, ro: false }), true);
  assert.equal(hasActiveBroadcaster({ es: false, en: true, ro: false }), true);
});
