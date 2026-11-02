"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { motion } from "motion/react";
import { Avatar } from "@/components/ui/avatar";
import { cn, displayName } from "@/lib/utils";

type RowUser = { id: string; username: string; display_name: string; avatar_media_id: string | null; is_verified?: boolean };

/** Avatar + name + subtitle row linking to the profile, with trailing actions. */
export function UserRow({
  user,
  subtitle,
  actions,
  online,
  index = 0,
  className,
}: {
  user: RowUser;
  subtitle?: ReactNode;
  actions?: ReactNode;
  online?: boolean;
  index?: number;
  className?: string;
}) {
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index, 10) * 0.02 }}
      className={cn("flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-surface-2", className)}
    >
      <Link href={`/profile/${user.username}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-2">
        <Avatar mediaId={user.avatar_media_id} name={displayName(user)} size="md" online={online} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 truncate text-sm font-semibold">
            <span className="truncate">{displayName(user)}</span>
            {user.is_verified ? <BadgeCheck className="h-4 w-4 shrink-0 text-brand" aria-label="Verified" /> : null}
          </span>
          <span className="block truncate text-xs text-muted">{subtitle ?? `@${user.username}`}</span>
        </span>
      </Link>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </motion.li>
  );
}
