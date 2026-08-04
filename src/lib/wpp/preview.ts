import {
  DISAPPEARING_PRESETS,
  isDisappearingPreset,
  type DisappearingSeconds,
} from "@/lib/wpp/config";
import type { Translate, WppKey } from "@/lib/wpp/i18n";
import {
  SYSTEM_MESSAGE_KEYS,
  type WaChatPreview,
  type WaMessage,
  type WaMessageKindName,
  type WaSystemPayload,
} from "@/lib/wpp/types";

/**
 * Turning a stored message into the sentence a human reads.
 *
 * Kept out of the components because three different screens render the same
 * text — the chat-list row, the search results and the forward picker — and they
 * must not drift apart.
 */

const DISAPPEARING_LABELS: Record<DisappearingSeconds, WppKey> = {
  86_400: "disappearing.day",
  604_800: "disappearing.week",
  7_776_000: "disappearing.quarter",
};

/** "Off" first, then the durations, shortest to longest. */
export const DISAPPEARING_OPTIONS: (DisappearingSeconds | null)[] = [
  null,
  ...DISAPPEARING_PRESETS,
];

/**
 * Dictionary key naming a timer value.
 *
 * Lives here rather than in the picker because three places need it: the picker,
 * the chat header, and the "turned on disappearing messages" system line — which
 * stores the raw seconds and has to render them as a duration.
 */
export function disappearingLabelKey(seconds: number | null): WppKey {
  // Anything outside the presets can only come from a hand-edited row — the
  // validator refuses it on the way in — so there is no honest label for it.
  if (seconds == null || !isDisappearingPreset(seconds)) return "disappearing.off";
  return DISAPPEARING_LABELS[seconds];
}

/** Join names the way each language does: "A, B and C" / "A, B y C". */
export function joinNames(names: string[], t: Translate): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} ${t("common.and")} ${names[names.length - 1]}`;
}

/**
 * Render a group event in the viewer's language.
 *
 * The row stores an action plus ids, never a sentence, which is what lets the
 * same event read as "Ada added Grace" for one participant and "Añadiste a
 * Grace" for Ada herself — the viewer sees "You" wherever they appear.
 */
export function systemMessageText(
  system: WaSystemPayload,
  meId: string,
  t: Translate,
): string {
  const nameFor = (id: string | null, fallback: string) =>
    id && id === meId ? t("common.you") : fallback;

  return t(SYSTEM_MESSAGE_KEYS[system.action] ?? "system.settingsChanged", {
    actor: nameFor(system.actorId, system.actor),
    targets: joinNames(
      system.targets.map((name, i) => nameFor(system.targetIds[i] ?? null, name)),
      t,
    ),
    value: system.value ?? "",
    // "…will disappear after {duration}" stores raw seconds in `value`, so the
    // sentence needs the human duration too — without this the placeholder
    // ships to the user verbatim.
    duration: t(disappearingLabelKey(Number(system.value))),
  });
}

/** Dictionary key for the "📷 Photo" style label of a media message. */
export function attachmentLabelKey(kind: WaMessageKindName) {
  switch (kind) {
    case "IMAGE":
      return "chats.attachmentPhoto" as const;
    case "VIDEO":
      return "chats.attachmentVideo" as const;
    case "VOICE":
      return "chats.attachmentVoice" as const;
    case "AUDIO":
      return "chats.attachmentAudio" as const;
    case "DOCUMENT":
      return "chats.attachmentDocument" as const;
    default:
      return null;
  }
}

export type PreviewParts = {
  /** "You:" / "Ada:" — only ever set for group chats, as in WhatsApp. */
  prefix: string | null;
  /** "Photo", "Voice message", … when the message carries media. */
  mediaLabel: string | null;
  /** The body, or the caption on a media message. */
  text: string;
  /** Ticks are drawn only next to your own last message. */
  showTick: boolean;
};

/**
 * The single line under a chat name.
 *
 * WhatsApp shows the sender prefix only in groups — in a 1:1 the tick already
 * says the last message was yours, so a "You:" would be redundant.
 */
export function chatPreviewParts(
  message: WaChatPreview | WaMessage | null,
  opts: { t: Translate; meId: string; isGroup: boolean },
): PreviewParts | null {
  if (!message) return null;
  const { t, meId, isGroup } = opts;

  if (message.system) {
    return {
      prefix: null,
      mediaLabel: null,
      text: systemMessageText(message.system, meId, t),
      showTick: false,
    };
  }

  if (message.deleted) {
    return {
      prefix: isGroup ? previewPrefix(message, t, meId) : null,
      mediaLabel: null,
      text: t("chats.messageDeleted"),
      showTick: false,
    };
  }

  const labelKey = attachmentLabelKey(message.kind);
  return {
    prefix: isGroup ? previewPrefix(message, t, meId) : null,
    mediaLabel: labelKey ? t(labelKey) : null,
    text: message.body,
    showTick: message.mine,
  };
}

/**
 * The two preview shapes name their sender differently — a chat-list row is
 * flattened (`senderName`) while a full message carries the person object — so
 * this narrows on the field rather than on a discriminator neither type has.
 */
function previewPrefix(
  message: WaChatPreview | WaMessage,
  t: Translate,
  meId: string,
): string | null {
  if (message.mine) return t("chats.you");
  const sender =
    "senderName" in message
      ? { id: message.senderId, name: message.senderName }
      : { id: message.sender?.id ?? null, name: message.sender?.name ?? "" };
  if (!sender.name) return null;
  return sender.id === meId ? t("chats.you") : `${sender.name}:`;
}

/** Flatten a preview to one string — for `title` attributes and search rows. */
export function previewToString(parts: PreviewParts | null): string {
  if (!parts) return "";
  return [parts.prefix, parts.mediaLabel, parts.text]
    .filter(Boolean)
    .join(" ")
    .trim();
}
