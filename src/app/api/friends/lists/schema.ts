import { z } from "zod";
import { ApiError, fromDbError } from "@/lib/api/errors";
import { uuid } from "@/lib/validation";

export const friendListSchema = z.object({
  name: z.string().trim().min(1, "Give the list a name").max(40, "At most 40 characters"),
  memberIds: z.array(uuid).max(500).default([]),
});

/** Maps save_friend_list failures to friendly errors. */
export function listError(error: { code?: string; message?: string }): ApiError {
  if (error.code === "23505") return new ApiError(409, "list_name_taken", "You already have a list with that name.");
  if (error.message === "too_many_lists") return new ApiError(429, "too_many_lists", "You can have up to 50 friend lists.");
  if (error.message === "list_not_found") return new ApiError(404, "list_not_found", "That list no longer exists.");
  if (error.message === "too_many_members") return new ApiError(400, "too_many_members", "A list can have up to 500 friends.");
  return fromDbError(error);
}
