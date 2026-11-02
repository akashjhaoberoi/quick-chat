import { z } from "zod";

/** Validation schemas shared by forms (client) and route handlers (server). */

export const uuid = z.string().uuid();

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "At least 3 characters")
  .max(20, "At most 20 characters")
  .regex(/^[a-z0-9_.]+$/, "Only letters, numbers, underscores and dots")
  .refine((v) => !/^\.|\.$|\.\./.test(v), "Dots can't be at the start, end, or repeated");

export const passwordSchema = z
  .string()
  .min(10, "At least 10 characters")
  .max(128, "At most 128 characters")
  .refine((v) => /[a-z]/i.test(v) && /\d/.test(v), "Use letters and at least one number");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

export const displayNameSchema = z.string().trim().min(1, "Required").max(50, "At most 50 characters");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  acceptTerms: z.literal(true, { message: "You must accept the terms" }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Required"),
  remember: z.boolean().default(true),
});

export const profileUpdateSchema = z.object({
  displayName: displayNameSchema.optional(),
  bio: z.string().max(300).optional(),
  avatarMediaId: uuid.nullable().optional(),
  coverMediaId: uuid.nullable().optional(),
  isPrivate: z.boolean().optional(),
});

export const messageTypeSchema = z.enum([
  "text", "image", "video", "voice", "gif", "sticker", "document", "location", "contact", "link", "story_reply",
]);

export const sendMessageSchema = z.object({
  type: messageTypeSchema,
  body: z.string().max(4000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  replyTo: uuid.optional(),
  clientId: z.string().min(1).max(64).optional(),
  mediaIds: z.array(uuid).max(10).optional(),
});

export const reportSchema = z.object({
  targetType: z.enum(["user", "message", "story", "post", "comment", "group"]),
  targetId: uuid,
  reason: z.enum(["spam", "harassment", "hate", "nudity", "violence", "self_harm", "scam", "impersonation", "underage", "other"]),
  details: z.string().max(1000).optional(),
});

export const overlaySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string().max(200),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    size: z.number().min(0.01).max(0.3),
    rotation: z.number().min(-360).max(360).optional(),
    font: z.string().max(20).optional(),
  }),
  z.object({
    type: z.literal("emoji"),
    emoji: z.string().max(16),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    size: z.number().min(0.01).max(0.6),
    rotation: z.number().min(-360).max(360).optional(),
  }),
]);

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.string().datetime({ offset: true }).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
