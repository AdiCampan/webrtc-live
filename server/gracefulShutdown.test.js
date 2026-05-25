import assert from "node:assert/strict";
import test from "node:test";

import {
  buildServerShutdownMessage,
  SERVER_SHUTDOWN_RETRY_MS,
} from "./gracefulShutdown.js";

test("buildServerShutdownMessage uses default retry delay", () => {
  const parsed = JSON.parse(buildServerShutdownMessage());
  assert.equal(parsed.type, "server-shutdown");
  assert.equal(parsed.retryAfterMs, SERVER_SHUTDOWN_RETRY_MS);
});

test("buildServerShutdownMessage accepts custom retry delay", () => {
  const parsed = JSON.parse(buildServerShutdownMessage(5000));
  assert.equal(parsed.retryAfterMs, 5000);
});
