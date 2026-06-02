/**
 * @param {number} code
 */
export function describeCloseCode(code) {
  /** @type {Record<number, string>} */
  const known = {
    1000: "normal_closure",
    1001: "going_away",
    1006: "abnormal_no_close_frame",
    4000: "replaced_by_new_registration",
    4001: "stale_connection",
    4002: "replaced_by_reconnect",
  };
  return known[code] ?? `ws_close_${code}`;
}
