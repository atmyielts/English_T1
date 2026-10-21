export function waitEvent(
  target: EventTarget,
  event: string,
  signal: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
        clean();
        resolve();
      },
      error = () => {
        clean();
        reject(
          new Error("The recording decoder could not process this media."),
        );
      },
      abort = () => {
        clean();
        reject(new Error("Playback stopped."));
      },
      timer = setTimeout(error, 20000);
    function clean() {
      clearTimeout(timer);
      target.removeEventListener(event, done);
      target.removeEventListener("error", error);
      signal.removeEventListener("abort", abort);
    }
    target.addEventListener(event, done, { once: true });
    target.addEventListener("error", error, { once: true });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
export function waitTime(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(done, 300);
    function done() {
      signal.removeEventListener("abort", abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new Error("Playback stopped."));
    }
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
export const buffered = (video: HTMLMediaElement, time: number) => {
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= time && video.buffered.end(i) >= time) {
      return true;
    }
  }
  return false;
};
