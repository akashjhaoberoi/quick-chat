"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Quick Chat built-in stickers — original art by Akarika Technologies.
   Every sticker is static inline SVG (viewBox 0 0 128 128) with no ids:
   a white "die-cut" backing silhouette, then flat art with a dark outline,
   so it reads on both light and dark surfaces.
--------------------------------------------------------------------------- */

export type StickerDef = { id: string; label: string; svg: ReactNode };

const OL = "#2a2140"; // outline / ink
const W = "#ffffff";
const SHINE = { fill: W, opacity: 0.45 } as const;
const CHEEK = "#ff8fa3";
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif";

/** Outline props for art shapes. */
const ln = { stroke: OL, strokeWidth: 3, strokeLinejoin: "round", strokeLinecap: "round" } as const;
/** Stroke-only line. */
const sl = (w = 4, color: string = OL) => ({ fill: "none", stroke: color, strokeWidth: w, strokeLinecap: "round", strokeLinejoin: "round" }) as const;

/** White die-cut backing behind the given silhouette shapes. */
function backing(children: ReactNode, width = 12): ReactNode {
  return (
    <g fill={W} stroke={W} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round">
      {children}
    </g>
  );
}

function eyes(lx: number, rx: number, y: number, r = 5): ReactNode {
  return (
    <g>
      <ellipse cx={lx} cy={y} rx={r} ry={r * 1.35} fill={OL} />
      <ellipse cx={rx} cy={y} rx={r} ry={r * 1.35} fill={OL} />
      <circle cx={lx + r * 0.35} cy={y - r * 0.55} r={r * 0.4} fill={W} />
      <circle cx={rx + r * 0.35} cy={y - r * 0.55} r={r * 0.4} fill={W} />
    </g>
  );
}

function cheeks(lx: number, rx: number, y: number, rx2 = 7): ReactNode {
  return (
    <g fill={CHEEK} opacity={0.75}>
      <ellipse cx={lx} cy={y} rx={rx2} ry={rx2 * 0.55} />
      <ellipse cx={rx} cy={y} rx={rx2} ry={rx2 * 0.55} />
    </g>
  );
}

function drop(x: number, y: number, s = 1, rot = 0, color = "#5ec8ff"): ReactNode {
  return (
    <path
      d="M0 -12 C5 -5 9 0 9 5 A9 9 0 0 1 -9 5 C-9 0 -5 -5 0 -12Z"
      transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}
      fill={color}
      {...ln}
      strokeWidth={3 / s}
    />
  );
}

function twinkle(x: number, y: number, s = 1, color = "#ffd84d"): ReactNode {
  return (
    <path
      d="M0 -10 C1.5 -3 3 -1.5 10 0 C3 1.5 1.5 3 0 10 C-1.5 3 -3 1.5 -10 0 C-3 -1.5 -1.5 -3 0 -10Z"
      transform={`translate(${x} ${y}) scale(${s})`}
      fill={color}
      {...ln}
      strokeWidth={2.5 / s}
    />
  );
}

const CLOUD = "M-22 10 C-31 10 -31 -3 -22 -3 C-22 -15 -6 -17 -2 -8 C2 -19 20 -17 20 -4 C30 -4 30 10 20 10 Z";

function bubbleText(text: string, fill: string, size: number, y = 72): ReactNode {
  return (
    <text x="64" y={y} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={size} fill={fill} letterSpacing="1">
      {text}
    </text>
  );
}

/* ----------------------------- shared shapes ----------------------------- */

const BLOB = "M64 14 C96 14 114 36 114 66 C114 96 92 114 64 114 C36 114 14 96 14 66 C14 36 32 14 64 14Z";
const HEART = "M64 108 C30 86 12 66 12 44 C12 28 24 16 40 16 C51 16 59 22 64 30 C69 22 77 16 88 16 C104 16 116 28 116 44 C116 66 98 86 64 108Z";
const BUBBLE_L = "M20 22 H108 A12 12 0 0 1 120 34 V80 A12 12 0 0 1 108 92 H52 L30 112 L34 92 H20 A12 12 0 0 1 8 80 V34 A12 12 0 0 1 20 22Z";
const BUBBLE_R = "M20 22 H108 A12 12 0 0 1 120 34 V80 A12 12 0 0 1 108 92 H94 L98 112 L76 92 H20 A12 12 0 0 1 8 80 V34 A12 12 0 0 1 20 22Z";

const SUN_RAYS: string[] = Array.from({ length: 12 }, (_, i) => {
  const a = (i * Math.PI * 2) / 12;
  const p = (r: number, da: number) => `${(64 + r * Math.cos(a + da)).toFixed(1)} ${(64 + r * Math.sin(a + da)).toFixed(1)}`;
  return `M${p(38, -0.2)} L${p(56, 0)} L${p(38, 0.2)}Z`;
});

const BROKEN_L = "M62 106 C30 86 12 66 12 44 C12 28 24 16 40 16 C51 16 57 22 62 30 L54 48 L66 60 L56 76 L62 92Z";
const BROKEN_R = "M68 30 C73 22 81 16 92 16 C108 16 120 28 120 44 C120 66 102 86 68 106 L68 92 L62 76 L72 60 L60 48Z";

