import Link from "next/link";
import { cn } from "@/lib/utils";

const SPLIT = /(#[A-Za-z0-9_]{1,40})/g;

/** Caption text with clickable #hashtags (rendered as text, never HTML). */
export function Caption({ text, className, linkClassName }: { text: string; className?: string; linkClassName?: string }) {
  if (!text) return null;
  return (
    <p className={cn("whitespace-pre-wrap break-words", className)}>
      {text.split(SPLIT).map((part, i) =>
        /^#[A-Za-z0-9_]{1,40}$/.test(part) ? (
          <Link key={i} href={`/discover/tag/${part.slice(1).toLowerCase()}`} className={cn("font-semibold hover:underline", linkClassName)}>
            {part}
          </Link>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}
