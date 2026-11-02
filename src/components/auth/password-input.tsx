"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Password field with a show/hide toggle. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type">>(function PasswordInput(
  { className, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={visible ? "text" : "password"} className={cn("pr-11", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; tips: string[] };

const COMMON = ["password", "123456", "qwerty", "letmein", "welcome", "iloveyou", "admin", "quickchat", "abc123", "monkey", "dragon"];

/** Heuristic strength estimate (the server enforces the real rules). */
export function passwordStrength(pw: string, context: string[] = []): Strength {
  const tips: string[] = [];
  if (!pw) return { score: 0, label: "Enter a password", tips };
  let points = 0;
  if (pw.length >= 10) points++;
  else tips.push("Use at least 10 characters");
  if (pw.length >= 14) points++;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes >= 3) points++;
  else tips.push("Mix upper and lower case, numbers and symbols");
  if (classes === 4 && pw.length >= 12) points++;
  const lower = pw.toLowerCase();
  const weak =
    COMMON.some((c) => lower.includes(c)) ||
    context.some((c) => c && c.length >= 3 && lower.includes(c.toLowerCase())) ||
    /(.)\1{3,}/.test(pw) ||
    /^(?:0123|1234|2345|3456|4567|5678|6789|abcd)/i.test(pw);
  if (weak) {
    points = Math.min(points, 1);
    tips.push("Avoid common words, your name and repeated patterns");
  }
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) {
    points = Math.min(points, 1);
    if (!tips.includes("Use letters and at least one number")) tips.push("Use letters and at least one number");
  }
  const score = Math.max(0, Math.min(4, points)) as Strength["score"];
  return { score, label: ["Very weak", "Weak", "Fair", "Strong", "Very strong"][score], tips };
}

const COLORS = ["bg-danger", "bg-danger", "bg-warning", "bg-success", "bg-success"];

export function PasswordStrengthMeter({ password, context }: { password: string; context?: string[] }) {
  const s = passwordStrength(password, context);
  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", password && i < Math.max(1, s.score) ? COLORS[s.score] : "bg-surface-3")}
          />
        ))}
      </div>
      <p className="text-xs text-muted">
        <span className="font-semibold text-ink-2">Strength: {password ? s.label : "—"}</span>
        {password && s.tips[0] ? ` · ${s.tips[0]}` : null}
      </p>
    </div>
  );
}
