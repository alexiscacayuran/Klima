import {
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
  type BarShapeProps,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  ChartFigure,
  ChartKey,
  EmptyPlot,
  MonthTick,
  TooltipRow,
} from "./ChartFrame";
import {
  AXIS_INSET,
  BLUE,
  BODY,
  CURRENT_FILL,
  CURRENT_OPACITY,
  figure,
  GRID,
  plotClass,
  RED,
  tooltipClass,
  tooltipMonth,
} from "./chartStyle";
import { Swatch } from "./markers";
import type { TemperatureChartMonth } from "./temperatureSeries";

const config = {
  tmeanAnomaly: { label: "Anomaly" },
} satisfies ChartConfig;

const KEY = [
  { key: "warm", label: "Warmer than normal", glyph: <Swatch color={RED} /> },
  { key: "cool", label: "Cooler than normal", glyph: <Swatch color={BLUE} /> },
];

/** What a departure means, in words, for the tooltip. */
const direction = (value: number) =>
  Number(value.toFixed(1)) > 0
    ? "Warmer than normal"
    : Number(value.toFixed(1)) < 0
      ? "Cooler than normal"
      : "Normal";

/**
 * A departure as a bar from the zero line, in its direction's colour and
 * rounded at the end away from zero — the data end, whichever way it points.
 * Two hues and no third: the midpoint is the zero line, and a month on it
 * draws nothing.
 *
 * Normalised here rather than trusted: for a value under zero recharts hands
 * the shape a negative height, and a Rectangle's corners are read from its
 * top.
 */
function AnomalyBar(props: BarShapeProps) {
  const value = (props.payload as TemperatureChartMonth | undefined)
    ?.tmeanAnomaly;
  if (value == null) return null;
  const top = Math.min(props.y ?? 0, (props.y ?? 0) + (props.height ?? 0));
  const height = Math.abs(props.height ?? 0);
  const warm = value >= 0;
  return (
    <Rectangle
      {...props}
      y={top}
      height={height}
      fill={warm ? RED : BLUE}
      radius={warm ? [4, 4, 0, 0] : [0, 0, 4, 4]}
    />
  );
}

/**
 * How far each month's mean temperature departs from its normal, in °C: a
 * bar up for warmer, down for cooler.
 *
 * The one temperature drawn as bars. A departure is an amount measured from a
 * real zero — normal — so its length means something, where a temperature's
 * does not (see TemperaturePlot). The axis is symmetric, so a degree
 * above and a degree below are the same length.
 */
export function TemperatureAnomalyChart({
  rows,
  currentDate,
}: {
  rows: readonly TemperatureChartMonth[];
  currentDate: string | null;
}) {
  const values = rows.flatMap((row) =>
    row.tmeanAnomaly === null ? [] : [row.tmeanAnomaly],
  );
  const ticks = anomalyTicks(Math.max(0, ...values.map(Math.abs)));
  const decimals = ticks[1] - ticks[0] < 0.5 ? 2 : 1;

  return (
    <ChartFigure
      title="Anomaly"
      unit="°C"
      legend={values.length > 0 && <ChartKey items={KEY} />}
    >
      {values.length === 0 ? (
        <EmptyPlot>No anomaly published.</EmptyPlot>
      ) : (
        <ChartContainer config={config} className={plotClass("h-40")}>
          <BarChart
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
            <XAxis
              dataKey="date"
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
              tickFormatter={(value: number) =>
                value === 0 ? "0" : figure(value, { decimals, signed: true })
              }
            />
            <ChartTooltip
              // No hover band: the lit band is the timeline's month, and the
              // tooltip's heading already names the month under the pointer.
              cursor={false}
              content={
                <ChartTooltipContent
                  className={tooltipClass}
                  labelClassName="text-fg-heading"
                  labelFormatter={(_, payload) =>
                    tooltipMonth(payload?.[0]?.payload?.date)
                  }
                  formatter={(_value, _name, item) => {
                    const value = (item.payload as TemperatureChartMonth)
                      .tmeanAnomaly;
                    return (
                      <TooltipRow
                        glyph={
                          <Swatch
                            color={value !== null && value < 0 ? BLUE : RED}
                          />
                        }
                        label={value === null ? "Anomaly" : direction(value)}
                        value={figure(value, {
                          decimals: 1,
                          suffix: " °C",
                          signed: true,
                        })}
                      />
                    );
                  }}
                />
              }
            />
            {/* Normal: the baseline both directions are measured from, solid
                and a step darker than the gridlines. */}
            <ReferenceLine y={0} stroke={BODY} />
            <Bar dataKey="tmeanAnomaly" maxBarSize={24} shape={AnomalyBar} />
          </BarChart>
        </ChartContainer>
      )}
    </ChartFigure>
  );
}

/** Round steps for a departure, from a quarter of a degree to five. */
const STEPS = [0.25, 0.5, 1, 2, 5];

/**
 * The y axis's ticks: symmetric about zero, reaching past the largest
 * departure either way, in the smallest round step that needs no more than
 * two each side.
 */
function anomalyTicks(reach: number): number[] {
  const step =
    STEPS.find((each) => reach / each <= 2) ?? STEPS[STEPS.length - 1];
  const count = Math.max(1, Math.ceil(reach / step));
  return Array.from(
    { length: 2 * count + 1 },
    (_, index) => (index - count) * step,
  );
}
