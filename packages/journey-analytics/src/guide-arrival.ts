/** Destination-render telemetry only: this does not claim login, entitlement or learning activation. */
export function observeGuideArrival(
  endpoint: string,
  anonKey: string,
): () => void {
  if (typeof document === "undefined") return () => {};
  const url = new URL(window.location.href);
  const receipt = url.searchParams.get("schood_guide");
  if (!receipt || !/^[0-9a-f-]{72}$/.test(receipt)) return () => {};
  const path = url.pathname;
  url.searchParams.delete("schood_guide");
  // The receipt is single-use, lasts 15 minutes, and has no session-reading authority.
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  let frame = 0;
  const observer = new MutationObserver(ready);
  function ready() {
    if (stopped || !document.getElementById("root")?.childElementCount) return;
    observer.disconnect();
    frame = requestAnimationFrame(() => {
      if (stopped || window.location.pathname !== path) return;
      stopped = true;
      clearTimeout(timer);
      void fetch(`${endpoint}/guide/arrival`, {
        method: "POST",
        keepalive: true,
        headers: { apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ receipt, path }),
      }).catch(() => {/* Measurement must never block the destination. */});
    });
  }
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  timer = setTimeout(() => {
    stopped = true;
    observer.disconnect();
  }, 15000);
  ready();
  return () => {
    stopped = true;
    observer.disconnect();
    clearTimeout(timer);
    cancelAnimationFrame(frame);
  };
}