const FLAME = "M64 8 C72 30 94 38 100 62 C106 88 90 116 64 118 C38 116 22 98 26 72 C28 58 36 50 42 38 C46 50 50 56 56 58 C52 40 56 22 64 8Z";
const FLAME_IN = "M64 50 C70 62 84 70 84 88 C84 104 75 112 64 112 C53 112 44 104 44 88 C44 76 56 70 64 50Z";

const THUMB = "M46 62 C50 50 54 40 56 28 C58 17 75 17 75 30 C75 40 73 48 71 56 L88 56 C99 56 101 67 94 72 C101 75 101 85 94 87 C101 90 101 99 94 101 C99 105 97 113 88 113 L46 113Z";

const GHOST = "M28 112 L28 56 C28 30 44 16 64 16 C84 16 100 30 100 56 L100 112 L88 102 L76 112 L64 102 L52 112 L40 102Z";

const MOON = "M86 16 C56 20 40 46 44 74 C48 98 72 112 100 106 C84 120 50 120 32 104 C12 86 12 50 30 32 C46 18 66 12 86 16Z";

const CUP = "M26 50 H102 L95 102 C94 109 88 114 81 114 H47 C40 114 34 109 33 102Z";

const PIZZA = "M64 118 L18 30 C46 16 82 16 110 30Z";

const CROWN = "M20 94 L14 38 L42 62 L64 24 L86 62 L114 38 L108 94Z";

const ROCKET_BODY = "M64 10 C82 24 88 48 85 76 H43 C40 48 46 24 64 10Z";

const CAT_EARS_L = "M24 56 L28 12 L60 38Z";
const CAT_EARS_R = "M104 56 L100 12 L68 38Z";

/* -------------------------------- stickers ------------------------------- */

