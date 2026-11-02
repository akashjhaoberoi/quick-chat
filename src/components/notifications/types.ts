import type { AppNotification, UserCard } from "@/types/models";

/** One page of GET /api/notifications. */
export type NotificationsPage = {
  items: AppNotification[];
  /** Public cards of the actors referenced by `items`, keyed by user id (blocked/inactive users are absent). */
  actors: Record<string, UserCard>;
  /** Pass as `cursor` to load the next (older) page; null when there are no more. */
  nextCursor: string | null;
};
