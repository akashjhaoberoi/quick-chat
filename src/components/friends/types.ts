/** Response shapes of the /api/friends and /api/users endpoints (shared by server and client). */

export type SendRequestStatus = "sent" | "pending" | "accepted" | "already_friends";

export type FriendRequestItem = {
  id: string;
  direction: "incoming" | "outgoing";
  created_at: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_media_id: string | null;
  is_verified: boolean;
  mutual_count: number;
};

export type FriendRequests = { incoming: FriendRequestItem[]; outgoing: FriendRequestItem[] };

export type FriendSuggestion = {
  id: string;
  username: string;
  display_name: string;
  avatar_media_id: string | null;
  mutual_count: number;
};

export type MutualFriend = { id: string; username: string; display_name: string; avatar_media_id: string | null };

export type FriendList = { id: string; name: string; created_at: string; member_ids: string[] };

export type BlockedUser = {
  id: string;
  username: string;
  display_name: string;
  avatar_media_id: string | null;
  blocked_at: string;
};

export type UserSearchResult = {
  id: string;
  username: string;
  display_name: string;
  avatar_media_id: string | null;
  is_creator: boolean;
  is_verified: boolean;
  is_friend: boolean;
  request_status: "incoming" | "outgoing" | null;
};
