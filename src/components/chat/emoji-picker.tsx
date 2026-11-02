"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Apple, Clock, Hand, Heart, Lightbulb, PawPrint, Plane, Smile, Trophy, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Quick reactions + recent emoji store
--------------------------------------------------------------------------- */

export const QUICK_REACTIONS: string[] = ["❤️", "😂", "😮", "😢", "😡", "👍"];

const STORAGE_KEY = "qc:recent-emoji";
const MAX_RECENT = 24;
const EMPTY: string[] = [];

let recentCache: string[] | null = null;
const listeners = new Set<() => void>();

function readStorage(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const out: string[] = [];
    for (const v of parsed) {
      if (typeof v === "string" && v.length > 0 && v.length <= 32 && !out.includes(v)) out.push(v);
      if (out.length >= MAX_RECENT) break;
    }
    return out;
  } catch {
    return EMPTY;
  }
}

function writeStorage(list: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable (private mode, quota, blocked) — keep in-memory only */
  }
}

function getSnapshot(): string[] {
  if (recentCache === null) recentCache = readStorage();
  return recentCache;
}

function getServerSnapshot(): string[] {
  return EMPTY;
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      recentCache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function pushRecent(emoji: string) {
  if (!emoji) return;
  const current = getSnapshot();
  if (current[0] === emoji) return;
  const next = [emoji, ...current.filter((e) => e !== emoji)].slice(0, MAX_RECENT);
  recentCache = next;
  writeStorage(next);
  emit();
}

/** Recently used emoji (most recent first, max 24), persisted in localStorage. Empty on the server / first hydration pass. */
export function useRecentEmoji(): { recent: string[]; push: (emoji: string) => void } {
  const recent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { recent, push: pushRecent };
}

/* ---------------------------------------------------------------------------
   Emoji data
--------------------------------------------------------------------------- */

type CategoryId = "recent" | "smileys" | "people" | "nature" | "food" | "activities" | "travel" | "objects" | "symbols";

type Category = { id: CategoryId; label: string; icon: LucideIcon; emoji: string[] };

const list = (s: string): string[] => s.trim().split(/\s+/u);

const CATEGORIES: Category[] = [
  {
    id: "smileys",
    label: "Smileys",
    icon: Smile,
    emoji: list(`
      😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 🫠 😉 😊 😇 🥰 😍 🤩 😘 😗 ☺️ 😚 😋 😛 😜 🤪 😝 🤑 🤗
      🤭 🫢 🤫 🤔 🫡 🤐 🤨 😐 😑 😶 🫥 😏 😒 🙄 😬 😮‍💨 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧
      🥵 🥶 🥴 😵‍💫 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 🥹 😨 😰 😥 😢 😭 😱 😖
      😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 💩 🤡 👻 👽 🤖 😺 😸 😹 😻 😼 🙀 😿
    `),
  },
  {
    id: "people",
    label: "People & gestures",
    icon: Hand,
    emoji: list(`
      👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 🫵 👍 👎 ✊ 👊 🤛 🤜 👏 🙌
      🫶 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 👀 👅 👄 🧠 👶 🧒 👦 👧 🧑 👱 👨 🧔 👩 🧓 👴 👵 🙋 🙅 🙆 💁
      🤷 🤦 🙇 🧑‍💻 🧑‍🎓 🧑‍🍳 🧑‍🎨 🧑‍🚀 🦸 🧙 💃 🕺 👯 🧘 🏃 🚶 👫 💑 👪
    `),
  },
  {
    id: "nature",
    label: "Animals & nature",
    icon: PawPrint,
    emoji: list(`
      🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺
      🐴 🦄 🐝 🦋 🐌 🐞 🐢 🐍 🦖 🐙 🦀 🐠 🐬 🐳 🦈 🦒 🐘 🦔 🐾 🌵 🌲 🌴 🌱 🌿 🍀 🍁 🍂 🍄
      🌷 🌹 🥀 🌺 🌸 🌼 🌻 🌞 🌝 🌙 🌎 🪐 ⭐ 🌟 ✨ ⚡ 🔥 🌈 ☀️ ⛅ ☁️ 🌧️ ⛈️ ❄️ ☃️ 🌊 💧
    `),
  },
  {
    id: "food",
    label: "Food & drink",
    icon: Apple,
    emoji: list(`
      🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🍆 🥦 🌽 🌶️ 🥕 🥔 🥐 🍞 🥖
      🧀 🥚 🍳 🥞 🧇 🥓 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍦 🍩
      🍪 🎂 🍰 🧁 🍫 🍬 🍭 🍿 ☕ 🍵 🧋 🥤 🧃 🍺 🍻 🥂 🍷 🍹 🍸
    `),
  },
  {
    id: "activities",
    label: "Activities",
    icon: Trophy,
    emoji: list(`
      ⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🏒 🏏 ⛳ 🏹 🎣 🥊 🥋 ⛸️ 🎿 🏂 🏋️ 🤸 🚴 🏊 🏄 🧗 🏆 🥇
      🥈 🥉 🏅 🎖️ 🎟️ 🎪 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 🎲 ♟️ 🎯 🎳 🎮 🕹️ 🧩 🎉 🎊 🎈
      🎁 🎀 🎃 🎄 🎆 🎇 🧨
    `),
  },
  {
    id: "travel",
    label: "Travel & places",
    icon: Plane,
    emoji: list(`
      🚗 🚕 🚙 🚌 🏎️ 🚓 🚑 🚒 🚚 🚜 🛵 🏍️ 🚲 🛴 🚨 🚆 🚇 🚊 🚄 ✈️ 🛫 🛬 🚁 🚀 🛸 🛰️ ⛵ 🚤
      🛳️ ⚓ ⛽ 🚦 🗺️ 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ ⛺ 🏠 🏡 🏢 🏥
      🏦 🏨 🏫 🌅 🌄 🌠 🌇 🌆 🏙️ 🌃 🌌 🌉 🧳
    `),
  },
  {
    id: "objects",
    label: "Objects",
    icon: Lightbulb,
    emoji: list(`
      ⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💾 💿 📷 📸 📹 🎥 📞 ☎️ 📺 📻 🎙️ ⏰ ⌛ ⏳ 🔋 🔌 💡 🔦 🕯️
      💸 💵 💰 💳 💎 🔧 🔨 🛠️ ⚙️ 🧲 🔮 🧿 💊 🩺 🧬 🔬 🔭 🧹 🧺 🛁 🔑 🗝️ 🚪 🛋️ 🛏️ 🧸 🖼️
      🛍️ 🛒 ✉️ 📩 📦 📫 📝 📁 📅 📌 📎 ✂️ 🖊️ ✏️ 📚 📖 🔖 🔒 🔓 🔍
    `),
  },
  {
    id: "symbols",
    label: "Symbols & hearts",
    icon: Heart,
    emoji: list(`
      ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 🩷 🩵 🩶 💔 ❤️‍🔥 ❤️‍🩹 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ☯️
      ✅ ☑️ ✔️ ❌ ❎ ➕ ➖ ➗ ✖️ ♾️ ‼️ ⁉️ ❓ ❗ 💯 💢 💥 💫 💦 💨 💬 💭 🗯️ 💤 🔔 🔕 🎵 🎶
      ⚠️ 🚫 ⛔ ♻️ 🔰 ⭕ 🆗 🆒 🆕 🆓 🆙 🆘 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ ▶️ ⏸️ 🔁 🔀 ↩️
    `),
  },
];

const RECENT_META = { id: "recent" as const, label: "Recent", icon: Clock };

const NAV: { id: CategoryId; label: string; icon: LucideIcon }[] = [RECENT_META, ...CATEGORIES];
const SECTION_IDS: CategoryId[] = NAV.map((c) => c.id);

const EMOJI_FONT = { fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif' };

/* ---------------------------------------------------------------------------
   Picker
--------------------------------------------------------------------------- */

function EmojiGrid({ emoji, onPick }: { emoji: string[]; onPick: (emoji: string) => void }) {
  return (
    <div className="grid grid-cols-7 gap-0.5 px-1 pb-2 @min-[18rem]:grid-cols-8">
      {emoji.map((e) => (
        <button
          key={e}
          type="button"
          aria-label={e}
          onClick={() => onPick(e)}
          style={EMOJI_FONT}
          className="flex h-9 w-full items-center justify-center rounded-xl text-2xl leading-none transition-[background-color,transform] duration-100 hover:bg-surface-2 active:scale-90 focus-visible:bg-surface-2"
        >
          {e}
        </button>
      ))}
    </div>
  );
}

export function EmojiPicker({ onSelect, className }: { onSelect: (emoji: string) => void; className?: string }) {
  const { recent, push } = useRecentEmoji();
  const [active, setActive] = useState<CategoryId>("recent");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Partial<Record<CategoryId, HTMLElement | null>>>({});
  const lockRef = useRef<number | null>(null);

  const pick = (emoji: string) => {
    push(emoji);
    onSelect(emoji);
  };

  const jumpTo = (id: CategoryId) => {
    setActive(id);
    const container = scrollRef.current;
    const section = sectionRefs.current[id];
    if (!container || !section) return;
    if (lockRef.current !== null) window.clearTimeout(lockRef.current);
    lockRef.current = window.setTimeout(() => {
      lockRef.current = null;
    }, 600);
    container.scrollTo({ top: section.offsetTop, behavior: "smooth" });
  };

  const onScroll = () => {
    if (lockRef.current !== null) return;
    const container = scrollRef.current;
    if (!container) return;
    let current: CategoryId = SECTION_IDS[0];
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
      current = SECTION_IDS[SECTION_IDS.length - 1];
    } else {
      const y = container.scrollTop + 12;
      for (const id of SECTION_IDS) {
        const section = sectionRefs.current[id];
        if (section && section.offsetTop <= y) current = id;
      }
    }
    setActive(current);
  };

  const sections: { id: CategoryId; label: string; emoji: string[] }[] = [
    { id: "recent", label: RECENT_META.label, emoji: recent },
    ...CATEGORIES,
  ];

  return (
    <div className={cn("@container flex w-full flex-col", className)}>
      <nav aria-label="Emoji categories" className="no-scrollbar flex items-center justify-between gap-0.5 overflow-x-auto border-b border-border px-1 pb-1.5">
        {NAV.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              aria-label={label}
              title={label}
              aria-current={isActive ? "true" : undefined}
              onClick={() => jumpTo(id)}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors",
                isActive ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          );
        })}
      </nav>

      <div ref={scrollRef} onScroll={onScroll} className="scrollbar-thin relative max-h-64 overflow-y-auto overscroll-contain">
        {sections.map((section) => (
          <section
            key={section.id}
            aria-label={section.label}
            ref={(el) => {
              sectionRefs.current[section.id] = el;
            }}
          >
            <h3 className="sticky top-0 z-10 bg-surface/95 px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted backdrop-blur-sm">
              {section.label}
            </h3>
            {section.emoji.length > 0 ? (
              <EmojiGrid emoji={section.emoji} onPick={pick} />
            ) : (
              <p className="px-2 pb-3 pt-1 text-xs text-muted">Emoji you use will show up here.</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
