import {
  SERVER_SHUTDOWN_DEFAULT_RETRY_MS,
  buildBroadcasterReregisterPayload,
  computeWsReconnectDelayMs,
  isServerShutdownMessage,
  parseServerShutdownRetryMs,
  resolveStreamRecoveryAction,
  shouldRequestOfferOnBroadcastActive,
  shouldReregisterBroadcasterOnOpen,
} from "./signalingReconnect";

describe("signalingReconnect", () => {
  describe("parseServerShutdownRetryMs", () => {
    it("uses server-provided delay when valid", () => {
      expect(parseServerShutdownRetryMs(5000)).toBe(5000);
    });

    it("falls back to default for invalid values", () => {
      expect(parseServerShutdownRetryMs(undefined)).toBe(
        SERVER_SHUTDOWN_DEFAULT_RETRY_MS
      );
      expect(parseServerShutdownRetryMs(-1)).toBe(
        SERVER_SHUTDOWN_DEFAULT_RETRY_MS
      );
    });
  });

  describe("isServerShutdownMessage", () => {
    it("detects server-shutdown messages", () => {
      expect(
        isServerShutdownMessage({ type: "server-shutdown", retryAfterMs: 3000 })
      ).toBe(true);
      expect(isServerShutdownMessage({ type: "ping" })).toBe(false);
      expect(isServerShutdownMessage(null)).toBe(false);
    });
  });

  describe("buildBroadcasterReregisterPayload", () => {
    it("builds broadcaster registration payload", () => {
      expect(buildBroadcasterReregisterPayload("es", "token-abc")).toEqual({
        type: "broadcaster",
        language: "es",
        token: "token-abc",
      });
    });
  });

  describe("shouldReregisterBroadcasterOnOpen", () => {
    it("returns true only when broadcaster session can resume", () => {
      expect(
        shouldReregisterBroadcasterOnOpen({
          role: "broadcaster",
          token: "t",
          wasBroadcasting: true,
          language: "en",
        })
      ).toBe(true);
      expect(
        shouldReregisterBroadcasterOnOpen({
          role: "listener",
          token: "t",
          wasBroadcasting: true,
          language: "en",
        })
      ).toBe(false);
    });
  });

  describe("resolveStreamRecoveryAction", () => {
    it("requests offer when listening without a healthy stream", () => {
      expect(
        resolveStreamRecoveryAction(true, true, false, undefined)
      ).toBe("request-offer");
    });

    it("registers listener when stream is healthy", () => {
      expect(
        resolveStreamRecoveryAction(true, true, true, "connected")
      ).toBe("register-listener");
    });
  });

  describe("shouldRequestOfferOnBroadcastActive", () => {
    it("returns true when broadcast resumes without stream", () => {
      expect(
        shouldRequestOfferOnBroadcastActive(
          "es",
          { es: true, en: false, ro: false },
          false,
          undefined
        )
      ).toBe(true);
    });
  });

  describe("computeWsReconnectDelayMs", () => {
    it("uses exponential backoff capped at 30s", () => {
      expect(computeWsReconnectDelayMs(1)).toBe(1000);
      expect(computeWsReconnectDelayMs(10)).toBe(30000);
    });
  });
});
