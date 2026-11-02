"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { UserPlus } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/controls";
import { FriendsTab } from "./friends-tab";
import { RequestsTab } from "./requests-tab";
import { AddTab, BlockedTab, SuggestionsTab } from "./discover-tabs";
import { ListsTab } from "./friend-lists";
import { useFriendRequests } from "./hooks";

const TABS = ["friends", "requests", "add", "suggestions", "lists", "blocked"] as const;
type Tab = (typeof TABS)[number];

export function FriendsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : "friends";
  const requests = useFriendRequests();

  const setTab = useCallback(
    (next: Tab) => router.replace(next === "friends" ? pathname : `${pathname}?tab=${next}`, { scroll: false }),
    [router, pathname],
  );

  return (
    <PageContainer>
      <PageHeader
        title="Friends"
        subtitle="Your people, requests and lists"
        actions={
          tab !== "add" ? (
            <Button size="sm" onClick={() => setTab("add")}>
              <UserPlus className="h-4 w-4" /> <span className="hidden sm:inline">Add friends</span>
            </Button>
          ) : null
        }
      />
      <div className="px-4 md:px-6">
        <div className="-mx-4 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
          <Tabs
            ariaLabel="Friends sections"
            value={tab}
            onChange={setTab}
            className="min-w-[560px]"
            items={[
              { value: "friends", label: "Friends" },
              { value: "requests", label: "Requests", count: requests.data?.incoming.length },
              { value: "add", label: "Add" },
              { value: "suggestions", label: "Suggestions" },
              { value: "lists", label: "Lists" },
              { value: "blocked", label: "Blocked" },
            ]}
          />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            role="tabpanel"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="py-4 pb-10"
          >
            {tab === "friends" ? <FriendsTab onAddFriends={() => setTab("add")} /> : null}
            {tab === "requests" ? <RequestsTab onAddFriends={() => setTab("add")} /> : null}
            {tab === "add" ? <AddTab /> : null}
            {tab === "suggestions" ? <SuggestionsTab /> : null}
            {tab === "lists" ? <ListsTab /> : null}
            {tab === "blocked" ? <BlockedTab /> : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </PageContainer>
  );
}
