/**
 * Debounces listener-count broadcasts to avoid O(n²) traffic when many clients
 * connect or change language during peak load (e.g. Sunday service).
 */

export function createDebouncedCallback(callback, delayMs) {
  let timer = null;
  return {
    schedule() {
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        callback();
      }, delayMs);
    },
    flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
        callback();
      }
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
