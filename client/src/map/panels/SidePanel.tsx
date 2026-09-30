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
  /**
   * Put away, but still mounted: faded and shrunk into its corner, hidden and
   * inert once there, so closing plays as well as opening (see `.side-panel`
   * in index.css). The caller names the corner with an `origin-*` class.
   */
  closed?: boolean;
  className?: string;
};

/**
 * The frame the side panels are drawn in: the product rail on the left, the
 * overview and detail panels on the right.
 *
 * One component rather than copies of the same classes because the overview
 * and detail panels take turns in one slot: sharing the frame is what makes
 * them the same size, so switching between them swaps the contents of a box
 * rather than replacing the box. The rail uses it for the other half of that
 * reason — the same fill, hairline, radius and 44px header with its close
 * button, so the two edges of the chrome are one object on either side.
 *
 * The width is a default rather than a fixture — the rail is narrower, and the
 * detail panel widens to half the viewport — but everything else is fixed
 * here, which is what keeps the panels the same object in different states.
 *
 * A flex column so the caller's height cap reaches the body: the ScrollArea is
 * the one child allowed to shrink, and scrolls whatever does not fit.
 */
export function SidePanel({
  title,
  heading,
  actions,
  children,
  closed = false,
  className,
}: SidePanelProps) {
  return (
    <section
      aria-label={title}
      data-closed={closed || undefined}
      inert={closed}
      className={cn(
        // The width is the caller's: the detail panel changes its own, and
        // twMerge lets that override this default rather than fight it. Its
        // transition is in `.side-panel`, with the open and close.
        "side-panel pointer-events-auto flex w-[360px] flex-col font-cis",
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
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex size-7 items-center justify-center rounded-field text-fg-subtle outline-none",
        "transition-colors duration-150 hover:bg-well hover:text-fg-heading",
        "focus-visible:ring-3 focus-visible:ring-brand/50",
        "disabled:pointer-events-none disabled:opacity-40",
        "[&_svg]:size-4",
      )}
    >
      {children}
    </button>
  );
}
