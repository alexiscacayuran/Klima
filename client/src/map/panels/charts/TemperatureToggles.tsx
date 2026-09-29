import type { CSSProperties } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { TEMPERATURE_COLORS } from "./chartStyle";
import {
  TEMPERATURE_NAMES,
  type TemperatureQuantity,
} from "./temperatureSeries";

/**
 * Which temperatures a plot draws, on its title's row: a checkbox each, filled
 * with the temperature's colour when on and outlined in it when off, so the
 * toggles double as the plot's colour key. The names stay in the body's ink,
 * as the key's do.
 *
 * A temperature the station publishes nothing for is shown, unticked and
 * disabled, rather than dropped: the set of toggles stays the same from one
 * station to the next.
 */
export function TemperatureToggles<Q extends TemperatureQuantity>({
  label,
  quantities,
  picked,
  published,
  onChange,
}: {
  /** What the group picks, for a screen reader: "Temperatures plotted". */
  label: string;
  /** Every toggle, in the order they are listed and drawn. */
  quantities: readonly Q[];
  picked: readonly Q[];
  published: readonly Q[];
  /** The new pick, in `quantities`' order, so the series keep their stacking. */
  onChange: (picked: Q[]) => void;
}) {
  const toggle = (quantity: Q, on: boolean) =>
    onChange(
      quantities.filter((each) =>
        each === quantity ? on : picked.includes(each),
      ),
    );

  return (
    <div role="group" aria-label={label} className="flex items-center gap-3">
      {quantities.map((quantity) => {
        const disabled = !published.includes(quantity);
        return (
          <label
            key={quantity}
            className="flex items-center gap-1.5 text-[11px] text-fg-body select-none has-data-disabled:opacity-50"
          >
            <Checkbox
              checked={picked.includes(quantity) && !disabled}
              disabled={disabled}
              onCheckedChange={(checked) => toggle(quantity, checked)}
              className="border-(--series) data-checked:border-(--series) data-checked:bg-(--series) data-checked:text-white disabled:opacity-100 dark:data-checked:bg-(--series)"
              style={
                { "--series": TEMPERATURE_COLORS[quantity] } as CSSProperties
              }
            />
            {TEMPERATURE_NAMES[quantity]}
          </label>
        );
      })}
    </div>
  );
}
