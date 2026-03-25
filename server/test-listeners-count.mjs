/**
 * Smoke test: two simultaneous listeners; expect listeners-count.es >= 2.
 * Run from repo root: node server/test-listeners-count.mjs
 */
import WebSocket from "ws";

const SIGNALING_URL = process.env.SIGNALING_URL ?? "wss://webrtc-live-ct59.onrender.com";
const LANG = "es";

async function main() {
  const lastCounts = await new Promise((resolve, reject) => {
    const ws1 = new WebSocket(SIGNALING_URL);
    const ws2 = new WebSocket(SIGNALING_URL);
    let best = { es: 0, en: 0, ro: 0 };
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws1.close();
        ws2.close();
        reject(new Error(`timeout: max listeners.${LANG} seen was ${best[LANG]}`));
      }
    }, 35000);

    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      ws1.close();
      ws2.close();
      resolve(best);
    }

    function onMessage(raw) {
      let data;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (data.type !== "listeners-count" || !data.listeners) return;
      const L = data.listeners;
      best = { es: L.es ?? 0, en: L.en ?? 0, ro: L.ro ?? 0 };
      if (best[LANG] >= 2) finish();
    }

    ws1.on("message", onMessage);
    ws2.on("message", onMessage);

    ws1.on("open", () => {
      ws1.send(JSON.stringify({ type: "identify", clientId: `t1-${Date.now()}` }));
      ws1.send(JSON.stringify({ type: "request-offer", language: LANG }));
    });
    ws2.on("open", () => {
      ws2.send(JSON.stringify({ type: "identify", clientId: `t2-${Date.now()}` }));
      ws2.send(JSON.stringify({ type: "request-offer", language: LANG }));
    });

    ws1.on("error", (e) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        ws2.close();
        reject(e);
      }
    });
    ws2.on("error", (e) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        ws1.close();
        reject(e);
      }
    });
  });

  console.log(JSON.stringify({ SIGNALING_URL, LANG, listeners: lastCounts }, null, 2));
  const n = lastCounts[LANG] ?? 0;
  if (n >= 2) {
    console.log("PASS: listener count for", LANG, "is", n);
    process.exit(0);
  }
  console.error("FAIL: expected", LANG, ">= 2, got", n);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
