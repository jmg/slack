import { z } from "zod";
import { normalizePhone } from "@/lib/wpp/phone";
import {
  MAX_GROUP_MEMBERS,
  MAX_POLL_OPTION,
  MAX_POLL_OPTIONS,
  MAX_POLL_QUESTION,
  MIN_POLL_OPTIONS,
  WPP_THEMES,
  WPP_WALLPAPERS,
  isDisappearingPreset,
} from "@/lib/wpp/config";
import { WPP_LOCALES } from "@/lib/wpp/i18n";
import { MAX_WPP_FILES_PER_MESSAGE } from "@/lib/wpp/upload-limits";

/**
 * Request schemas for `/api/wpp/**`.
 *
 * ## Error messages are dictionary keys, not sentences
 * The app is bilingual and the API has no idea which language the caller reads,
 * so every user-facing failure — from zod and from thrown `ApiError`s alike —
 * carries a `WppKey` (e.g. `"validate.phoneInvalid"`) as its message. The client
 * runs it back through `t()` (see `wppError()` in `lib/wpp/client.ts`) and falls
 * back to showing the raw string if it isn't a known key. That keeps the whole
 * surface translatable without inventing a second error envelope.
 */

// The handful of passwords that show up in every credential-stuffing list.
// Not a breach check, just a floor — same list as the Slack half.
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "letmein123",
  "iloveyou1",
  "admin1234",
  "whatsapp123",
]);

/** Free-typed phone input → canonical E.164, or a validation issue. */
const phoneField = z
  .string()
  .trim()
  .min(1, "validate.phoneRequired")
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "validate.phoneInvalid" });
      return z.NEVER;
    }
    return normalized;
  });

const passwordField = z
  .string()
  .min(10, "validate.passwordShort")
  .max(200, "validate.tooLong")
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), {
    message: "validate.passwordCommon",
  });

export const waRegisterSchema = z.object({
  name: z.string().trim().min(1, "validate.nameRequired").max(60),
  phone: phoneField,
  password: passwordField,
});

export const waLoginSchema = z.object({
  phone: phoneField,
  password: z.string().min(1, "validate.passwordRequired"),
});

export const waChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "validate.passwordRequired"),
  newPassword: passwordField,
});

export const waDeleteAccountSchema = z.object({
  phone: phoneField,
});

export const waProfileSchema = z.object({
  name: z.string().trim().min(1, "validate.nameRequired").max(60).optional(),
  about: z.string().trim().max(139).optional(),
  /** Pending upload id from /api/wpp/uploads, or null to clear the photo. */
  avatarAttachmentId: z.string().min(1).nullable().optional(),
});

const visibility = z.enum(["EVERYONE", "CONTACTS", "NOBODY"]);

export const waSettingsSchema = z.object({
  locale: z.enum(WPP_LOCALES).optional(),
  theme: z.enum(WPP_THEMES as [string, ...string[]]).optional(),
  wallpaper: z
    .enum(Object.keys(WPP_WALLPAPERS) as [string, ...string[]])
    .optional(),
  lastSeenPrivacy: visibility.optional(),
  avatarPrivacy: visibility.optional(),
  aboutPrivacy: visibility.optional(),
  readReceipts: z.boolean().optional(),
});

/** Start a 1:1 chat with one person, or create a group with several. */
export const waCreateChatSchema = z
  .object({
    userId: z.string().min(1).optional(),
    subject: z.string().trim().max(100).optional(),
    description: z.string().trim().max(512).optional(),
    memberIds: z.array(z.string().min(1)).max(MAX_GROUP_MEMBERS - 1).optional(),
    type: z.enum(["DIRECT", "GROUP"]).optional(),
  })
  .refine(
    (d) =>
      d.type === "GROUP"
        ? (d.subject?.length ?? 0) > 0
        : !!d.userId || (d.memberIds?.length ?? 0) > 0,
    { message: "validate.subjectRequired" },
  );

