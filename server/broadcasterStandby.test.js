import assert from "node:assert";
import { test } from "node:test";

import {
  findStandbyBroadcaster,
  parseStaleAfterMs,
} from "./broadcasterStandby.js";

const OPEN = 1;

test("findStandbyBroadcaster returns null when no standby exists", () => {
  const clients = [
    {
      id: "a",
      readyState: OPEN,
      isBroadcaster: true,
      language: "es",
      broadcasterRegisteredAt: 100,
    },
  ];
  assert.strictEqual(findStandbyBroadcaster(clients, "es", "a"), null);
});

test("findStandbyBroadcaster prefers the most recently registered standby", () => {
  const older = {
    id: "old-tab",
    readyState: OPEN,
    isBroadcaster: true,
    language: "es",
    broadcasterRegisteredAt: 100,
  };
  const newer = {
    id: "new-tab",
    readyState: OPEN,
    isBroadcaster: true,
    language: "es",
    broadcasterRegisteredAt: 500,
  };
  const closing = { id: "current", readyState: OPEN, isBroadcaster: true, language: "es" };
  const picked = findStandbyBroadcaster(
    [older, newer, closing],
    "es",
    "current"
  );
  assert.strictEqual(picked, newer);
});

test("findStandbyBroadcaster ignores wrong language and non-broadcasters", () => {
  const standbyEn = {
    id: "en-b",
    readyState: OPEN,
    isBroadcaster: true,
    language: "en",
    broadcasterRegisteredAt: 999,
  };
  const listener = {
    id: "listener",
    readyState: OPEN,
    isBroadcaster: false,
    language: "es",
  };
  const closing = {
    id: "cur",
    readyState: OPEN,
    isBroadcaster: true,
    language: "es",
    broadcasterRegisteredAt: 1,
  };
  assert.strictEqual(
    findStandbyBroadcaster([standbyEn, listener, closing], "es", "cur"),
    null
  );
});

test("parseStaleAfterMs clamps and falls back", () => {
  assert.strictEqual(parseStaleAfterMs(undefined, 90000), 90000);
  assert.strictEqual(parseStaleAfterMs("120000", 90000), 120000);
  assert.strictEqual(parseStaleAfterMs("10000", 90000), 30000);
  assert.strictEqual(parseStaleAfterMs("999999", 90000), 600000);
  assert.strictEqual(parseStaleAfterMs("not-a-number", 90000), 90000);
});
