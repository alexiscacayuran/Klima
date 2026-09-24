import { useId } from "react";
import { MapPinMinus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStationVisibility } from "@/map/state/useStationVisibility";
import { cn } from "@/lib/utils";

/**
 * Switches that change how the map draws what is selected, not what is
 * selected.
 *
 * A row, because each entry is one icon and one switch, and more will join it
 * — the setters in MapSettings are the seams they plug into. Each switch is its
 * own <OptionSwitch> so the row stays a plain list of them.
 *
 * Boxed exactly like the single-bar legend in the opposite corner — `p-2`, a
 * `h-5` row, the same border — so the two read as a matched pair of corner
 * panels on the bottom row. The controls are sized down to fit that row
 * rather than the row being stretched to fit them.
 */
export function MapOptions({ className }: { className?: string }) {
  const stations = useStationVisibility();

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-3 p-2",
        "rounded-panel border border-line bg-panel-strong font-cis shadow-float backdrop-blur-md",
        className,
      )}
    >
      <OptionSwitch
        label="Station visibility"
        icon={MapPinMinus}
        checked={stations.visible}
        onCheckedChange={stations.setVisible}
        // Off and disabled where the layer has no stations; on and disabled
        // where it has nothing else. Either way the switch stays in the row, so
        // it does not jump in and out as the rail selection changes.
        disabled={!stations.available || stations.locked}
        reason={
          !stations.available
            ? "This layer publishes no station data"
            : stations.locked
              ? "This layer publishes station data only"
              : undefined
        }
      />
    </div>
  );
}

type OptionSwitchProps = {
  /** The control's name: its tooltip and its accessible name. */
  label: string;
  icon: LucideIcon;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Why it is disabled, when it is. Added to the tooltip under the name. */
  reason?: string;
};

/**
 * An icon and a switch, named by a tooltip rather than a visible label so the
 * row stays one legend-row tall.
 *
 * The trigger is the whole pair rather than the switch, so a disabled switch —
 * which takes no pointer events of its own — still explains itself on hover.
 */
function OptionSwitch({
  label,
  icon: Icon,
  checked,
  onCheckedChange,
  disabled,
  reason,
}: OptionSwitchProps) {
  const id = useId();

  return (
    <Tooltip>
      <TooltipTrigger
        render={<div className="flex h-5 items-center gap-1.5 px-0.5" />}
      >
        {/* Dimmed here rather than by Label's own `peer-disabled`, which only
            reaches a label placed *after* its switch. */}
        <Label
          htmlFor={id}
          className={cn("text-fg-body", disabled && "opacity-50")}
        >
          <Icon aria-hidden className="size-4" />
          <span className="sr-only">{label}</span>
        </Label>
        <Switch
          id={id}
          size="sm"
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          className="data-checked:bg-brand"
        />
      </TooltipTrigger>
      <TooltipContent className="font-cis">
        {label}
        {disabled && reason && <span className="opacity-70">· {reason}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
