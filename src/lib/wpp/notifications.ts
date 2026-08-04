"use client";

/**
 * Desktop notifications and the incoming-message tone.
 *
 * Both are deliberately best-effort and silent about failure: a browser that
 * blocks notifications, an OS that mutes the tab, or a user who never granted
 * permission must never surface an error — the message still arrived, which is
 * the part that matters.
 */

export type NotificationPermissionState = "default" | "granted" | "denied" | "unsupported";

export function notificationPermission(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

/**
 * Whether to offer the "turn on notifications" prompt, as an external store.
 *
 * `Notification.permission` and `localStorage` are browser-only and change
 * outside React, which is exactly what `useSyncExternalStore` exists for — the
 * alternative (read them in an effect and `setState`) renders one frame with the
 * wrong answer and trips the React Compiler's set-state-in-effect rule.
 */
const PROMPT_DISMISSED_KEY = "wpp:notify-prompt-dismissed";
const promptListeners = new Set<() => void>();

export function subscribeNotificationPrompt(listener: () => void): () => void {
  promptListeners.add(listener);
  return () => promptListeners.delete(listener);
}

export function shouldOfferNotifications(): boolean {
  if (notificationPermission() !== "default") return false;
  try {
    return window.localStorage.getItem(PROMPT_DISMISSED_KEY) !== "1";
  } catch {
    // Private mode or blocked storage — offering once per session is fine.
    return true;
  }
}

/** Server render: never offer, because we can't know the answer yet. */
export function shouldOfferNotificationsOnServer(): boolean {
  return false;
}

export function dismissNotificationPrompt(): void {
  try {
    window.localStorage.setItem(PROMPT_DISMISSED_KEY, "1");
  } catch {
    // Nothing to do — the prompt just reappears next session.
  }
  for (const listener of promptListeners) listener();
}

/**
 * Ask for permission. Must be called from a user gesture — browsers ignore (and
 * Chrome permanently denies) requests that aren't, which is why this is never
 * fired automatically on mount.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (notificationPermission() === "unsupported") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  } finally {
    // Granted or denied, the prompt has served its purpose.
    for (const listener of promptListeners) listener();
  }
}

/**
 * Show a notification for an incoming message.
 *
 * `tag` is the chat id so a burst of messages in one chat collapses into a
 * single notification instead of stacking — the behaviour every messenger has
 * and the reason `tag` exists.
 */
export function notifyIncoming(input: {
  title: string;
  body: string;
  tag: string;
  icon?: string | null;
  onClick?: () => void;
}): void {
  if (notificationPermission() !== "granted") return;
  if (document.visibilityState === "visible") return; // you're already looking

  try {
    const notification = new Notification(input.title, {
      body: input.body,
      tag: input.tag,
      icon: input.icon ?? undefined,
      // Replacing a same-tag notification shouldn't re-alert.
      renotify: false,
      silent: true, // the tone below is ours; don't double up
    } as NotificationOptions);

    notification.onclick = () => {
      window.focus();
      input.onClick?.();
      notification.close();
    };
  } catch {
    // Some platforms throw when the Notification constructor is unavailable
    // outside a service worker (Android Chrome). Nothing to recover from.
  }
}

/**
 * The incoming "blip".
 *
 * Synthesised with two short oscillator tones rather than shipped as an audio
 * file: it needs no asset, no preload and no decode, and it can't be blocked by
 * an ad blocker eating a media request. The AudioContext is created lazily
 * because constructing one before a user gesture leaves it suspended.
 */
let toneContext: AudioContext | null = null;

export function playIncomingTone(): void {
  try {
    type WindowWithLegacyAudio = Window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor =
      window.AudioContext ?? (window as WindowWithLegacyAudio).webkitAudioContext;
    if (!Ctor) return;

    toneContext ??= new Ctor();
    const ctx = toneContext;
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    // A rising two-note blip: short, quiet, and distinct from a system beep.
    for (const [index, frequency] of [880, 1174.7].entries()) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;

      const start = now + index * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.06, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);

      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.14);
    }
  } catch {
    // Autoplay policy, no audio device, whatever — the message still arrived.
  }
}
