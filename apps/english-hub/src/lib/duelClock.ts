// The duel timer on a learner's device follows the server's clock: the
// server decides when time is up, the screen only counts down to it.

/** Milliseconds between this device's clock and the server's (server - device). */
export const clockOffset = (serverNow: string, receivedAt = Date.now()): number => {
  const server = Date.parse(serverNow);
  return Number.isFinite(server) ? server - receivedAt : 0;
};

/** Whole seconds left until `deadline` by the server's clock. */
export const secondsLeftOn = (deadline: string | null, offsetMs: number, deviceNow = Date.now()): number => {
  const end = deadline ? Date.parse(deadline) : Number.NaN;
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - (deviceNow + offsetMs)) / 1000));
};
