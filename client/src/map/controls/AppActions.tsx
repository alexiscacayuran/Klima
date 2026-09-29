import { Info, Settings } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { SettingsPanel } from "./SettingsPanel";

type AppActionsProps = {
  onOpenAbout?: () => void;
  className?: string;
};

/**
 * The two global actions, Settings and About, in the map's top-right corner.
 *
 * Only as wide as the two buttons: the cell MapChrome puts them in is wider,
 * to mirror the rail's column, and the rest of that cell stays draggable map.
 */
export function AppActions({ onOpenAbout, className }: AppActionsProps) {
  return (
    <div className={cn("pointer-events-auto flex gap-2 font-cis", className)}>
      {/* Settings owns its popover rather than handing a click up like About
          does: what it opens is chrome of these actions, not a panel the map
          lays out. End-aligned so it opens inward from the corner. */}
      <Popover>
        <PopoverTrigger
          render={<BarAction icon={Settings} label="Settings" />}
        />
        <PopoverContent
          align="end"
          sideOffset={8}
          className={cn(
            "w-64 rounded-panel border border-line bg-panel-strong p-3 font-cis",
            "text-fg-body shadow-float ring-0 backdrop-blur-md",
          )}
        >
          <SettingsPanel />
        </PopoverContent>
      </Popover>
      <BarAction icon={Info} label="About" onClick={onOpenAbout} />
    </div>
  );
}

/**
 * The CIS "secondary" button: a neutral fill one step off the panel, a stronger
 * border than the panel's own, and the glint every solid button in the system
 * carries. Text firms up to heading colour on hover rather than the fill
 * carrying the whole state change; a button whose popup is open holds that
 * hover look, so it reads as the thing the popup belongs to.
 *
 * Remaining props go through to the Button, which is what lets a popover
 * trigger render it and attach its own handlers, ref and ARIA state.
 */
function BarAction({
  icon: Icon,
  label,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "children"> & {
  icon: typeof Settings;
  label: string;
}) {
  return (
    <Button
      size="sm"
      {...props}
      className={cn(
        "h-8 gap-2 rounded-panel border-line-strong bg-panel px-3 text-sm",
        "text-fg-body shadow-glint backdrop-blur-md",
        "hover:bg-line hover:text-fg-heading focus-visible:ring-line",
        "data-popup-open:bg-line data-popup-open:text-fg-heading",
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </Button>
  );
}
