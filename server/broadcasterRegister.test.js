import test from "node:test";
import assert from "node:assert/strict";
import { isDuplicateBroadcasterRegistration } from "./broadcasterRegister.js";

test("isDuplicateBroadcasterRegistration detects same socket already registered", () => {
  const ws = { isBroadcaster: true, language: "es" };
  const broadcasters = { es: ws, en: null, ro: null };

  assert.equal(isDuplicateBroadcasterRegistration(broadcasters, "es", ws), true);
});

test("isDuplicateBroadcasterRegistration returns false for a new socket", () => {
  const prev = { isBroadcaster: true, language: "es" };
  const next = { isBroadcaster: false, language: null };
  const broadcasters = { es: prev, en: null, ro: null };

  assert.equal(isDuplicateBroadcasterRegistration(broadcasters, "es", next), false);
});

test("isDuplicateBroadcasterRegistration returns false when language differs on socket", () => {
  const ws = { isBroadcaster: true, language: "en" };
  const broadcasters = { es: ws, en: null, ro: null };

  assert.equal(isDuplicateBroadcasterRegistration(broadcasters, "es", ws), false);
});
