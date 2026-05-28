import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildStopConnectionPayload,
  isSignalingTargetOnline,
  resolveBroadcasterSocket,
  shouldBufferSignalingForTarget,
  shouldNotifyBroadcasterOnListenerClose,
} from "./signalingTarget.js";

const WS_OPEN = 1;

test("isSignalingTargetOnline returns true only for open matching client", () => {
  const clients = [
    { id: "listener-1", readyState: WS_OPEN },
    { id: "listener-2", readyState: 3 },
  ];
  assert.equal(isSignalingTargetOnline(clients, "listener-1"), true);
  assert.equal(isSignalingTargetOnline(clients, "listener-2"), false);
  assert.equal(isSignalingTargetOnline(clients, "missing"), false);
});

test("shouldBufferSignalingForTarget is false when target is fully gone", () => {
  const clients = [{ id: "listener-1", readyState: WS_OPEN }];
  assert.equal(shouldBufferSignalingForTarget(clients, "ghost-id"), false);
  assert.equal(shouldBufferSignalingForTarget(clients, "listener-1"), false);
});

test("shouldBufferSignalingForTarget is true when target exists but is not open", () => {
  const clients = [{ id: "listener-1", readyState: 2 }];
  assert.equal(shouldBufferSignalingForTarget(clients, "listener-1"), true);
});

test("resolveBroadcasterSocket prefers the sender when it is open", () => {
  const sender = { readyState: WS_OPEN };
  const broadcasters = { es: { readyState: WS_OPEN } };
  assert.equal(
    resolveBroadcasterSocket(broadcasters, "es", sender),
    sender
  );
});

test("buildStopConnectionPayload targets listener id", () => {
  assert.deepEqual(buildStopConnectionPayload("listener-9"), {
    type: "stop-connection",
    target: "listener-9",
  });
});

test("shouldNotifyBroadcasterOnListenerClose only for stale cleanup", () => {
  assert.equal(shouldNotifyBroadcasterOnListenerClose(4001), true);
  assert.equal(shouldNotifyBroadcasterOnListenerClose(4002), false);
  assert.equal(shouldNotifyBroadcasterOnListenerClose(1000), false);
});
