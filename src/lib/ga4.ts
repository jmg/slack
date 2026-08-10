type GoogleTag = (
  command: "event",
  eventName: string,
  params: Record<string, unknown>,
) => void;

type GoogleTagWindow = Window & { gtag?: GoogleTag };

const RETRY_MS = 100;
const MAX_WAIT_MS = 30_000;

/** Send the recommended GA4 sign_up event once the Google tag is configured. */
export function reportGaSignUpWhenReady(
  method: string,
  onSent?: () => void,
): () => void {
  let stopped = false;
  let timer: number | undefined;
  const deadline = Date.now() + MAX_WAIT_MS;

  const attempt = () => {
    if (stopped) return;
    const gtag = (window as GoogleTagWindow).gtag;
    if (typeof gtag === "function") {
      stopped = true;
      gtag("event", "sign_up", { method });
      onSent?.();
      return;
    }
    if (Date.now() < deadline) timer = window.setTimeout(attempt, RETRY_MS);
  };

  attempt();
  return () => {
    stopped = true;
    if (timer !== undefined) window.clearTimeout(timer);
  };
}
