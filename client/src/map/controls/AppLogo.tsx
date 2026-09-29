import { cn } from "@/lib/utils";

/**
 * The wordmark, floating in the map's top-left corner.
 *
 * Not a card: it heads the left-hand column, over the product rail, but it is a
 * mark rather than a control, so it floats on the map with nothing drawn round
 * it. The search bar's height, so it is centred on the same line across the
 * top row, and flush with the rail's left edge below it.
 *
 * With no panel behind it, what keeps it legible over a basemap or a rainfall
 * surface is a halo in the panel's own colour — the map labels' approach, in
 * the chrome's ink. One wide, faint blur rather than a hard edge: it lifts the
 * mark off whatever is under it without drawing a glow round the letters. A
 * drop-shadow filter rather than a text-shadow, so the logo gets the same halo
 * as the name. Pointer events pass through: there is nothing to click, and the
 * map under it stays draggable.
 */
export function AppLogo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-12 items-center gap-3 font-cis",
        "[filter:drop-shadow(0_0_10px_color-mix(in_srgb,var(--cis-panel-solid)_55%,transparent))]",
        className,
      )}
    >
      {/* alt is empty on purpose: the wordmark beside it already says Klima,
          and a described logo would announce the name twice. */}
      <img
        src="/favicon.svg"
        alt=""
        width={23}
        height={22}
        className="block shrink-0"
      />
      <span className="text-base font-bold tracking-[-0.01em] text-fg-heading">
        Klima
      </span>
    </div>
  );
}
