import { LayoutList, X } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { findProduct, productIdFromKey } from "@/map/config/products";
import { useSidePanels } from "@/map/state/useSidePanels";
import { useSelection } from "@/map/state/useSelection";
import { PanelIconButton, SidePanel } from "./SidePanel";

export type OverviewPanelProps = {
  /** Placement and height cap from the dock; the frame sizes its own width. */
  className?: string;
};

/**
 * A summary of the selected product as a whole — the right-hand slot's
 * resting state.
 *
 * Open at startup, and dismissed either by its own close button or by the
 * detail panel taking the slot. It does not come back on its own when the
 * detail panel closes — the button the empty slot leaves behind is how it
 * returns (see PanelDock).
 *
 * CIS publishes no such summary yet, so this is the space it will fill, named
 * for the product the rail has selected so it is clear what the summary will
 * be *of*.
 */
export function OverviewPanel({ className }: OverviewPanelProps) {
  const { variable } = useSelection();
  const { closeOverview } = useSidePanels();
  const product = variable ? findProduct(productIdFromKey(variable)) : undefined;

  return (
    <SidePanel
      title="Overview"
      className={className}
      actions={
        <PanelIconButton label="Close overview" onClick={closeOverview}>
          <X aria-hidden />
        </PanelIconButton>
      }
    >
      <Empty className="gap-3 px-6 py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-well text-fg-subtle">
            <LayoutList />
          </EmptyMedia>
          <EmptyTitle className="text-[13px] text-fg-heading">
            {product ? `${product.label} summary` : "Summary"}
          </EmptyTitle>
          <EmptyDescription className="text-[12px] text-fg-body">
            Not available yet. Select a place or a station on the map for its
            detail.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </SidePanel>
  );
}