export const STICKERS: StickerDef[] = [
  {
    id: "happy-blob",
    label: "Happy blob",
    svg: (
      <>
        {backing(<path d={BLOB} />)}
        <path d={BLOB} fill="#ffd84d" {...ln} />
        <path d="M30 86 C40 104 60 110 80 106 C98 102 108 88 112 76 C108 98 90 112 64 112 C44 112 30 102 24 88Z" fill="#f5b82e" opacity={0.6} />
        <ellipse cx="44" cy="34" rx="14" ry="7" transform="rotate(-25 44 34)" {...SHINE} />
        {eyes(48, 80, 60)}
        {cheeks(36, 92, 76)}
        <path d="M46 76 Q64 98 82 76Z" fill={OL} {...ln} />
        <path d="M54 86 Q64 82 74 86 Q70 92 64 92 Q58 92 54 86Z" fill="#ff6b81" />
      </>
    ),
  },
  {
    id: "lol-blob",
    label: "Laughing so hard",
    svg: (
      <>
        {backing(
          <>
            <path d={BLOB} />
            <circle cx="16" cy="70" r="12" />
            <circle cx="112" cy="70" r="12" />
          </>,
        )}
        <path d={BLOB} fill="#ffd84d" {...ln} />
        <ellipse cx="44" cy="34" rx="14" ry="7" transform="rotate(-25 44 34)" {...SHINE} />
        <path d="M38 50 L52 57 L38 64" {...sl(5)} />
        <path d="M90 50 L76 57 L90 64" {...sl(5)} />
        <path d="M38 72 Q64 112 90 72Z" fill={OL} {...ln} />
        <path d="M50 92 Q64 84 78 92 Q72 102 64 102 Q56 102 50 92Z" fill="#ff6b81" />
        <path d="M42 74 H86" stroke={W} strokeWidth={4} strokeLinecap="round" />
        {drop(18, 70, 1, -35)}
        {drop(110, 70, 1, 35)}
      </>
    ),
  },
  {
    id: "heart-face",
    label: "Love you",
    svg: (
      <>
        {backing(<path d={HEART} />)}
        <path d={HEART} fill="#ff5e7e" {...ln} />
        <path d="M24 66 C34 84 50 96 64 104 C46 94 28 80 20 60Z" fill="#e23c63" opacity={0.5} />
        <ellipse cx="34" cy="36" rx="11" ry="6" transform="rotate(-35 34 36)" {...SHINE} />
        {eyes(48, 80, 54, 4.5)}
        {cheeks(38, 90, 68, 6)}
        <path d="M54 68 Q64 78 74 68" {...sl(4)} />
        {twinkle(108, 16, 0.8)}
      </>
    ),
  },
  {
    id: "broken-heart",
    label: "Heartbroken",
    svg: (
      <>
        {backing(
          <>
            <path d={BROKEN_L} transform="rotate(-7 62 106)" />
            <path d={BROKEN_R} transform="rotate(7 68 106)" />
          </>,
        )}
        <path d={BROKEN_L} transform="rotate(-7 62 106)" fill="#ff5e7e" {...ln} />
        <path d={BROKEN_R} transform="rotate(7 68 106)" fill="#f2466c" {...ln} />
        <path d="M30 52 Q36 46 42 52" {...sl(4)} />
        <path d="M90 52 Q96 46 102 52" {...sl(4)} />
        {drop(36, 66, 0.7, 0)}
        <path d="M78 74 Q86 68 94 74" {...sl(3.5)} transform="rotate(7 68 106)" />
      </>
    ),
  },
  {
    id: "fire-face",
    label: "On fire",
    svg: (
      <>
        {backing(<path d={FLAME} />)}
        <path d={FLAME} fill="#ff7a2f" {...ln} />
        <path d={FLAME_IN} fill="#ffd84d" {...ln} />
        <ellipse cx="80" cy="54" rx="5" ry="10" transform="rotate(-25 80 54)" {...SHINE} />
        {eyes(56, 72, 88, 3.6)}
        <path d="M57 98 Q64 105 71 98" {...sl(3.5)} />
        {cheeks(50, 78, 97, 4.5)}
      </>
    ),
  },
  {
    id: "thumbs-up",
    label: "Thumbs up",
    svg: (
      <>
        {backing(
          <>
            <path d={THUMB} />
            <rect x="20" y="58" width="28" height="58" rx="6" />
          </>,
        )}
        <path d={THUMB} fill="#ffc94d" {...ln} />
        <path d="M74 72 H94 M74 86 H94 M74 100 H92" {...sl(3)} />
        <ellipse cx="62" cy="30" rx="4" ry="7" {...SHINE} />
        <rect x="20" y="58" width="28" height="58" rx="6" fill="#7c5cff" {...ln} />
        <circle cx="34" cy="104" r="3.5" fill={W} />
        {twinkle(104, 24, 0.9)}
        {twinkle(22, 34, 0.6, "#ff5e7e")}
      </>
    ),
  },
  {
    id: "clap",
    label: "Applause",
    svg: (
      <>
        {backing(
          <>
            <g transform="rotate(-20 64 84)">
              <ellipse cx="38" cy="82" rx="9" ry="15" />
              <rect x="40" y="44" width="30" height="64" rx="15" />
            </g>
            <g transform="rotate(20 64 84)">
              <ellipse cx="90" cy="82" rx="9" ry="15" />
              <rect x="58" y="44" width="30" height="64" rx="15" />
            </g>
          </>,
        )}
        <g transform="rotate(-20 64 84)">
          <ellipse cx="38" cy="82" rx="9" ry="15" fill="#f5b82e" {...ln} />
          <rect x="40" y="44" width="30" height="64" rx="15" fill="#ffc94d" {...ln} />
          <path d="M48 52 V66" stroke={W} strokeWidth={4} strokeLinecap="round" opacity={0.6} />
        </g>
        <g transform="rotate(20 64 84)">
          <ellipse cx="90" cy="82" rx="9" ry="15" fill="#f5b82e" {...ln} />
          <rect x="58" y="44" width="30" height="64" rx="15" fill="#ffd45e" {...ln} />
          <path d="M66 52 V66" stroke={W} strokeWidth={4} strokeLinecap="round" opacity={0.6} />
        </g>
        <path d="M64 10 V24" {...sl(5, "#ff5e7e")} />
        <path d="M38 18 L45 29" {...sl(5, "#7c5cff")} />
        <path d="M90 18 L83 29" {...sl(5, "#3fd0c9")} />
      </>
    ),
  },
  {
    id: "party-popper",
    label: "Party time",
    svg: (
      <>
        {backing(
          <>
            <path d="M16 114 L44 48 L82 86Z" />
            <path d="M70 58 C76 42 88 48 90 34 C92 22 104 26 106 16" fill="none" />
            <path d="M76 72 C90 66 96 78 110 70" fill="none" />
            <circle cx="102" cy="48" r="6" />
            <circle cx="62" cy="22" r="6" />
            <rect x="80" y="24" width="10" height="10" />
          </>,
        )}
        <path d="M16 114 L44 48 L82 86Z" fill="#7c5cff" {...ln} />
        <path d="M27.6 86.6 L43.4 102.4 M35.4 68.2 L61.8 94.6" stroke="#ffd84d" strokeWidth={6} />
        <ellipse cx="63" cy="67" rx="26" ry="7" transform="rotate(45 63 67)" fill="#4b2fc9" {...ln} />
        <path d="M70 58 C76 42 88 48 90 34 C92 22 104 26 106 16" {...sl(5, "#ff5e7e")} />
        <path d="M76 72 C90 66 96 78 110 70" {...sl(5, "#3fd0c9")} />
        <circle cx="102" cy="48" r="5" fill="#ffd84d" {...ln} strokeWidth={2.5} />
        <circle cx="62" cy="22" r="5" fill="#3fd0c9" {...ln} strokeWidth={2.5} />
        <rect x="80" y="24" width="10" height="10" rx="2" transform="rotate(25 85 29)" fill="#ff5e7e" {...ln} strokeWidth={2.5} />
        <rect x="108" y="88" width="9" height="9" rx="2" transform="rotate(-20 112 92)" fill="#7c5cff" {...ln} strokeWidth={2.5} />
        {twinkle(40, 26, 0.7)}
      </>
    ),
  },
  {
    id: "sparkle-star",
    label: "Sparkle",
    svg: (
      <>
        {backing(
          <>
            <path d="M64 12 C68 44 80 58 112 64 C80 70 68 84 64 116 C60 84 48 70 16 64 C48 58 60 44 64 12Z" />
            <circle cx="104" cy="24" r="10" />
            <circle cx="24" cy="102" r="8" />
          </>,
          14,
        )}
        <path d="M64 12 C68 44 80 58 112 64 C80 70 68 84 64 116 C60 84 48 70 16 64 C48 58 60 44 64 12Z" fill="#ffd84d" {...ln} />
        <path d="M64 24 C66 44 72 54 82 58" {...sl(4, W)} opacity={0.7} />
        <ellipse cx="57" cy="62" rx="3.2" ry="4.4" fill={OL} />
        <ellipse cx="71" cy="62" rx="3.2" ry="4.4" fill={OL} />
        <path d="M59 71 Q64 76 69 71" {...sl(3)} />
        {cheeks(51, 77, 70, 4)}
        {twinkle(104, 24, 1, "#ff8fa3")}
        {twinkle(24, 102, 0.8, "#7c5cff")}
      </>
    ),
  },
  {
    id: "ghost-wave",
    label: "Boo hello",
    svg: (
      <>
        {backing(
          <>
            <path d={GHOST} />
            <ellipse cx="108" cy="54" rx="9" ry="14" transform="rotate(30 108 54)" />
            <ellipse cx="22" cy="72" rx="8" ry="12" transform="rotate(-20 22 72)" />
          </>,
        )}
        <ellipse cx="108" cy="54" rx="9" ry="14" transform="rotate(30 108 54)" fill="#f1eeff" {...ln} />
        <ellipse cx="22" cy="72" rx="8" ry="12" transform="rotate(-20 22 72)" fill="#f1eeff" {...ln} />
        <path d={GHOST} fill="#f1eeff" {...ln} />
        <path d="M86 40 C92 56 92 80 90 104 L88 102 L82 106 C86 82 88 60 84 42Z" fill="#d9d2ff" opacity={0.8} />
        <ellipse cx="46" cy="36" rx="10" ry="5" transform="rotate(-30 46 36)" fill={W} />
        {eyes(52, 76, 58, 5)}
        <ellipse cx="64" cy="76" rx="5" ry="6" fill={OL} />
        {cheeks(42, 86, 70, 6)}
        <path d="M114 34 Q120 40 118 48" {...sl(3)} />
      </>
    ),
  },
  {
    id: "cat-face",
    label: "Kitty",
    svg: (
      <>
        {backing(
          <>
            <path d={CAT_EARS_L} />
            <path d={CAT_EARS_R} />
            <ellipse cx="64" cy="72" rx="48" ry="42" />
          </>,
        )}
        <path d={CAT_EARS_L} fill="#ffa94d" {...ln} />
        <path d={CAT_EARS_R} fill="#ffa94d" {...ln} />
        <path d="M31 46 L33 24 L49 38Z" fill={CHEEK} />
        <path d="M97 46 L95 24 L79 38Z" fill={CHEEK} />
        <ellipse cx="64" cy="72" rx="48" ry="42" fill="#ffb86b" {...ln} />
        <path d="M52 32 Q56 40 54 46 M64 30 V44 M76 32 Q72 40 74 46" {...sl(4, "#f08a2c")} />
        <ellipse cx="64" cy="94" rx="20" ry="13" fill="#fff4e6" />
        {eyes(46, 82, 70, 5)}
        <path d="M59 82 H69 L64 88Z" fill="#ff6b81" {...ln} strokeWidth={2} />
        <path d="M64 88 Q60 96 54 92 M64 88 Q68 96 74 92" {...sl(3)} />
        <path d="M10 76 L34 80 M10 90 L34 88 M118 76 L94 80 M118 90 L94 88" {...sl(2.5)} />
        {cheeks(36, 92, 86, 6)}
      </>
    ),
  },
  {
    id: "sleepy-moon",
    label: "Sleepy",
    svg: (
      <>
        {backing(
          <>
            <path d={MOON} />
            <text x="86" y="62" fontFamily={FONT} fontWeight={900} fontSize="24">Z</text>
            <text x="100" y="42" fontFamily={FONT} fontWeight={900} fontSize="18">z</text>
            <text x="110" y="26" fontFamily={FONT} fontWeight={900} fontSize="14">z</text>
          </>,
        )}
        <path d={MOON} fill="#ffe27a" {...ln} />
        <path d="M24 50 C20 64 22 84 34 98" {...sl(5, W)} opacity={0.55} />
        <path d="M24 66 Q30 72 36 66" {...sl(3.5)} />
        <path d="M34 88 Q38 92 44 88" {...sl(3)} />
        <ellipse cx="28" cy="78" rx="5" ry="3" fill={CHEEK} opacity={0.8} />
        <g fontFamily={FONT} fontWeight={900} fill="#7c5cff" stroke={OL} strokeWidth={1.5}>
          <text x="86" y="62" fontSize="24">Z</text>
          <text x="100" y="42" fontSize="18">z</text>
          <text x="110" y="26" fontSize="14">z</text>
        </g>
        {twinkle(70, 104, 0.6)}
      </>
    ),
  },
  {
    id: "coffee",
    label: "Coffee time",
    svg: (
      <>
        {backing(
          <>
            <path d={CUP} />
            <path d="M98 60 C118 58 118 94 94 92" fill="none" strokeWidth={22} />
            <ellipse cx="64" cy="114" rx="46" ry="8" />
            <path d="M48 40 C42 32 54 26 48 14 M66 40 C60 32 72 26 66 14 M84 40 C78 32 90 26 84 14" fill="none" strokeWidth={14} />
          </>,
        )}
        <ellipse cx="64" cy="114" rx="46" ry="8" fill="#d9d2ff" {...ln} />
        <path d="M98 60 C116 58 116 94 94 92" {...sl(10, OL)} />
        <path d="M98 60 C116 58 116 94 94 92" {...sl(4.5, "#ff8fa3")} />
        <path d={CUP} fill="#ff8fa3" {...ln} />
        <ellipse cx="64" cy="50" rx="38" ry="8" fill="#8b5a3c" {...ln} />
        <ellipse cx="54" cy="49" rx="10" ry="2.5" fill="#c08a64" />
        <path d="M36 62 C38 80 40 94 44 104" {...sl(5, W)} opacity={0.5} />
        {eyes(52, 76, 78, 4)}
        <path d="M58 88 Q64 94 70 88" {...sl(3.5)} />
        {cheeks(44, 84, 88, 5)}
        <path d="M48 40 C42 32 54 26 48 14 M66 40 C60 32 72 26 66 14 M84 40 C78 32 90 26 84 14" {...sl(4, "#b9b3d1")} />
      </>
    ),
  },
  {
    id: "pizza",
    label: "Pizza party",
    svg: (
      <>
        {backing(
          <>
            <path d={PIZZA} />
            <path d="M14 26 C46 8 82 8 114 26" fill="none" strokeWidth={28} />
          </>,
        )}
        <path d={PIZZA} fill="#ffd166" {...ln} />
        <path d="M30 52 C36 60 34 68 40 70 C44 72 46 64 48 58" fill="#ffc23d" />
        <path d="M14 26 C46 8 82 8 114 26" {...sl(18, OL)} />
        <path d="M14 26 C46 8 82 8 114 26" {...sl(12, "#e8a35a")} />
        <path d="M30 20 C50 12 78 12 98 20" {...sl(3, "#ffd8a8")} />
        <circle cx="42" cy="44" r="7" fill="#e5484d" {...ln} strokeWidth={2.5} />
        <circle cx="88" cy="42" r="7" fill="#e5484d" {...ln} strokeWidth={2.5} />
        <circle cx="64" cy="94" r="6" fill="#e5484d" {...ln} strokeWidth={2.5} />
        <ellipse cx="55" cy="60" rx="3.2" ry="4.4" fill={OL} />
        <ellipse cx="73" cy="60" rx="3.2" ry="4.4" fill={OL} />
        <path d="M58 69 Q64 75 70 69" {...sl(3)} />
        {cheeks(49, 79, 68, 4)}
      </>
    ),
  },
  {
    id: "rainbow",
    label: "Rainbow",
    svg: (
      <>
        {backing(
          <>
            <path d="M24 96 A40 40 0 0 1 104 96" fill="none" strokeWidth={54} strokeLinecap="butt" />
            <path d={CLOUD} transform="translate(28 98)" />
            <path d={CLOUD} transform="translate(100 98) scale(-1 1)" />
          </>,
        )}
        <path d="M8 96 A56 56 0 0 1 120 96" {...sl(10, OL)} strokeLinecap="butt" />
        {(
          [
            [56, "#ff5e7e"],
            [48, "#ffa94d"],
            [40, "#ffd84d"],
            [32, "#4cd08a"],
            [24, "#5ec8ff"],
          ] as const
        ).map(([r, c]) => (
          <path key={r} d={`M${64 - r} 96 A${r} ${r} 0 0 1 ${64 + r} 96`} {...sl(8, c)} strokeLinecap="butt" />
        ))}
        <path d="M44 96 A20 20 0 0 1 84 96" {...sl(3, OL)} strokeLinecap="butt" />
        <path d={CLOUD} transform="translate(28 98)" fill={W} {...ln} />
        <path d={CLOUD} transform="translate(100 98) scale(-1 1)" fill={W} {...ln} />
        <path d="M22 100 Q26 103 30 100" {...sl(2.5)} />
        <path d="M98 100 Q102 103 106 100" {...sl(2.5)} />
        {twinkle(64, 22, 0.7, "#ff8fa3")}
      </>
    ),
  },
  {
    id: "cool-sun",
    label: "Sunny vibes",
    svg: (
      <>
        {backing(
          <>
            {SUN_RAYS.map((d) => (
              <path key={d} d={d} />
            ))}
            <circle cx="64" cy="64" r="36" />
          </>,
        )}
        {SUN_RAYS.map((d) => (
          <path key={d} d={d} fill="#ffa94d" {...ln} strokeWidth={2.5} />
        ))}
        <circle cx="64" cy="64" r="36" fill="#ffc83d" {...ln} />
        <ellipse cx="50" cy="40" rx="10" ry="5" transform="rotate(-30 50 40)" {...SHINE} />
        <path d="M30 56 H98" {...sl(4)} />
        <path d="M34 54 H60 V62 C60 70 54 74 47 74 C40 74 34 70 34 62Z" fill={OL} />
        <path d="M68 54 H94 V62 C94 70 88 74 81 74 C74 74 68 70 68 62Z" fill={OL} />
        <path d="M40 58 L46 58 M74 58 L80 58" {...sl(3, "#8e72ff")} />
        <path d="M52 84 Q64 94 76 84" {...sl(4)} />
        {cheeks(40, 88, 82, 5)}
      </>
    ),
  },
  {
    id: "rain-cloud",
    label: "Feeling blue",
    svg: (
      <>
        {backing(
          <>
            <path d={CLOUD} transform="translate(64 58) scale(2.1)" />
            <circle cx="40" cy="104" r="10" />
            <circle cx="64" cy="112" r="10" />
            <circle cx="88" cy="104" r="10" />
          </>,
        )}
        <path d={CLOUD} transform="translate(64 58) scale(2.1)" fill="#dde6f5" {...ln} strokeWidth={1.5} />
        <path d="M24 74 C40 82 90 82 104 74 C110 72 112 76 108 78 C92 86 38 86 22 78Z" fill="#b9c8e4" opacity={0.7} />
        <ellipse cx="46" cy="40" rx="11" ry="5" transform="rotate(-20 46 40)" fill={W} opacity={0.8} />
        <path d="M44 56 Q50 52 56 56 M72 56 Q78 52 84 56" {...sl(3.5)} />
        <path d="M56 72 Q64 66 72 72" {...sl(3.5)} />
        <path d="M50 60 V74 M78 60 V74" {...sl(4, "#5ec8ff")} />
        {drop(40, 104, 0.9)}
        {drop(64, 112, 0.9)}
        {drop(88, 104, 0.9)}
      </>
    ),
  },
  {
    id: "rocket",
    label: "To the moon",
    svg: (
      <>
        {backing(
          <g transform="rotate(40 64 64)">
            <path d={ROCKET_BODY} />
            <path d="M44 58 L28 84 L44 86Z M84 58 L100 84 L84 86Z" />
            <path d="M52 84 C52 100 64 116 64 116 C64 116 76 100 76 84Z" />
          </g>,
        )}
        <g transform="rotate(40 64 64)">
          <path d="M52 84 C52 100 64 116 64 116 C64 116 76 100 76 84Z" fill="#ffa94d" {...ln} />
          <path d="M58 84 C58 94 64 104 64 104 C64 104 70 94 70 84Z" fill="#ffd84d" />
          <path d="M44 58 L28 84 L44 86Z" fill="#ff5e7e" {...ln} />
          <path d="M84 58 L100 84 L84 86Z" fill="#ff5e7e" {...ln} />
          <path d={ROCKET_BODY} fill="#f4f2fb" {...ln} />
          <path d="M64 10 C72 16 78 24 81 32 H47 C50 24 56 16 64 10Z" fill="#ff5e7e" {...ln} />
          <rect x="48" y="76" width="32" height="9" rx="3" fill="#7c5cff" {...ln} />
          <circle cx="64" cy="50" r="10" fill="#5ec8ff" stroke="#7c5cff" strokeWidth={5} />
          <circle cx="64" cy="50" r="12.5" fill="none" stroke={OL} strokeWidth={2} />
          <circle cx="60" cy="46" r="3" fill={W} />
          <path d="M52 40 V66" {...sl(3, "#d9d2ff")} />
        </g>
        {twinkle(22, 24, 0.8)}
        {twinkle(108, 100, 0.6, "#7c5cff")}
      </>
    ),
  },
  {
    id: "crown",
    label: "Royalty",
    svg: (
      <>
        {backing(
          <>
            <path d={CROWN} />
            <rect x="16" y="88" width="96" height="20" rx="5" />
            <circle cx="14" cy="36" r="8" />
            <circle cx="64" cy="22" r="8" />
            <circle cx="114" cy="36" r="8" />
          </>,
        )}
        <path d={CROWN} fill="#ffc83d" {...ln} />
        <path d="M24 44 L28 88 H40Z" fill={W} opacity={0.35} />
        <rect x="16" y="88" width="96" height="20" rx="5" fill="#f5a623" {...ln} />
        <circle cx="14" cy="36" r="7" fill="#ff5e7e" {...ln} />
        <circle cx="64" cy="22" r="7" fill="#7c5cff" {...ln} />
        <circle cx="114" cy="36" r="7" fill="#3fd0c9" {...ln} />
        <path d="M64 64 L72 74 L64 84 L56 74Z" fill="#5ec8ff" {...ln} />
        <circle cx="38" cy="98" r="4" fill="#ff5e7e" {...ln} strokeWidth={2} />
        <circle cx="64" cy="98" r="4" fill="#7c5cff" {...ln} strokeWidth={2} />
        <circle cx="90" cy="98" r="4" fill="#3fd0c9" {...ln} strokeWidth={2} />
        {twinkle(100, 14, 0.6, W)}
      </>
    ),
  },
  {
    id: "hi-bubble",
    label: "Hi!",
    svg: (
      <>
        {backing(<path d={BUBBLE_L} />)}
        <path d={BUBBLE_L} fill="#7c5cff" {...ln} />
        <path d="M20 30 H60" {...sl(4, W)} opacity={0.35} />
        {bubbleText("HI!", W, 46, 74)}
        {twinkle(112, 18, 0.8)}
      </>
    ),
  },
  {
    id: "lol-bubble",
    label: "LOL",
    svg: (
      <>
        {backing(<path d={BUBBLE_R} transform="rotate(-6 64 64)" />)}
        <g transform="rotate(-6 64 64)">
          <path d={BUBBLE_R} fill="#ff5e7e" {...ln} />
          <path d="M20 30 H60" {...sl(4, W)} opacity={0.35} />
          {bubbleText("LOL", W, 40, 72)}
        </g>
        {drop(16, 20, 0.7, -30)}
      </>
    ),
  },
  {
    id: "ok-bubble",
    label: "OK",
    svg: (
      <>
        {backing(
          <>
            <circle cx="64" cy="60" r="46" />
            <path d="M34 90 L22 116 L54 100Z" />
          </>,
        )}
        <path d="M34 90 L22 116 L54 100Z" fill="#22c38e" {...ln} />
        <circle cx="64" cy="60" r="46" fill="#22c38e" {...ln} />
        <path d="M34 92 L28 104" stroke="#22c38e" strokeWidth={8} />
        <path d="M34 40 C40 30 50 24 60 22" {...sl(4, W)} opacity={0.4} />
        {bubbleText("OK", W, 38, 66)}
        <path d="M52 80 L60 88 L78 74" {...sl(5, W)} />
      </>
    ),
  },
  {
    id: "thx-bubble",
    label: "Thanks",
    svg: (
      <>
        {backing(
          <>
            <path d={BUBBLE_R} />
            <path d="M104 18 C100 10 88 12 90 22 C91 28 98 32 104 36 C110 32 117 28 118 22 C120 12 108 10 104 18Z" />
          </>,
        )}
        <path d={BUBBLE_R} fill="#ffc83d" {...ln} />
        <path d="M20 30 H60" {...sl(4, W)} opacity={0.45} />
        {bubbleText("THX", OL, 40, 72)}
        <path d="M104 18 C100 10 88 12 90 22 C91 28 98 32 104 36 C110 32 117 28 118 22 C120 12 108 10 104 18Z" fill="#ff5e7e" {...ln} />
      </>
    ),
  },
  {
    id: "gift",
    label: "A gift for you",
    svg: (
      <>
        {backing(
          <>
            <rect x="22" y="56" width="84" height="56" rx="6" />
            <rect x="16" y="42" width="96" height="18" rx="5" />
            <ellipse cx="50" cy="32" rx="16" ry="10" transform="rotate(20 50 32)" />
            <ellipse cx="78" cy="32" rx="16" ry="10" transform="rotate(-20 78 32)" />
          </>,
        )}
        <ellipse cx="50" cy="32" rx="16" ry="10" transform="rotate(20 50 32)" fill="#ffd84d" {...ln} />
        <ellipse cx="78" cy="32" rx="16" ry="10" transform="rotate(-20 78 32)" fill="#ffd84d" {...ln} />
        <rect x="22" y="56" width="84" height="56" rx="6" fill="#7c5cff" {...ln} />
        <rect x="22" y="56" width="20" height="56" fill="#6a4ae8" opacity={0.6} />
        <rect x="16" y="42" width="96" height="18" rx="5" fill="#9b7bff" {...ln} />
        <rect x="56" y="42" width="16" height="70" fill="#ffd84d" {...ln} />
        <circle cx="64" cy="40" r="7" fill="#ffc83d" {...ln} />
        {twinkle(110, 20, 0.8, "#ff8fa3")}
        {twinkle(16, 92, 0.6)}
      </>
    ),
  },
  {
    id: "hundred",
    label: "100 percent",
    svg: (
      <>
        <g transform="rotate(-8 64 64)">
          <text
            x="64"
            y="76"
            textAnchor="middle"
            fontFamily={FONT}
            fontWeight={900}
            fontStyle="italic"
            fontSize="52"
            fill="#ff3b5c"
            stroke={W}
            strokeWidth={12}
            strokeLinejoin="round"
            paintOrder="stroke"
          >
            100
          </text>
          <text x="64" y="76" textAnchor="middle" fontFamily={FONT} fontWeight={900} fontStyle="italic" fontSize="52" fill="#ff3b5c" stroke={OL} strokeWidth={2}>
            100
          </text>
          <path d="M18 88 H110 M24 100 H104" {...sl(16, W)} />
          <path d="M18 88 H110 M24 100 H104" {...sl(9, OL)} />
          <path d="M18 88 H110 M24 100 H104" {...sl(5, "#ff3b5c")} />
        </g>
      </>
    ),
  },
  {
    id: "cool-dog",
    label: "Cool dog",
    svg: (
      <>
        {backing(
          <>
            <ellipse cx="22" cy="58" rx="13" ry="26" transform="rotate(18 22 58)" />
            <ellipse cx="106" cy="58" rx="13" ry="26" transform="rotate(-18 106 58)" />
            <ellipse cx="64" cy="66" rx="42" ry="44" />
            <ellipse cx="72" cy="108" rx="8" ry="11" />
          </>,
        )}
        <ellipse cx="64" cy="66" rx="42" ry="44" fill="#e8b07a" {...ln} />
        <path d="M64 24 C54 26 50 36 54 44 C58 50 70 50 74 44 C78 36 74 26 64 24Z" fill="#fff4e6" />
        <ellipse cx="22" cy="58" rx="13" ry="26" transform="rotate(18 22 58)" fill="#8b5a3c" {...ln} />
        <ellipse cx="106" cy="58" rx="13" ry="26" transform="rotate(-18 106 58)" fill="#8b5a3c" {...ln} />
        <ellipse cx="72" cy="104" rx="7" ry="10" fill="#ff6b81" {...ln} />
        <path d="M72 98 V106" {...sl(2, "#e23c63")} />
        <ellipse cx="64" cy="88" rx="24" ry="18" fill="#fff4e6" {...ln} />
        <ellipse cx="64" cy="80" rx="8" ry="5.5" fill={OL} />
        <ellipse cx="61" cy="78" rx="2.5" ry="1.5" fill={W} />
        <path d="M64 86 V92 M54 94 Q64 100 74 94" {...sl(3)} />
        <path d="M24 56 H104" {...sl(4)} />
        <path d="M30 54 H58 V60 C58 68 52 72 45 72 C37 72 30 68 30 60Z" fill={OL} />
        <path d="M70 54 H98 V60 C98 68 91 72 83 72 C76 72 70 68 70 60Z" fill={OL} />
        <path d="M36 58 L44 58 M76 58 L84 58" {...sl(3, "#8e72ff")} />
      </>
    ),
  },
];

