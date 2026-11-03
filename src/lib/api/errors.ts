/**
 * API error model shared by route handlers and the browser client.
 * Database RPCs raise `exception '<code>' using errcode = '<sqlstate>'`;
 * the SQLSTATE decides the HTTP status and the message becomes the code.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    public readonly details?: unknown,
  ) {
    super(message ?? code);
    this.name = "ApiError";
  }
}

const SQLSTATE_STATUS: Record<string, number> = {
  P0002: 404, // no_data_found  -> *_not_found
  "42501": 403, // insufficient_privilege
  "54000": 429, // program_limit_exceeded -> rate_limited
  "22023": 400, // invalid_parameter_value
  "23505": 409, // unique_violation
  "28000": 401, // invalid_authorization_specification
  "22P02": 400, // invalid_text_representation (bad uuid)
  "23503": 404, // foreign_key_violation (referenced row missing)
  "23514": 400, // check_violation
};

/** Friendly copy for codes raised by the database. */
const MESSAGES: Record<string, string> = {
  not_authenticated: "Please sign in to continue.",
  account_inactive: "Your account is not active.",
  rate_limited: "You're doing that too often. Please slow down.",
  user_not_found: "That user could not be found.",
  cannot_add_self: "You can't add yourself.",
  cannot_block_self: "You can't block yourself.",
  cannot_follow_self: "You can't follow yourself.",
  not_friends: "You're not friends with this user.",
  list_not_found: "That friend list no longer exists.",
  requests_disabled: "This user isn't accepting friend requests.",
  request_not_found: "That request no longer exists.",
  cannot_message_user: "You can't message this user.",
  conversation_not_found: "Conversation not found.",
  message_not_found: "Message not found.",
  cannot_edit_message: "Messages can only be edited by the sender within 15 minutes.",
  cannot_delete_message: "You can't delete this message for everyone.",
  only_admins_can_send: "Only group admins can send messages here.",
  admins_only: "Only group admins can do that.",
  members_must_be_friends: "You can only add friends to a group.",
  recipients_must_be_friends: "Snaps can only be sent to friends.",
  snap_not_found: "This Snap is no longer available.",
  snap_expired: "This Snap has expired.",
  snap_already_viewed: "You've already viewed this Snap.",
  story_not_found: "This story is no longer available.",
  already_viewed: "You've already opened this view-once media.",
  media_expired: "This media has expired.",
  own_view_once: "You sent this view-once media.",
  invalid_media_mode: "That protection option isn't available for this message.",
  view_once_single_media: "View once can only be used with one photo or video at a time.",
  cannot_forward_protected: "Protected and view-once media can't be forwarded.",
  premium_required: "This is a Quick Chat Premium feature.",
  amount_mismatch: "The payment amount didn't match the plan, so it wasn't applied. Contact support for a refund.",
  subscription_not_found: "We couldn't find this subscription.",
  invalid_plan: "That plan isn't available.",
  username_unavailable: "That username is taken or not allowed.",
  invalid_media: "That upload is invalid or still processing.",
  streak_not_recoverable: "This streak can't be recovered.",
  recovery_cooldown: "You can only recover one streak every 30 days.",
  call_not_found: "Call not found.",
  call_ended: "This call has ended.",
  private_account: "This account is private.",
  forbidden: "You don't have permission to do that.",
  target_not_found: "That content could not be found.",
  post_not_found: "Post not found.",
  maintenance: "Quick Chat is undergoing maintenance. Please try again soon.",
  not_configured: "This feature isn't configured on this server yet.",
};

export function messageFor(code: string): string {
  return MESSAGES[code] ?? code.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

type PostgrestLikeError = { code?: string; message?: string; details?: string; hint?: string };

/** Converts a Supabase/PostgREST error into an ApiError. */
export function fromDbError(error: PostgrestLikeError): ApiError {
  const sqlstate = error.code ?? "";
  const raw = (error.message ?? "").trim();
  const isCode = /^[a-z][a-z0-9_]{2,60}$/.test(raw);
  if (sqlstate === "PGRST116") return new ApiError(404, "not_found", "Not found.");
  if (sqlstate === "42501" && /permission denied|row-level security/i.test(raw)) {
    return new ApiError(403, "forbidden", messageFor("forbidden"));
  }
  const status = SQLSTATE_STATUS[sqlstate] ?? (isCode ? 400 : 500);
  if (isCode) return new ApiError(status, raw, messageFor(raw));
  if (status === 500) return new ApiError(500, "database_error", "Something went wrong. Please try again.");
  return new ApiError(status, "invalid_request", "The request could not be completed.");
}
