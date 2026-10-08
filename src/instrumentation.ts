// Server-side error tracking → jentry. instrumentation-client.ts only covers
// the browser, so errors thrown in route handlers, server components, server
// actions and the proxy never reached jentry. Same project as the browser.
import type { Instrumentation } from "next";
import { JENTRY_DSN, JENTRY_ENABLED } from "@/lib/jentry";

type Sdk = typeof import("@jentry/sdk");
let sdk: Promise<Sdk | null> | null = null;

function loadSdk(): Promise<Sdk | null> {
  if (!sdk) {
    sdk =
      JENTRY_ENABLED && process.env.NEXT_RUNTIME === "nodejs"
        ? import("@jentry/sdk")
            .then((m) => {
              m.init({ dsn: JENTRY_DSN, environment: process.env.NODE_ENV ?? "production" });
              return m;
            })
            .catch(() => null)
        : Promise.resolve(null);
  }
  return sdk;
}

export async function register() {
  await loadSdk();
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const m = await loadSdk();
  if (!m) return;
  m.setTag("route", context.routePath);
  m.setTag("route_type", context.routeType);
  m.setTag("method", request.method);
  m.captureException(err);
  await m.flush(2000);
};
