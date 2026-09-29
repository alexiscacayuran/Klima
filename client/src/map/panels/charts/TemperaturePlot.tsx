import type { ReactNode } from "react";
import {
  CartesianGrid,
  ComposedChart,
  ReferenceArea,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { MonthTick } from "./ChartFrame";
import {
  AXIS_INSET,
  CURRENT_FILL,
  CURRENT_OPACITY,
  GRID,
  plotClass,
  tooltipClass,
  tooltipMonth,
} from "./chartStyle";
import type { TemperatureChartMonth } from "./temperatureSeries";

/**
 * The plot the temperature line charts share — the forecast with its normals,
 * and the extremes with their ranges: the months across, a fitted degree axis,
 * the timeline's month lit. The chart hands it the series to draw.
 *
 * Lines rather than rainfall's bars: a temperature is a level on a continuous
 * scale, not an amount counted up from zero, so the axis is fitted to the
 * values and nothing is drawn from 0 °C — a bar from there would be all
 * baseline, with the month's story in its last few pixels. The departure from
 * normal, which is the part that is an amount, is its own bar chart (see
 * TemperatureAnomalyChart).
 */
export function TemperaturePlot({
  rows,
  currentDate,
  config,
  values,
  tooltip,
  children,
}: {
  rows: readonly TemperatureChartMonth[];
  /** The timeline's month, lit. */
  currentDate: string | null;
  config: ChartConfig;
  /** Every figure the series draw, which the y axis is fitted to. */
  values: readonly number[];
  /**
   * A month's rows in the tooltip, drawn off the one series that carries it —
   * every other series is `tooltipType="none"`, so the month is listed once.
   */
  tooltip: (row: TemperatureChartMonth) => ReactNode;
  /** The series: `Line`s and `Area`s over `TemperatureChartMonth` keys. */
  children: ReactNode;
}) {
  const ticks = degreeTicks(Math.min(...values), Math.max(...values));
  const decimals = ticks[1] - ticks[0] < 1 ? 1 : 0;

  return (
    <ChartContainer config={config} className={plotClass("h-44")}>
      <ComposedChart
        data={rows as TemperatureChartMonth[]}
        margin={{ top: 8, right: 12, bottom: 0, left: AXIS_INSET }}
      >
        <CartesianGrid vertical={false} stroke={GRID} />
        {currentDate && (
          <ReferenceArea
            x1={currentDate}
            x2={currentDate}
            fill={CURRENT_FILL}
            fillOpacity={CURRENT_OPACITY}
            stroke="none"
          />
        )}
        {/* Banded, as a chart with bars is by default: a month is a column,
            its point at the column's middle. So the lit month is a column
            here too, and the months stand over the anomaly bars below. */}
        <XAxis
          dataKey="date"
          scale="band"
          tickLine={false}
          axisLine={false}
          interval={0}
          height={20}
          tick={<MonthTick dy="0.71em" current={currentDate} />}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={36}
          domain={[ticks[0], ticks[ticks.length - 1]]}
          ticks={ticks}
          tickFormatter={(value: number) => value.toFixed(decimals)}
        />
        <ChartTooltip
          // No hover band: the lit band is the timeline's month, and the
          // tooltip's heading already names the month under the pointer.
          cursor={false}
          // Kept when the carrying series has no value that month, so the
          // month's other figures still show.
          filterNull={false}
          content={
            <ChartTooltipContent
              className={tooltipClass}
              labelClassName="text-fg-heading"
              labelFormatter={(_, payload) =>
                tooltipMonth(payload?.[0]?.payload?.date)
              }
              formatter={(_value, _name, item) => (
                <div className="grid w-full gap-1.5">
                  {tooltip(item.payload as TemperatureChartMonth)}
                </div>
              )}
            />
          }
        />
        {children}
      </ComposedChart>
    </ChartContainer>
  );
}

/** Round steps for a temperature axis, from half a degree to ten. */
const STEPS = [0.5, 1, 2, 5, 10];

/**
 * Never narrower than this: a flat forecast on a fitted axis would otherwise
 * spread a tenth of a degree over the whole plot and read as a swing.
 */
const MIN_SPAN = 2;

/**
 * The y axis's ticks: round steps from just under the lowest mark to just over
 * the highest, in the smallest step that needs no more than six.
 */
function degreeTicks(low: number, high: number): number[] {
  const pad = Math.max(0, MIN_SPAN - (high - low)) / 2;
  const from = low - pad;
  const to = high + pad;
  const step =
    STEPS.find((each) => Math.ceil(to / each) - Math.floor(from / each) <= 6) ??
    STEPS[STEPS.length - 1];
  const first = Math.floor(from / step);
  const last = Math.ceil(to / step);
  return Array.from({ length: last - first + 1 }, (_, index) =>
    Number(((first + index) * step).toFixed(1)),
  );
}
