"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import type { DayCount } from "./types";

function utcDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function niceMax(n: number) {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= n / 1) ?? 10;
  return step * pow;
}

/** Daily single-series bar chart (accessible inline SVG; keyboard + hover tooltip; table view). */
export function DailyBarChart({ data, days, unit, title }: { data: DayCount[]; days: number; unit: string; title: string }) {
  const series = useMemo(() => {
    const counts = new Map(data.map((d) => [String(d.day).slice(0, 10), Number(d.count)]));
    const today = new Date();
    return Array.from({ length: days + 1 }, (_, i) => {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (days - i)));
      const key = utcDay(d);
      return { day: key, label: format(new Date(`${key}T12:00:00Z`), "d MMM"), count: counts.get(key) ?? 0 };
    });
  }, [data, days]);
  const [active, setActive] = useState<number | null>(null);

  const total = series.reduce((s, d) => s + d.count, 0);
  const max = niceMax(Math.max(...series.map((d) => d.count), 0));
  const W = 600;
  const H = 180;
  const padL = 32;
  const padB = 22;
  const plotW = W - padL;
  const plotH = H - padB - 8;
  const slot = plotW / series.length;
  const barW = Math.max(2, slot - 2);
  const y = (v: number) => 8 + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const focused = active !== null ? series[active] : null;

  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted tabular-nums">
          {total.toLocaleString()} {unit} total
        </span>
      </figcaption>
      <div
        className="relative rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
        tabIndex={0}
        role="group"
        aria-label={`${title}. Use left and right arrow keys to read each day.`}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setActive((a) => Math.min(series.length - 1, (a ?? -1) + 1));
          else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? series.length) - 1));
          else if (e.key === "Escape") setActive(null);
        }}
        onBlur={() => setActive(null)}
        onMouseLeave={() => setActive(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-hidden>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} strokeDasharray={t === 0 ? undefined : "3 4"} />
              <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--muted)">
                {Number.isInteger(t) ? t.toLocaleString() : t.toFixed(1)}
              </text>
            </g>
          ))}
          {series.map((d, i) => {
            const x = padL + i * slot + 1;
            const top = y(d.count);
            const h = 8 + plotH - top;
            const r = Math.min(4, barW / 2, h);
            return (
              <g key={d.day}>
                {d.count > 0 ? (
                  <path
                    d={`M${x},${8 + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${8 + plotH} Z`}
                    fill="var(--brand)"
                    opacity={active === null || active === i ? 1 : 0.45}
                  />
                ) : null}
                <rect x={padL + i * slot} y={0} width={slot} height={H - padB} fill="transparent" onMouseEnter={() => setActive(i)} />
              </g>
            );
          })}
          {[0, Math.floor(series.length / 2), series.length - 1].map((i) => (
            <text
              key={i}
              x={padL + i * slot + slot / 2}
              y={H - 6}
              textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"}
              fontSize={10}
              fill="var(--muted)"
            >
              {series[i].label}
            </text>
          ))}
        </svg>
        {focused && active !== null ? (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-[var(--shadow-pop)]"
            style={{ left: `${((padL + active * slot + slot / 2) / W) * 100}%` }}
            role="status"
          >
            <span className="font-semibold">{focused.label}</span>
            <span className="ml-2 tabular-nums text-ink-2">
              {focused.count.toLocaleString()} {unit}
            </span>
          </div>
        ) : null}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold text-brand hover:underline">Show data table</summary>
        <div className="mt-2 max-h-56 overflow-auto scrollbar-thin">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="text-muted">
                <th scope="col" className="py-1 font-semibold">Day (UTC)</th>
                <th scope="col" className="py-1 text-right font-semibold">{unit}</th>
              </tr>
            </thead>
            <tbody>
              {series.map((d) => (
                <tr key={d.day} className="border-t border-border">
                  <td className="py-1">{d.label}</td>
                  <td className="py-1 text-right tabular-nums">{d.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
