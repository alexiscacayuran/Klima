import { cn } from "@/lib/utils";
import { isPale } from "@/map/utils/ink";
import { BAND_OPACITY, BODY, INK, NORMAL_DASH, SURFACE } from "./chartStyle";

/**
 * The marks the seasonal charts draw besides bars and lines, and the glyphs
 * their keys use for every mark.
 *
 * Every mark differs from the others by shape as well as colour — a bar, a
 * whisker, a dash; a solid line, a band, a dashed line — so a chart still reads
 * printed in grey, and each key draws the mark's own shape rather than a
 * swatch standing in for it.
 */

/** Half a normal's dash: a little past the 24px bar it marks on each side. */
const DASH_REACH = 15;

/**
 * A month's normal, as a dash across its bar: `Scatter`'s shape, centred on
 * the month by the category axis it shares with the bars.
 *
 * A dash per month rather than a line through the months, which would claim
 * a normal between two of them. Ink rather than a hue, so it cannot be taken
 * for a category on the percent-of-normal chart below it; and drawn over a
 * halo of the panel's colour, so it reads crossing the bar as well as clear of
 * it.
 */
export function NormalDash({ cx, cy }: { cx?: number; cy?: number }) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const line = {
    x1: cx! - DASH_REACH,
    x2: cx! + DASH_REACH,
    y1: cy,
    y2: cy,
    strokeLinecap: "round",
  } as const;
  return (
    <g>
      <line {...line} stroke={SURFACE} strokeWidth={6.5} />
      <line {...line} stroke={INK} strokeWidth={2.5} />
    </g>
  );
}

/**
 * A filled mark's key: a bar or a segment. Edged in the body ink when the fill
 * is too pale to see on the panel, as the bar it keys is.
 */
export function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2.5 shrink-0 rounded-[2px]",
        isPale(color) && "ring-1 ring-fg-body ring-inset",
      )}
      style={{ background: color }}
    />
  );
}

/** The normal's key: its dash. */
export function DashGlyph() {
  return (
    <svg aria-hidden width={14} height={10} className="shrink-0">
      <line
        x1={2}
        x2={12}
        y1={5}
        y2={5}
        stroke={INK}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The spread's key: a whisker, capped at both ends. */
export function WhiskerGlyph() {
  return (
    <svg aria-hidden width={10} height={12} className="shrink-0">
      <path d="M2 1.5h6M5 1.5v9M2 10.5h6" stroke={INK} strokeWidth={1.5} />
    </svg>
  );
}

/** A reference line's key: the line, dashed as it is drawn. */
export function ReferenceGlyph() {
  return (
    <svg aria-hidden width={14} height={10} className="shrink-0">
      <line
        x1={0}
        x2={14}
        y1={5}
        y2={5}
        stroke={BODY}
        strokeWidth={1}
        strokeDasharray="3 2"
      />
    </svg>
  );
}

/** A forecast line's key: the line, with the dot each month carries. */
export function LineGlyph({ color }: { color: string }) {
  return (
    <svg aria-hidden width={16} height={10} className="shrink-0">
      <line x1={1} x2={15} y1={5} y2={5} stroke={color} strokeWidth={2} />
      <circle cx={8} cy={5} r={3} fill={color} />
    </svg>
  );
}

/** A range band's key: a patch of the band. */
export function BandGlyph({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="h-2.5 w-3.5 shrink-0 rounded-[2px]"
      style={{ background: color, opacity: BAND_OPACITY * 2 }}
    />
  );
}

/** A normal line's key: the line, dashed and coloured as it is drawn. */
export function NormalLineGlyph({ color = INK }: { color?: string }) {
  return (
    <svg aria-hidden width={16} height={10} className="shrink-0">
      <line
        x1={0}
        x2={16}
        y1={5}
        y2={5}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={NORMAL_DASH}
      />
    </svg>
  );
}
