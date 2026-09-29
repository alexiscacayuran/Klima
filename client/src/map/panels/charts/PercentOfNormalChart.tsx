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
import { RAINFALL_PERCENT_OF_NORMAL_SCALE } from "@/map/config/colorScales";
import {
  ChartFigure,
  ChartKey,
  EmptyPlot,
  MonthTick,
  TooltipRow,
} from "./ChartFrame";
import {
  AXIS_INSET,
  BODY,
  CURRENT_FILL,
  CURRENT_OPACITY,
  GRID,
  plotClass,
  tooltipClass,
  tooltipMonth,
  whole,
} from "./chartStyle";
import { ReferenceGlyph, Swatch } from "./markers";
import type { RainfallChartMonth } from "./rainfallSeries";

const SCALE = RAINFALL_PERCENT_OF_NORMAL_SCALE;

/**
 * Gridlines on the class boundaries — 40, 80, 120 — so a bar's category can be
 * read off where its top falls as well as off its colour, and in grey.
 */
const STEP = 40;

/** Never shorter than one step past the last boundary, so "above" has room. */
const MIN_TOP = 160;

const config = {
  pctNormal: { label: "% of normal" },
} satisfies ChartConfig;

/** The key: the published categories in the published colours, then normal. */
const KEY = [
  ...SCALE.classes.map((category) => ({
    key: category.range,
    label: category.label ?? category.range,
    glyph: <Swatch color={category.color} />,
  })),
  { key: "normal", label: "Normal (100%)", glyph: <ReferenceGlyph /> },
];

/**
 * The colour a percent of normal is — its category's, off the published
 * scale the map paints with (config/colorScales). Classed rather than
 * interpolated: a bar says which category the month is in, and the layer is
 * declared as classes (config/rasters).
 */
function CategoryBar(props: BarShapeProps) {
  const value = (props.payload as RainfallChartMonth | undefined)?.pctNormal;
  if (value == null) return null;
  return <Rectangle {...props} fill={SCALE.classAt(value).color} />;
}

/**
 * The forecast as a percent of its normal, a bar per month in the colour of
 * its category, over a dashed line at 100%.
 *
 * One axis and one series, coloured by category: the colour restates the
 * height in the words PAGASA issues — way below, below, near, above — which is
 * what a reader of this chart is asking.
 */
export function PercentOfNormalChart({
  rows,
  currentDate,
}: {
  rows: readonly RainfallChartMonth[];
  currentDate: string | null;
}) {
  const values = rows.flatMap((row) =>
    row.pctNormal === null ? [] : [row.pctNormal],
  );
  const top = Math.max(
    MIN_TOP,
    (Math.floor(Math.max(...values) / STEP) + 1) * STEP,
  );
  const ticks = Array.from(
    { length: top / STEP + 1 },
    (_, index) => index * STEP,
  );

  return (
    <ChartFigure
      title="Percent of normal"
      legend={values.length > 0 && <ChartKey items={KEY} />}
    >
      {values.length === 0 ? (
        <EmptyPlot>No percent of normal published.</EmptyPlot>
      ) : (
        <ChartContainer config={config} className={plotClass("h-44")}>
          <BarChart
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
              domain={[0, top]}
              ticks={ticks}
              tickFormatter={(value: number) => `${value}%`}
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
                    const value = (item.payload as RainfallChartMonth)
                      .pctNormal;
                    const category =
                      value === null ? null : SCALE.classAt(value);
                    return (
                      <TooltipRow
                        glyph={
                          category ? (
                            <Swatch color={category.color} />
                          ) : (
                            <span className="size-2.5 shrink-0" />
                          )
                        }
                        label={category?.label ?? "% of normal"}
                        value={whole(value, "%")}
                      />
                    );
                  }}
                />
              }
            />
            <ReferenceLine
              y={100}
              stroke={BODY}
              strokeDasharray="3 2"
              ifOverflow="extendDomain"
            />
            <Bar
              dataKey="pctNormal"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              shape={CategoryBar}
            />
          </BarChart>
        </ChartContainer>
      )}
    </ChartFigure>
  );
}
