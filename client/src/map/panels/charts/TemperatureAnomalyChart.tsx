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
import { TEMPERATURE_ANOMALY_SCALE } from "@/map/config/colorScales";
import type { ScaleClass } from "@/map/config/colorScales";
import { symbologyModeFor } from "@/map/config/rasters";
import { DEFAULT_PRODUCT_ID, variableKey } from "@/map/config/products";
import { isPale } from "@/map/utils/ink";
import {
  AXIS_INSET,
  BODY,
  CURRENT_FILL,
  CURRENT_OPACITY,
  figure,
  GRID,
  plotClass,
  tooltipClass,
  tooltipMonth,
} from "./chartStyle";
import { Swatch } from "./markers";
import type { TemperatureChartMonth } from "./temperatureSeries";

const config = {
  tmeanAnomaly: { label: "Anomaly" },
} satisfies ChartConfig;

const SCALE = TEMPERATURE_ANOMALY_SCALE;

/**
 * A departure's colour: the anomaly layer's own, under the mode the layer
 * declares, so a bar is the colour the same month's station pill is.
 */
const MODE = symbologyModeFor(
  variableKey(DEFAULT_PRODUCT_ID, "temperature", "anomaly"),
);
const paint = (value: number) => SCALE.colorFor(value, MODE);

/** What a departure means, in words — the published class name. */
const meaning = (value: number) => {
  const cls = SCALE.classAt(value);
  return cls.label ?? cls.range;
};

/**
 * The key: the classes the plotted months fall in, in the scale's order, coolest
 * first. Not all seven — a chart of six months rarely spans more than three,
 * and a key of classes nothing on the plot is drawn in is a legend for a
 * different chart. The map's legend lists the whole table.
 */
function keyFor(values: readonly number[]) {
  const shown = new Set<ScaleClass>(values.map((value) => SCALE.classAt(value)));
  return SCALE.classes
    .filter((cls) => shown.has(cls))
    .map((cls) => ({
      key: String(cls.from),
      label: cls.label ?? cls.range,
      glyph: <Swatch color={cls.color} />,
    }));
}

/**
 * A departure as a bar from the zero line, in its class's colour and rounded
 * at the end away from zero — the data end, whichever way it points. A month
 * on the zero line draws nothing. Near average is published as white, so a
 * bar in it is drawn with an edge in the body ink, or it would not be seen.
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
  const fill = paint(value);
  return (
    <Rectangle
      {...props}
      y={top}
      height={height}
      fill={fill}
      stroke={isPale(fill) ? BODY : undefined}
      strokeWidth={1}
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
      legend={values.length > 0 && <ChartKey items={keyFor(values)} />}
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
                          value !== null && <Swatch color={paint(value)} />
                        }
                        label={value === null ? "Anomaly" : meaning(value)}
                        // Two decimals, the legend's own, as the table prints
                        // the anomaly.
                        value={figure(value, {
                          decimals: 2,
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
