import { Fragment, useState } from "react";
import { Area, Line } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartFigure, ChartKey, EmptyPlot, TooltipRow } from "./ChartFrame";
import {
  BAND_OPACITY,
  celsius,
  figure,
  INK,
  NORMAL_DASH,
  TEMPERATURE_COLORS,
} from "./chartStyle";
import { BandGlyph, NormalLineGlyph } from "./markers";
import { TemperaturePlot } from "./TemperaturePlot";
import { TemperatureToggles } from "./TemperatureToggles";
import {
  NORMAL_NAMES,
  TEMPERATURE_KEYS,
  type TemperatureChartMonth,
} from "./temperatureSeries";

/** The two temperatures the issuance publishes a range for, hot to cool. */
const EXTREMES = ["tmax", "tmin"] as const;
type Extreme = (typeof EXTREMES)[number];

/** Each range as the table names its row. */
const RANGE_NAMES: Record<Extreme, string> = {
  tmax: "Max range",
  tmin: "Min range",
};

const config = Object.fromEntries(
  EXTREMES.flatMap((quantity) => {
    const { normal, range } = TEMPERATURE_KEYS[quantity];
    const color = TEMPERATURE_COLORS[quantity];
    return [
      [range, { label: RANGE_NAMES[quantity], color }],
      [normal, { label: NORMAL_NAMES[quantity], color }],
    ] as const;
  }),
) satisfies ChartConfig;

/**
 * The key says what the two marks mean, in ink, as Forecast's does. Which
 * extreme a band is is said by its colour, and the colours are keyed by the
 * toggles above.
 */
const KEY = [
  { key: "range", label: "Range", glyph: <BandGlyph color={INK} /> },
  { key: "normal", label: "Normal", glyph: <NormalLineGlyph /> },
];

/**
 * The max and the min as the low–high range the issuance publishes for each, a
 * band, with its normal a dashed line across it: where the month's extreme
 * could fall, against where it usually is.
 *
 * Either can be taken off, as on Forecast, and the axis refits to the other:
 * the two ranges overlap in most months, and one read alone is not tinted by
 * the other's wash.
 *
 * The forecast itself is on Forecast, beside the same normals, so this plot is
 * the ranges alone. The mean has no range, so it is not here at all.
 */
export function TemperatureRangeChart({
  rows,
  currentDate,
}: {
  rows: readonly TemperatureChartMonth[];
  currentDate: string | null;
}) {
  const [picked, setPicked] = useState<readonly Extreme[]>(EXTREMES);
  const ranged = EXTREMES.filter((quantity) =>
    rows.some((row) => row[TEMPERATURE_KEYS[quantity].range] !== null),
  );
  const shown = ranged.filter((quantity) => picked.includes(quantity));

  return (
    <ChartFigure
      title="Extreme ranges"
      unit="°C"
      controls={
        ranged.length > 0 && (
          <TemperatureToggles
            label="Ranges plotted"
            quantities={EXTREMES}
            picked={picked}
            published={ranged}
            onChange={setPicked}
          />
        )
      }
      legend={ranged.length > 0 && <ChartKey items={KEY} />}
    >
      {ranged.length === 0 ? (
        <EmptyPlot>No ranges published.</EmptyPlot>
      ) : shown.length === 0 ? (
        <EmptyPlot>Tick a range above to plot it.</EmptyPlot>
      ) : (
        <Plot rows={rows} shown={shown} currentDate={currentDate} />
      )}
    </ChartFigure>
  );
}

function Plot({
  rows,
  shown,
  currentDate,
}: {
  rows: readonly TemperatureChartMonth[];
  /** At least one, in EXTREMES' order. */
  shown: readonly Extreme[];
  currentDate: string | null;
}) {
  const values = rows.flatMap((row) =>
    shown
      .flatMap((quantity) => {
        const { normal, range } = TEMPERATURE_KEYS[quantity];
        return [row[normal], ...(row[range] ?? [])];
      })
      .filter((value): value is number => value !== null),
  );

  return (
    <TemperaturePlot
      rows={rows}
      currentDate={currentDate}
      config={config}
      values={values}
      tooltip={(row) =>
        shown.map((quantity) => {
          const { normal, range } = TEMPERATURE_KEYS[quantity];
          const color = TEMPERATURE_COLORS[quantity];
          const spread = row[range];
          return (
            <Fragment key={quantity}>
              <TooltipRow
                glyph={<BandGlyph color={color} />}
                label={RANGE_NAMES[quantity]}
                value={
                  spread
                    ? `${figure(spread[0], { decimals: 1 })}–${celsius(spread[1])}`
                    : celsius(null)
                }
              />
              {row[normal] !== null && (
                <TooltipRow
                  glyph={<NormalLineGlyph color={color} />}
                  label={NORMAL_NAMES[quantity]}
                  value={celsius(row[normal])}
                />
              )}
            </Fragment>
          );
        })
      }
    >
      {/* Both bands under both lines, so neither wash tints the other
          temperature's normal where the two ranges meet. */}
      {shown.map((quantity, index) => (
        <Area
          key={TEMPERATURE_KEYS[quantity].range}
          dataKey={TEMPERATURE_KEYS[quantity].range}
          type="linear"
          fill={TEMPERATURE_COLORS[quantity]}
          fillOpacity={BAND_OPACITY}
          stroke="none"
          activeDot={false}
          // The first band carries the whole month into the tooltip.
          tooltipType={index === 0 ? undefined : "none"}
        />
      ))}
      {shown.map((quantity) => (
        <Line
          key={TEMPERATURE_KEYS[quantity].normal}
          dataKey={TEMPERATURE_KEYS[quantity].normal}
          type="linear"
          stroke={TEMPERATURE_COLORS[quantity]}
          strokeWidth={1.5}
          strokeDasharray={NORMAL_DASH}
          dot={false}
          activeDot={false}
          tooltipType="none"
        />
      ))}
    </TemperaturePlot>
  );
}