export const waSendMessageSchema = z
  .object({
    body: z.string().max(65536, "validate.messageTooLong").default(""),
    replyToId: z.string().min(1).optional(),
    attachmentIds: z
      .array(z.string().min(1))
      .max(MAX_WPP_FILES_PER_MESSAGE)
      .optional(),
  })
  .refine(
    (d) => d.body.trim().length > 0 || (d.attachmentIds?.length ?? 0) > 0,
    { message: "validate.messageEmpty" },
  );

export const waEditMessageSchema = z.object({
  body: z.string().trim().min(1, "validate.messageEmpty").max(65536),
});

export const waDeleteMessageSchema = z.object({
  scope: z.enum(["me", "everyone"]).default("me"),
});

export const waReactionSchema = z.object({
  /** Empty string removes the reaction — one per person, WhatsApp-style. */
  emoji: z.string().max(16),
});

export const waForwardSchema = z.object({
  chatIds: z.array(z.string().min(1)).min(1, "validate.pickChats").max(20),
});

export const waChatStateSchema = z.object({
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  /** ISO instant, or null to unmute. */
  mutedUntil: z.string().datetime().nullable().optional(),
  /** true → rewind the read cursor so the chat shows as unread again. */
  unread: z.boolean().optional(),
  /** "Clear messages": hide everything up to now, for me only. */
  clear: z.boolean().optional(),
  draft: z.string().max(65536).nullable().optional(),
});

export const waGroupUpdateSchema = z.object({
  subject: z.string().trim().min(1, "validate.subjectRequired").max(100).optional(),
  description: z.string().trim().max(512).nullable().optional(),
  iconAttachmentId: z.string().min(1).nullable().optional(),
  onlyAdminsCanSend: z.boolean().optional(),
  onlyAdminsCanEditInfo: z.boolean().optional(),
});

export const waAddMembersSchema = z.object({
  userIds: z
    .array(z.string().min(1))
    .min(1, "validate.pickParticipants")
    .max(MAX_GROUP_MEMBERS),
});

export const waMemberRoleSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]),
});

export const waContactSchema = z.object({
  phone: phoneField,
  alias: z.string().trim().max(60).optional(),
});

export const waBlockSchema = z.object({
  userId: z.string().min(1),
  blocked: z.boolean(),
});

export const waStatusSchema = z
  .object({
    body: z.string().trim().max(700).default(""),
    backgroundColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "validate.invalidInput")
      .optional(),
    attachmentId: z.string().min(1).optional(),
  })
  .refine((d) => d.body.length > 0 || !!d.attachmentId, {
    message: "validate.statusEmpty",
  });

export const waSearchSchema = z.object({
  q: z.string().trim().min(1, "validate.queryRequired").max(200),
  chatId: z.string().min(1).optional(),
});

/** A poll: a question and 2-12 non-empty options. */
export const waCreatePollSchema = z.object({
  question: z.string().trim().min(1, "validate.invalidInput").max(MAX_POLL_QUESTION),
  options: z
    .array(z.string().trim().min(1).max(MAX_POLL_OPTION))
    .min(MIN_POLL_OPTIONS, "poll.needTwoOptions")
    .max(MAX_POLL_OPTIONS),
  allowMultiple: z.boolean().optional().default(false),
});

/** Replaces the voter's whole selection; an empty array clears their vote. */
export const waPollVoteSchema = z.object({
  optionIds: z.array(z.string().min(1)).max(MAX_POLL_OPTIONS),
});

/** Null turns disappearing messages off; anything else must be a known preset. */
export const waDisappearingSchema = z.object({
  seconds: z
    .number()
    .int()
    .refine((v) => isDisappearingPreset(v), { message: "validate.invalidInput" })
    .nullable(),
});

export type WaRegisterInput = z.infer<typeof waRegisterSchema>;
export type WaLoginInput = z.infer<typeof waLoginSchema>;
