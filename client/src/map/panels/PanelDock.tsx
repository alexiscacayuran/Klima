import { LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidePanels } from "@/map/state/useSidePanels";
import { DetailPanel } from "./DetailPanel";
import { OverviewPanel } from "./OverviewPanel";

export type PanelDockProps = {
  /**
   * Placement, as a box with a definite height — a top *and* a bottom, not a
   * max-height — so the panel's `max-h-full` has something to resolve against.
   */
  className?: string;
};

/**
 * The right-hand side of the chrome: one slot, two panels and a button.
 *
 * The slot holds exactly one thing at a time, in the same top-right corner.
 * Either panel covers the button while it is up — the button is the empty
 * slot's own face, not a control beside the panels — so the chrome takes the
 * room of one panel and never of a panel plus a rail.
 *
 * The overview is up at startup. Closing either panel leaves the slot empty:
 * closing the detail panel does not bring the overview back, because it was
 * dismissed on the way in and reopening it would undo that on the user's
 * behalf. The button is how it comes back.
 *
 * Right-aligned rather than absolutely positioned so the detail panel can
 * widen leftwards from the same right edge (see DetailPanel).
 */
export function PanelDock({ className }: PanelDockProps) {
  const { overviewOpen, openOverview, detailOpen } = useSidePanels();

  return (
    // `items-start`: a panel is as tall as what is in it, and the dock's own
    // height is only the ceiling it may not pass (the panels cap themselves at
    // `max-h-full`). Stretching them to the dock would give every panel the
    // same tall box whatever it held, with an empty overview reaching down to
    // the legend.
    <div
      className={cn(
        "pointer-events-none flex items-start justify-end",
        className,
      )}
    >
      {detailOpen ? (
        <DetailPanel className="max-h-full" />
      ) : overviewOpen ? (
        <OverviewPanel className="max-h-full" />
      ) : (
        <button
          type="button"
          aria-label="Open overview"
          title="Overview"
          onClick={openOverview}
          className={cn(
            // The panel header's own 44px, so the button stands exactly where
            // the header it replaces did.
            "pointer-events-auto flex size-11 shrink-0 items-center justify-center",
            "rounded-panel border border-line bg-panel text-fg-body shadow-panel backdrop-blur-md",
            "cursor-pointer outline-none transition-colors duration-150",
            "hover:border-brand-medium hover:text-fg-heading",
            "focus-visible:ring-3 focus-visible:ring-brand/50",
          )}
        >
          <LayoutList aria-hidden className="size-[18px]" />
        </button>
      )}
    </div>
  );
}
