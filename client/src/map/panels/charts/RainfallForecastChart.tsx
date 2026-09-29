import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ErrorBar,
  ReferenceArea,
  Scatter,
  XAxis,
  YAxis,
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
  type KeyItem,
} from "./ChartFrame";
import {
  AXIS_INSET,
  BLUE,
  CURRENT_FILL,
  CURRENT_OPACITY,
  GRID,
  INK,
  plotClass,
  tooltipClass,
  tooltipMonth,
  whole,
} from "./chartStyle";
import { DashGlyph, NormalDash, Swatch, WhiskerGlyph } from "./markers";
import type { RainfallChartMonth } from "./rainfallSeries";

export type RainfallForecastChartProps = {
  rows: readonly RainfallChartMonth[];
  /** The timeline's month, lit. */
  currentDate: string | null;
};

/**
 * The forecast total per month, in mm, as a bar — with whatever the
 * resolution publishes to read it against: a province's max and min as a
 * whisker over the bar, a station's normal as a dash across it.
 *
 * The max and min are whiskers, not bars of their own: they are the spread of
 * the one forecast, and a bar each would draw them as two more forecasts from
 * zero. Each month stands alone — no line or band runs between them, which
 * would claim values for the weeks in between.
 */
export function RainfallForecastChart({
  rows,
  currentDate,
}: RainfallForecastChartProps) {
  const hasMean = rows.some((row) => row.mean !== null);
  const hasSpread = rows.some((row) => row.spread !== null);
  const hasNormal = rows.some((row) => row.normal !== null);
  const ticks = millimetreTicks(
    Math.max(
      ...rows.flatMap((row) => [row.mean ?? 0, row.max ?? 0, row.normal ?? 0]),
    ),
  );

  const config = {
    mean: { label: "Mean", color: BLUE },
    normal: { label: "Normal", color: INK },
  } satisfies ChartConfig;

  const key: KeyItem[] = [
    { key: "mean", label: "Mean", glyph: <Swatch color={BLUE} /> },
    ...(hasSpread
      ? [{ key: "spread", label: "Range (min–max)", glyph: <WhiskerGlyph /> }]
      : []),
    ...(hasNormal
      ? [{ key: "normal", label: "Normal", glyph: <DashGlyph /> }]
      : []),
  ];

  return (
    <ChartFigure
      title="Forecast"
      unit="mm"
      legend={hasMean && <ChartKey items={key} />}
    >
      {!hasMean ? (
        <EmptyPlot>No forecast published.</EmptyPlot>
      ) : (
        <ChartContainer config={config} className={plotClass("h-44")}>
          <ComposedChart
            data={rows as RainfallChartMonth[]}
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
              domain={[0, ticks[ticks.length - 1]]}
              ticks={ticks}
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
                  // The whole month off the bar's one entry: the whisker has
                  // none, and the dash's are left out (see the Scatter).
                  formatter={(_value, _name, item) => {
                    const row = item.payload as RainfallChartMonth;
                    return (
                      <div className="grid w-full gap-1.5">
                        <TooltipRow
                          glyph={<Swatch color={BLUE} />}
                          label="Mean"
                          value={whole(row.mean, " mm")}
                        />
                        {row.min !== null && row.max !== null && (
                          <TooltipRow
                            glyph={<WhiskerGlyph />}
                            label="Range"
                            value={`${whole(row.min)}–${whole(row.max)} mm`}
                          />
                        )}
                        {row.normal !== null && (
                          <TooltipRow
                            glyph={<DashGlyph />}
                            label="Normal"
                            value={whole(row.normal, " mm")}
                          />
                        )}
                      </div>
                    );
                  }}
                />
              }
            />
            <Bar
              dataKey="mean"
              fill="var(--color-mean)"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            >
              {hasSpread && (
                <ErrorBar
                  dataKey="spread"
                  direction="y"
                  width={8}
                  strokeWidth={1.5}
                  stroke={INK}
                />
              )}
            </Bar>
            {hasNormal && (
              <Scatter
                dataKey="normal"
                fill="var(--color-normal)"
                shape={<NormalDash />}
                // A scatter point enters a shared tooltip as its x and its y,
                // which would print the month's date as a figure. The bar's
                // entry prints the normal instead.
                tooltipType="none"
              />
            )}
          </ComposedChart>
        </ChartContainer>
      )}
    </ChartFigure>
  );
}

/**
 * Round steps for a monthly total, from a dry month's tens to a typhoon
 * month's thousand.
 */
const STEPS = [10, 20, 25, 50, 100, 200, 250, 500, 1000];

/**
 * The y axis's ticks: from 0 to past the tallest mark — bar, whisker or dash —
 * in the smallest round step that needs no more than five. Recharts' own
 * choice is even but not round (0, 350, 700, 1050), and a reader reads a
 * rainfall total against 250 more easily than against 350.
 */
function millimetreTicks(top: number): number[] {
  const step = STEPS.find((each) => top / each <= 5) ?? 1000;
  const count = Math.max(1, Math.ceil(top / step));
  return Array.from({ length: count + 1 }, (_, index) => index * step);
}
