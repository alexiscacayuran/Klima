import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
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
import type { Tercile } from "@/map/config/colorScales";
import { TERCILE_NAMES } from "@/map/config/detailRows";
import { inkOn } from "@/map/utils/ink";
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
  CURRENT_FILL,
  CURRENT_OPACITY,
  GREEN,
  GRID,
  SURFACE,
  plotClass,
  tooltipClass,
  tooltipMonth,
  whole,
  YELLOW,
} from "./chartStyle";
import { Swatch } from "./markers";
import { TERCILE_KEYS, type RainfallChartMonth } from "./rainfallSeries";

/**
 * Driest to wettest, left to right: the order the stack is drawn in, the key
 * lists and the tooltip reads — fixed, so an outcome is always in the same
 * place whichever is likeliest.
 */
const ORDER = ["below", "near", "above"] as const satisfies readonly Tercile[];

/**
 * One colour per outcome, and the same one every month: here the colour says
 * *which* outcome, and the segment's length says how likely it is.
 *
 * Percent of normal's colours for the outcomes of the same names (see
 * chartStyle), so below, near and above normal read the same on both charts
 * of the card.
 */
const COLORS: Record<Tercile, string> = {
  below: YELLOW,
  near: GREEN,
  above: BLUE,
};

const config = Object.fromEntries(
  ORDER.map((tercile) => [
    TERCILE_KEYS[tercile],
    { label: TERCILE_NAMES[tercile], color: COLORS[tercile] },
  ]),
) satisfies ChartConfig;

const KEY = ORDER.map((tercile) => ({
  key: tercile,
  label: TERCILE_NAMES[tercile],
  glyph: <Swatch color={COLORS[tercile]} />,
}));

/** The outer ends of the stack are rounded; the joins between outcomes are not. */
const RADII: Record<Tercile, [number, number, number, number]> = {
  below: [4, 0, 0, 4],
  near: [0, 0, 0, 0],
  above: [0, 4, 4, 0],
};

/** A row's height, and the bar's inside it. */
const ROW = 28;
const BAR = 16;
/** The narrowest segment a percentage fits inside with room either side. */
const LABEL_MIN_WIDTH = 34;

/**
 * The chance of each outcome — below, near or above normal — as one bar per
 * month split between the three, summing to 100%.
 *
 * A stack rather than three bars, because the three are one statement: the
 * probability is split between them, and they are read against each other.
 * Only the likeliest outcome is labelled with its figure, where it fits — the
 * one a reader wants first, and what the station's pill on the map prints.
 */
export function TercileProbabilityChart({
  rows,
  currentDate,
}: {
  rows: readonly RainfallChartMonth[];
  currentDate: string | null;
}) {
  const data = rows as RainfallChartMonth[];
  const published = data.some((row) => row.likeliest !== null);

  return (
    <ChartFigure
      title="Probabilistic forecast"
      legend={published && <ChartKey items={KEY} />}
    >
      {!published ? (
        <EmptyPlot>No probabilities published.</EmptyPlot>
      ) : (
        <ChartContainer
          config={config}
          className={plotClass("")}
          style={{ height: data.length * ROW + 28 }}
        >
          <BarChart
            data={data}
            layout="vertical"
            // Room on the right for half of the "100%" tick, which is centred on
            // the plot's edge.
            margin={{ top: 4, right: 18, bottom: 0, left: AXIS_INSET }}
            barSize={BAR}
          >
            <CartesianGrid horizontal={false} stroke={GRID} />
            {currentDate && (
              <ReferenceArea
                y1={currentDate}
                y2={currentDate}
                fill={CURRENT_FILL}
                fillOpacity={CURRENT_OPACITY}
                stroke="none"
              />
            )}
            <XAxis
              type="number"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(value: number) => `${value}%`}
              tickLine={false}
              axisLine={false}
              height={20}
            />
            <YAxis
              type="category"
              dataKey="date"
              tickLine={false}
              axisLine={false}
              width={36}
              interval={0}
              tick={<MonthTick dy="0.355em" current={currentDate} />}
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
                  formatter={(value, name) => {
                    const tercile = ORDER.find(
                      (each) => TERCILE_KEYS[each] === name,
                    )!;
                    return (
                      <TooltipRow
                        glyph={<Swatch color={COLORS[tercile]} />}
                        label={TERCILE_NAMES[tercile]}
                        value={whole(value as number | null, "%")}
                      />
                    );
                  }}
                />
              }
            />
            {ORDER.map((tercile) => (
              <Bar
                key={tercile}
                dataKey={TERCILE_KEYS[tercile]}
                stackId="tercile"
                fill={`var(--color-${TERCILE_KEYS[tercile]})`}
                radius={RADII[tercile]}
                // The 2px gap between outcomes, in the panel's colour.
                stroke={SURFACE}
                strokeWidth={2}
              >
                <LabelList
                  dataKey={TERCILE_KEYS[tercile]}
                  content={(props) => {
                    const row = data[Number(props.index)];
                    const width = Number(props.width);
                    if (row?.likeliest !== tercile || width < LABEL_MIN_WIDTH) {
                      return null;
                    }
                    return (
                      <text
                        x={Number(props.x) + width / 2}
                        y={Number(props.y) + Number(props.height) / 2}
                        dy="0.355em"
                        textAnchor="middle"
                        className="font-cis-mono text-[10px] font-medium"
                        style={{ fill: inkOn(COLORS[tercile]) }}
                      >
                        {whole(Number(props.value), "%")}
                      </text>
                    );
                  }}
                />
              </Bar>
            ))}
          </BarChart>
        </ChartContainer>
      )}
    </ChartFigure>
  );
}
