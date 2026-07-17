import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters").max(200),
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

export const createMessageSchema = z.object({
  body: z.string().trim().min(1, "Message cannot be empty").max(4000),
  parentId: z.string().optional(),
});

export const updateMessageSchema = z.object({
  body: z.string().trim().min(1, "Message cannot be empty").max(4000),
});

export const searchSchema = z.object({
  q: z.string().trim().min(1).max(200),
});

export const reactionSchema = z.object({
  emoji: z.string().min(1).max(16),
});

export const createConversationSchema = z.object({
  userId: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
