import { useMemo } from "react";
import type { ReactNode } from "react";
import type { SeasonalMonth, SeasonalStationMonth } from "@/api/seasonal";
import { PROVINCE_GROUPS, STATION_GROUPS } from "@/map/config/detailRows";
import { useSelection } from "@/map/state/useSelection";
import { ForecastAccordion } from "../ForecastAccordion";
import { EmptyPlot } from "./ChartFrame";
import { PercentOfNormalChart } from "./PercentOfNormalChart";
import { RainfallForecastChart } from "./RainfallForecastChart";
import {
  provinceRainfall,
  stationRainfall,
  type RainfallChartMonth,
} from "./rainfallSeries";
import { TemperatureAnomalyChart } from "./TemperatureAnomalyChart";
import { TemperatureForecastChart } from "./TemperatureForecastChart";
import { TemperatureRangeChart } from "./TemperatureRangeChart";
import {
  stationTemperature,
  type TemperatureChartMonth,
} from "./temperatureSeries";
import { TercileProbabilityChart } from "./TercileProbabilityChart";

/**
 * The Chart tab: the same cards as the Table tab (see ForecastAccordion), one
 * per variable, each over its variable's charts instead of its table.
 *
 * The cards are the table's groups, so the two tabs list the same variables
 * in the same order and colours, and open the same card for the rail's
 * selection. What each card holds is decided below, per variable; a variable
 * with no charts yet says so in its card rather than dropping out of the list.
 */

/** A province: its forecast with the spread, and its percent of normal. */
export function ProvinceCharts({
  months,
}: {
  months: readonly SeasonalMonth[];
}) {
  const { date } = useSelection();
  const rainfall = useMemo(() => provinceRainfall(months), [months]);

  return (
    <ForecastAccordion groups={PROVINCE_GROUPS}>
      {(group) =>
        group.variableId === "rainfall" ? (
          <RainfallCharts rows={rainfall} currentDate={date} subject="place" />
        ) : (
          <NotCharted>{group.label}</NotCharted>
        )
      }
    </ForecastAccordion>
  );
}

/**
 * A station: its rainfall against its normal, as a percent of it, and as the
 * three outcome probabilities; and its temperature — the only seasonal
 * temperature CIS publishes.
 */
export function StationCharts({
  months,
}: {
  months: readonly SeasonalStationMonth[];
}) {
  const { date } = useSelection();
  const rainfall = useMemo(() => stationRainfall(months), [months]);
  const temperature = useMemo(() => stationTemperature(months), [months]);

  return (
    <ForecastAccordion groups={STATION_GROUPS}>
      {(group) =>
        group.variableId === "rainfall" ? (
          <RainfallCharts
            rows={rainfall}
            currentDate={date}
            subject="station"
            terciles
          />
        ) : group.variableId === "temperature" ? (
          <TemperatureCharts rows={temperature} currentDate={date} />
        ) : (
          <NotCharted>{group.label}</NotCharted>
        )
      }
    </ForecastAccordion>
  );
}

/**
 * The rainfall card's body: its charts stacked, each ruled off from the next
 * as the table rules off its sections.
 *
 * All or nothing at the card: a station that reports no rainfall at all (NAIA
 * reports temperature only) gets one line saying so rather than three empty
 * plots. A chart missing only its own quantity says so in its place.
 */
function RainfallCharts({
  rows,
  currentDate,
  subject,
  terciles = false,
}: {
  rows: readonly RainfallChartMonth[];
  currentDate: string | null;
  subject: "place" | "station";
  /** The probabilistic forecast, which only stations publish. */
  terciles?: boolean;
}) {
  const published = rows.some(
    (row) =>
      row.mean !== null || row.pctNormal !== null || row.likeliest !== null,
  );

  return (
    <CardBody>
      {!published ? (
        <EmptyPlot>No rainfall forecast for this {subject}.</EmptyPlot>
      ) : (
        <>
          <PercentOfNormalChart rows={rows} currentDate={currentDate} />
          <RainfallForecastChart rows={rows} currentDate={currentDate} />
          {terciles && (
            <TercileProbabilityChart rows={rows} currentDate={currentDate} />
          )}
        </>
      )}
    </CardBody>
  );
}

/**
 * The temperature card's body: the three forecasts against their normals, the
 * mean's departure from its normal beneath them, then the ranges the max and
 * the min are published with.
 *
 * All or nothing at the card, as rainfall's is: a station that reports no
 * temperature gets one line saying so rather than three empty plots.
 */
function TemperatureCharts({
  rows,
  currentDate,
}: {
  rows: readonly TemperatureChartMonth[];
  currentDate: string | null;
}) {
  const published = rows.some(
    (row) => row.tmean !== null || row.tmax !== null || row.tmin !== null,
  );

  return (
    <CardBody>
      {!published ? (
        <EmptyPlot>No temperature forecast for this station.</EmptyPlot>
      ) : (
        <>
          <TemperatureForecastChart rows={rows} currentDate={currentDate} />
          <TemperatureAnomalyChart rows={rows} currentDate={currentDate} />
          <TemperatureRangeChart rows={rows} currentDate={currentDate} />
        </>
      )}
    </CardBody>
  );
}

/** A variable whose charts are still to come. */
function NotCharted({ children }: { children: ReactNode }) {
  return (
    <CardBody>
      <EmptyPlot>{children} charts are not available yet.</EmptyPlot>
    </CardBody>
  );
}

/**
 * One parent for a card's charts, so the last one drops its rule (see
 * ChartFrame).
 */
function CardBody({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
