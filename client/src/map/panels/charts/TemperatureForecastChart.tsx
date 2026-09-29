import { Fragment, useState } from "react";
import { Line } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartFigure, ChartKey, EmptyPlot, TooltipRow } from "./ChartFrame";
import {
  celsius,
  forecastDot,
  INK,
  NORMAL_DASH,
  TEMPERATURE_COLORS,
} from "./chartStyle";
import { LineGlyph, NormalLineGlyph } from "./markers";
import { TemperaturePlot } from "./TemperaturePlot";
import { TemperatureToggles } from "./TemperatureToggles";
import {
  NORMAL_NAMES,
  TEMPERATURE_KEYS,
  TEMPERATURE_NAMES,
  TEMPERATURE_QUANTITIES,
  type TemperatureChartMonth,
  type TemperatureQuantity,
} from "./temperatureSeries";

const config = Object.fromEntries(
  TEMPERATURE_QUANTITIES.flatMap((quantity) => {
    const color = TEMPERATURE_COLORS[quantity];
    return [
      [quantity, { label: TEMPERATURE_NAMES[quantity], color }],
      [
        TEMPERATURE_KEYS[quantity].normal,
        { label: NORMAL_NAMES[quantity], color },
      ],
    ] as const;
  }),
) satisfies ChartConfig;

/**
 * The key says what the two strokes mean, in ink. Which temperature a line is
 * is said by its colour, and the colours are keyed by the toggles above.
 */
const KEY = [
  { key: "forecast", label: "Forecast", glyph: <LineGlyph color={INK} /> },
  { key: "normal", label: "Normal", glyph: <NormalLineGlyph /> },
];

/**
 * The max, the mean and the min on one plot, each forecast a solid line and
 * its normal a dashed one in the same colour, so each month reads as three
 * departures at once — and the day's spread as the gap between the red and the
 * blue.
 *
 * Any of the three can be taken off, and the axis refits to what is left: the
 * mean's month-to-month change is a fraction of the max–min gap, and flattens
 * into a line with both on. A temperature the station publishes nothing for
 * cannot be put on.
 *
 * A month with no forecast is a gap in its line, not a point joined across.
 */
export function TemperatureForecastChart({
  rows,
  currentDate,
}: {
  rows: readonly TemperatureChartMonth[];
  currentDate: string | null;
}) {
  const [picked, setPicked] = useState<readonly TemperatureQuantity[]>(
    TEMPERATURE_QUANTITIES,
  );
  const published = TEMPERATURE_QUANTITIES.filter((quantity) =>
    rows.some(
      (row) =>
        row[quantity] !== null ||
        row[TEMPERATURE_KEYS[quantity].normal] !== null,
    ),
  );
  const shown = published.filter((quantity) => picked.includes(quantity));

  return (
    <ChartFigure
      title="Forecast"
      unit="°C"
      controls={
        <TemperatureToggles
          label="Temperatures plotted"
          quantities={TEMPERATURE_QUANTITIES}
          picked={picked}
          published={published}
          onChange={setPicked}
        />
      }
      legend={<ChartKey items={KEY} />}
    >
      {shown.length === 0 ? (
        <EmptyPlot>Tick a temperature above to plot it.</EmptyPlot>
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
  /** At least one, in TEMPERATURE_QUANTITIES' order. */
  shown: readonly TemperatureQuantity[];
  currentDate: string | null;
}) {
  const values = rows.flatMap((row) =>
    shown
      .flatMap((quantity) => [
        row[quantity],
        row[TEMPERATURE_KEYS[quantity].normal],
      ])
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
          const color = TEMPERATURE_COLORS[quantity];
          const normal = row[TEMPERATURE_KEYS[quantity].normal];
          return (
            <Fragment key={quantity}>
              <TooltipRow
                glyph={<LineGlyph color={color} />}
                label={TEMPERATURE_NAMES[quantity]}
                value={celsius(row[quantity])}
              />
              {normal !== null && (
                <TooltipRow
                  glyph={<NormalLineGlyph color={color} />}
                  label={NORMAL_NAMES[quantity]}
                  value={celsius(normal)}
                />
              )}
            </Fragment>
          );
        })
      }
    >
      {/* Every normal under every forecast, so no dashed line cuts through
          another temperature's dots. */}
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
      {shown.map((quantity, index) => {
        const dot = forecastDot(TEMPERATURE_COLORS[quantity]);
        return (
          <Line
            key={quantity}
            dataKey={quantity}
            type="linear"
            stroke={TEMPERATURE_COLORS[quantity]}
            strokeWidth={2}
            dot={dot}
            activeDot={{ ...dot, r: 5 }}
            // The first line carries the whole month into the tooltip.
            tooltipType={index === 0 ? undefined : "none"}
          />
        );
      })}
    </TemperaturePlot>
  );
}
