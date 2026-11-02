import { z } from "zod";

export const announcementBody = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(120),
    body: z.string().trim().max(1000).optional().default(""),
    level: z.enum(["info", "warning", "critical"]),
    active: z.boolean(),
    endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .refine((b) => !b.endsAt || new Date(b.endsAt).getTime() > Date.now(), {
    message: "The end time must be in the future",
    path: ["endsAt"],
  });

export type AnnouncementBody = z.infer<typeof announcementBody>;