const STICKER_MAP: Map<string, StickerDef> = new Map(STICKERS.map((s) => [s.id, s]));

export const STICKER_IDS: Set<string> = new Set(STICKERS.map((s) => s.id));

const STICKER_SHADOW = { filter: "drop-shadow(0 2px 3px rgb(20 16 40 / 0.22))" };

/** Renders a sticker by id at the given pixel size; unknown ids render a neutral placeholder. */
export function Sticker({ id, size = 128, className }: { id: string; size?: number; className?: string }) {
  const def = STICKER_MAP.get(id);
  if (!def) {
    return (
      <svg
        role="img"
        aria-label="Sticker unavailable"
        viewBox="0 0 128 128"
        width={size}
        height={size}
        className={cn("shrink-0 select-none", className)}
      >
        <rect x="10" y="10" width="108" height="108" rx="28" className="fill-surface-2 stroke-border" strokeWidth={3} />
        <text x="64" y="82" textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize="48" className="fill-muted">
          ?
        </text>
      </svg>
    );
  }
  return (
    <svg
      role="img"
      aria-label={def.label}
      viewBox="0 0 128 128"
      width={size}
      height={size}
      overflow="visible"
      style={STICKER_SHADOW}
      className={cn("shrink-0 select-none", className)}
    >
      {def.svg}
    </svg>
  );
}

/** Responsive grid of all built-in stickers. */
export function StickerPicker({ onSelect, className }: { onSelect: (id: string) => void; className?: string }) {
  return (
    <div className={cn("@container w-full", className)}>
      <div className="scrollbar-thin max-h-72 overflow-y-auto overscroll-contain p-1">
        <div className="grid grid-cols-4 gap-1.5 @min-[22rem]:grid-cols-5 @min-[28rem]:grid-cols-6">
          {STICKERS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-label={s.label}
              title={s.label}
              onClick={() => onSelect(s.id)}
              className="flex aspect-square items-center justify-center rounded-2xl p-1.5 transition-[transform,background-color] duration-150 ease-out hover:scale-110 hover:bg-surface-2 active:scale-95 focus-visible:bg-surface-2"
            >
              <Sticker id={s.id} size={72} className="h-full w-full" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
