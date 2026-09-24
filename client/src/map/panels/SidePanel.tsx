import type { ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type SidePanelProps = {
  /**
   * The panel's name: the header's title, and its accessible name either way.
   */
  title: string;
  /**
   * Drawn in the title's place when given — the detail panel's tabs — so the
   * header keeps its height and its controls at the other end.
   */
  heading?: ReactNode;
  /** Controls at the header's right end — a close button, say. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * The frame both right-hand panels are drawn in.
 *
 * One component rather than two copies of the same classes because the
 * overview and detail panels take turns in one slot: sharing the frame is what
 * makes them the same size, so switching between them swaps the contents of a
 * box rather than replacing the box.
 *
 * The rail's parts on the other side of the map — the panel fill, hairline and
 * radius, a 44px header — so the two read as the two edges of one chrome.
 *
 * The width is a default rather than a fixture — the detail panel widens to
 * half the viewport — but everything else is fixed here, which is what keeps
 * the two panels the same object in two states.
 *
 * A flex column so the caller's height cap reaches the body: the ScrollArea is
 * the one child allowed to shrink, and scrolls whatever does not fit.
 */
export function SidePanel({
  title,
  heading,
  actions,
  children,
  className,
}: SidePanelProps) {
  return (
    <section
      aria-label={title}
      className={cn(
        // The width is the caller's: the detail panel changes its own, and
        // twMerge lets that override this default rather than fight it.
        "pointer-events-auto flex w-[360px] flex-col font-cis",
        "transition-[width] duration-200 ease-out motion-reduce:transition-none",
        "overflow-hidden rounded-panel border border-line bg-panel-strong shadow-panel backdrop-blur-md",
        className,
      )}
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line pr-2 pl-3.5">
        {heading ?? (
          <h2 className="text-sm font-semibold text-fg-heading">{title}</h2>
        )}
        {/* Grouped, so `justify-between` puts the title at one end and the
            whole set of controls at the other rather than spreading them. */}
        {actions && <div className="flex items-center gap-0.5">{actions}</div>}
      </header>
      <ScrollArea className="flex min-h-0 flex-col">{children}</ScrollArea>
    </section>
  );
}

/** A square icon button for a panel header, in the chrome's quiet ink. */
export function PanelIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-field text-fg-subtle outline-none",
        "transition-colors duration-150 hover:bg-well hover:text-fg-heading",
        "focus-visible:ring-3 focus-visible:ring-brand/50",
        "[&_svg]:size-4",
      )}
    >
      {children}
    </button>
  );
}
