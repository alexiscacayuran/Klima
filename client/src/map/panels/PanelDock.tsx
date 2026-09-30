import { useState } from "react";
import { LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSelection } from "@/map/state/useSelection";
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
  const { pinned, station } = useSelection();
  const open = detailOpen ? "detail" : overviewOpen ? "overview" : null;

  // Which panel the empty slot folds away: the last one that was up. Kept
  // through the close so the panel that is leaving is the one that animates
  // out, and adjusted during render so no frame draws the other one.
  const [last, setLast] = useState<"detail" | "overview">(open ?? "overview");
  if (open && open !== last) setLast(open);

  // A detail panel whose subject went away (open water was clicked) would
  // spend its exit on the "select a place" notice, so it goes at once. An
  // explicit close keeps the subject, and folds away like the overview.
  const hasSubject = pinned !== null || station !== null;
  const panel = open ?? (last === "detail" && !hasSubject ? null : last);
  const closed = open === null;

  return (
    // `items-start`: a panel is as tall as what is in it, and the dock's own
    // height is only the ceiling it may not pass (the panels cap themselves at
    // `max-h-full`). Stretching them to the dock would give every panel the
    // same tall box whatever it held, with an empty overview reaching down to
    // the legend.
    //
    // A grid of one cell, and everything in it: the button and the panel are
    // stacked rather than swapped, so one can fade out over the other in the
    // same corner. The row is the dock's full height, which is what gives the
    // panels' `max-h-full` a definite height to resolve against.
    //
    // Overview and detail are one element slot, not two: switching between
    // them swaps the contents of the frame rather than fading one frame over
    // another, which is the point of their sharing it (see SidePanel).
    <div
      className={cn(
        "pointer-events-none grid grid-rows-[minmax(0,1fr)] items-start justify-items-end",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Open overview"
        title="Overview"
        onClick={openOverview}
        data-closed={!closed || undefined}
        inert={!closed}
        className={cn(
          // The panel header's own 44px, so the button stands exactly where
          // the header it replaces did.
          "panel-launcher pointer-events-auto flex size-11 shrink-0 items-center justify-center [grid-area:1/1]",
          "rounded-panel border border-line bg-panel text-fg-body shadow-panel backdrop-blur-md",
          "cursor-pointer outline-none",
          "hover:border-brand-medium hover:text-fg-heading",
          "focus-visible:ring-3 focus-visible:ring-brand/50",
        )}
      >
        <LayoutList aria-hidden className="size-[18px]" />
      </button>
      {panel === "detail" ? (
        <DetailPanel className={PANEL_CLASS} closed={closed} />
      ) : panel === "overview" ? (
        <OverviewPanel className={PANEL_CLASS} closed={closed} />
      ) : null}
    </div>
  );
}

/**
 * The dock's corner is the top right, so that is where a panel folds to.
 *
 * The cell is named on the frame itself, not on the dock's children: the
 * detail panel's root is its Tabs, drawn `display: contents`, and a contents
 * box has no grid placement of its own — the frame inside it becomes the grid
 * item, and without this it is auto-placed into a second row below the dock.
 */
const PANEL_CLASS = "max-h-full origin-top-right [grid-area:1/1]";
