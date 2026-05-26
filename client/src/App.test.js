import {
  isServerShutdownMessage,
  parseServerShutdownRetryMs,
} from "./signalingReconnect";

test("parses server shutdown retry delay", () => {
  expect(parseServerShutdownRetryMs(3000)).toBe(3000);
  expect(parseServerShutdownRetryMs()).toBe(3000);
});

test("recognizes server shutdown websocket messages", () => {
  expect(
    isServerShutdownMessage({ type: "server-shutdown", retryAfterMs: 3000 })
  ).toBe(true);
});
