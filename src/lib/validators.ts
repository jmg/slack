import { z } from "zod";
import { MAX_FILES_PER_MESSAGE } from "@/lib/upload-limits";

// A tiny denylist of the most-guessed passwords. Not a substitute for a breach
// check (HIBP), but blocks the worst offenders (incl. the demo seed password).
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
]);

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(200)
    .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), {
      message: "That password is too common — choose a stronger one",
    }),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, "Workspace name is required").max(80),
});

export const createChannelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Channel name is required")
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes only"),
  description: z.string().trim().max(280).optional(),
  isPrivate: z.boolean().optional().default(false),
});

// A message may be text-only, files-only, or both — but not empty.
export const createMessageSchema = z
  .object({
    body: z.string().trim().max(4000),
    parentId: z.string().optional(),
    attachmentIds: z.array(z.string()).max(MAX_FILES_PER_MESSAGE).optional(),
  })
  .refine(
    (d) => d.body.length > 0 || (d.attachmentIds?.length ?? 0) > 0,
    { message: "Message cannot be empty" },
  );

export const updateMessageSchema = z.object({
  body: z.string().trim().min(1, "Message cannot be empty").max(4000),
});

export const searchSchema = z.object({
  q: z.string().trim().min(1).max(200),
});

export const reactionSchema = z.object({
  emoji: z.string().min(1).max(16),
});

// Accepts a single userId (1:1, kept for existing callers) or a list of userIds
// (group DM). At least one person is required.
export const createConversationSchema = z
  .object({
    userId: z.string().min(1).optional(),
    userIds: z.array(z.string().min(1)).max(8).optional(),
  })
  .refine((d) => !!d.userId || (d.userIds?.length ?? 0) > 0, {
    message: "Pick at least one person",
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
