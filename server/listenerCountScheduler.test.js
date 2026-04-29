import assert from "node:assert";
import { test } from "node:test";

import { createDebouncedCallback } from "./listenerCountScheduler.js";

test("debounces multiple schedule calls into one callback after delay", async () => {
  let calls = 0;
  const debounced = createDebouncedCallback(() => {
    calls += 1;
  }, 40);

  debounced.schedule();
  debounced.schedule();
  debounced.schedule();

  assert.strictEqual(calls, 0);

  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.strictEqual(calls, 1);
});

test("flush runs callback immediately and clears pending timer", async () => {
  let calls = 0;
  const debounced = createDebouncedCallback(() => {
    calls += 1;
  }, 500);

  debounced.schedule();
  debounced.flush();
  assert.strictEqual(calls, 1);

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.strictEqual(calls, 1);
});
