import { useState } from "react";
import * as maplibregl from "maplibre-gl";
import { Map, MapProvider } from "@vis.gl/react-maplibre";

import { TimelineBar } from "./controls/TimelineBar";
import { TitleSearchBar } from "./controls/TitleSearchBar";
import { LocationPopup } from "./overlays/LocationPopup";
import { StationMarkers } from "./overlays/StationMarkers";
import { PanelDock } from "./panels/PanelDock";
import { ProductAccordion } from "./panels/ProductAccordion";
import { ScaleLegend, TercileLegend } from "./panels/ScaleLegend";
import { AdminBoundaries } from "./sources/AdminBoundaries";
import { RasterOverlay } from "./layers/RasterOverlay";
import { useBasemapStyle } from "./hooks/useBasemapStyle";
import { useRasterVariant } from "./hooks/useRasterVariant";
import { useTimeline } from "./hooks/useTimeline";
import type { TimelineState } from "./hooks/useTimeline";
import { useElasticBounds } from "./interactions/useElasticBounds";
import { SidePanelsProvider } from "./state/SidePanelsProvider";
import { MapSettingsProvider } from "./state/MapSettingsProvider";
import { SelectionProvider } from "./state/SelectionProvider";
import { useMapSettings } from "./state/useMapSettings";
import { useSelection } from "./state/useSelection";
import {
  INTERACTIVE_LAYER_IDS,
  LAYER_IDS,
  MAP_ID,
} from "./config/constants";
import {
  DEFAULT_PRODUCT_ID,
  hasOverlay,
  overlaysForVariable,
  variableKey,
} from "./config/products";
import {
  seasonalReadingFor,
  tercileReadingFor,
} from "./config/seasonalReadings";
import { symbologyModeFor } from "./config/rasters";
import {
  FIT_BOUNDS_OPTIONS,
  PHILIPPINES_BOUNDS,
  SOFT_BOUNDS,
  ZOOM_LIMITS,
} from "./config/viewState";

// Required exactly once in the app. Popups, markers and controls render
// unstyled without it.
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Data layers, in paint order — bottom first.
 *
 * Mount order here *is* draw order in MapLibre, so this must match LAYER_ORDER
 * in layers/index.ts.
 *
 * RasterOverlay is the exception that proves it, and the reason it is mounted
 * *last* despite painting *first*. It is a deck.gl layer interleaved into the
 * style rather than a <Source>, so it takes its slot by naming
 * boundariesParentFill as its beforeId — and that layer has to exist in the
 * style before the overlay can sit in front of it. Mounted earlier it would
 * find no such id and append to the top, burying every boundary and label under
 * the surface they are meant to be read over.
 */
function DataLayers() {
  return (
    <>
      {/*
        Always mounted, even for a layer that declares no `boundaries` overlay.
        It owns two things with different audiences: the administrative fills and
        strokes, which are the product's data and come and go with it, and the
        place-name labels, which are wayfinding and stay. The declaration is read
        inside it, not here, so that distinction can be made.
      */}
      <AdminBoundaries />
      <RasterOverlay />
    </>
  );
}

/**
 * Owns the <Map>.
 *
 * Split out from MapRoot so hooks that need the map instance can run inside
 * <MapProvider> while still supplying props *to* <Map> — the gap MAP_ID
 * bridges.
 */
function MapScene() {
  const { basemap } = useMapSettings();
  const { variable } = useSelection();
  const mapStyle = useBasemapStyle(basemap);

  // What the selected layer declares it is made of. Read here rather than only
  // inside each overlay because one of the consequences is a prop on <Map>
  // itself: with no boundaries there is nothing to hit-test, and the hit test is
  // configured from outside the components that own the layers.
  const overlays = overlaysForVariable(variable);
  const hitTestable = overlays.includes("boundaries");
  const stations = overlays.includes("stations");
  // Runs before the early return below so the hook order stays fixed; it is a
  // no-op until the map instance exists.
  useElasticBounds(SOFT_BOUNDS);

  // <Map> is not mounted until the first style resolves. Handing it a
  // placeholder style instead would cost a full style reload a moment later,
  // and mounting with none makes MapLibre render an empty canvas.
  if (!mapStyle) return <div className="size-full bg-muted" />;

  return (
    <Map
      id={MAP_ID}
      // Namespace import, not default: maplibre-gl v6 dropped its default
      // export. Omitting mapLib entirely also works but makes react-maplibre
      // lazily import() the library into a separate chunk, delaying first
      // paint of the one thing this app is for.
      mapLib={maplibregl}
      mapStyle={mapStyle}
      // Framing by bounds rather than center/zoom fits the country to the
      // actual viewport. Read once on mount only.
      initialViewState={{
        bounds: PHILIPPINES_BOUNDS,
        fitBoundsOptions: FIT_BOUNDS_OPTIONS,
      }}
      minZoom={ZOOM_LIMITS.minZoom}
      maxZoom={ZOOM_LIMITS.maxZoom}
      // No maxBounds on purpose — it is a hard clamp, and useElasticBounds
      // provides the limit instead, with a spring back on release.
      // `undefined` rather than an empty array when nothing is hit-testable.
      // react-maplibre reads any array as "tracking on" and then queries with
      // `layers: []`, which MapLibre takes as *every* layer in the style rather
      // than none — the opposite of what is being asked for, on every mousemove.
      // See the note on INTERACTIVE_LAYER_IDS in config/constants.
      interactiveLayerIds={hitTestable ? INTERACTIVE_LAYER_IDS : undefined}
      // MapControls mounts an AttributionControl explicitly; leaving the
      // default on would render a second one.
      attributionControl={false}
      style={{ width: "100%", height: "100%" }}
    >
      <DataLayers />
      {/* Not in DataLayers: markers and popups are DOM over the canvas, not
          style layers, so they have no place in LAYER_ORDER. They do have to be
          inside <Map>, which is how they reach the instance. */}
      <LocationPopup />
      {stations && <StationMarkers />}
    </Map>
  );
}

/**
 * What the timeline says when it has no dates on it.
 *
 * Three different facts, and the difference matters to whoever is looking: one
 * is transient, one is an outage somebody has to fix, and one is simply how far
 * CIS has got with that bulletin. Collapsing them into a single "no data" would
 * make a broken API indistinguishable from a product that was never loaded.
 * `ready` is unreachable here — the bar only shows a placeholder when it is
 * empty — but it is spelled out so the map stays exhaustive over the union.
 */
const TIMELINE_PLACEHOLDER: Record<TimelineState["status"], string> = {
  loading: "Loading dates…",
  error: "Dates unavailable",
  none: "No dates published for this product",
  ready: "",
};

/**
 * The chrome floating over the map: product rail, title/search bar, timeline.
 *
 * The selected layer lives in SelectionContext rather than here, because a
 * layer now consumes it: the product's spatial resolution is what decides which
 * administrative tiers AdminBoundaries draws, and that component is inside
 * <Map> with no prop path to this one.
 *
 * The scrubbed date has followed it in, for the same reason one step later:
 * the selection popup is a child of <Map> and reports the date, so the timeline
 * and the popup have to be reading one value. Which product is *expanded* is
 * still local — nothing outside this box reads it.
 *
 * The dates themselves are not state here at all. They are derived, by
 * useTimeline, from the selected product and the freshness field CIS publishes
 * for it, so the window moves when PAGASA issues a bulletin rather than when
 * someone edits this repo.
 *
 * Absolute positioning with a pointer-events-none parent so the gaps between
 * panels stay draggable map. Each panel opts its own box back in.
 */
function MapChrome() {
  const { variable, setVariable, date, setDate } = useSelection();
  const { steps, status } = useTimeline();
  const { visibleLayers } = useMapSettings();
  // The key to the surface on screen, so nothing when there is none: a layer
  // that publishes no raster, or a raster switched off. Read through the same
  // hook RasterOverlay uses, so the legend cannot explain a different surface.
  const raster = useRasterVariant();
  const legend =
    raster && (visibleLayers[LAYER_IDS.raster] ?? true) ? raster : null;
  // A layer with no surface at all — probabilistic rainfall, temperature — is
  // keyed by what colours its station pills instead. Not a fallback for a
  // raster switched off: that layer still has a surface, just a hidden one.
  const stationsOnly =
    hasOverlay(variable, "stations") && !hasOverlay(variable, "raster");
  const terciles = stationsOnly ? tercileReadingFor(variable) : null;
  const stationReading = stationsOnly ? seasonalReadingFor(variable) : null;
  const [openProductId, setOpenProductId] = useState<string | null>(
    DEFAULT_PRODUCT_ID,
  );
  const [query, setQuery] = useState("");

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <TitleSearchBar
        className="absolute inset-x-0 top-0"
        query={query}
        onQueryChange={setQuery}
      />

      <ProductAccordion
        className="absolute top-20 left-6 max-h-[calc(100%-13rem)]"
        openProductId={openProductId}
        onOpenProductChange={setOpenProductId}
        selectedVariable={variable}
        onSelectVariable={(productId, variableId, layerId) =>
          setVariable(variableKey(productId, variableId, layerId))
        }
      />

      {/* The rail's mirror: the overview and detail panels, taking turns in
          one slot. Same top as the rail, and a bottom at the line the rail's
          height cap reaches — 128px up — so it stops clear of the legend in
          the bottom-right corner exactly as the rail stops clear of the
          timeline. A bottom rather than a max-height because the dock is a
          row, and its panel's own cap has to resolve against a real height. */}
      <PanelDock className="absolute top-20 right-6 bottom-32" />

      {/* The bottom row: the timeline on the viewport's centre line, the legend
          in the right-hand corner.

          Three columns, and the outer two are equal `flex-1`s, so the timeline
          stays centred on the viewport and not just on the gap beside the
          legend. That is the same line the search card above it is centred on,
          and 600 is close to that card's width, so the two bars read as one
          composition rather than two unrelated widths. The timeline keeps 600px
          while the sides have room and only then shrinks. The rail's max-height
          stops it 128px above the bottom edge and the bar's top sits at 96px,
          so the empty left column never runs into it.

          The right column never gets narrower than the legend, whether or not
          one is showing. Otherwise, on a viewport too narrow to centre both,
          switching to a layer with no raster would free that width and the
          timeline would jump sideways. The minimum is the legend's own width,
          which is the collapsed side panel's.

          `items-end` sits the shorter legend on the same bottom edge as the
          timeline, which is what makes it read as the corner of the chrome. */}
      <div className="absolute inset-x-6 bottom-6 flex items-end gap-4">
        <div className="flex-1" />
        <TimelineBar
          className="min-w-0 flex-[0_1_600px]"
          steps={steps}
          value={date}
          onChange={setDate}
          placeholder={TIMELINE_PLACEHOLDER[status]}
          loading={status === "loading"}
        />
        <div className="flex min-w-[360px] flex-1 justify-end">
          {legend ? (
            <ScaleLegend scale={legend.scale} mode={legend.mode} />
          ) : terciles ? (
            <TercileLegend scales={terciles.scales} />
          ) : (
            stationReading && (
              <ScaleLegend
                scale={stationReading.scale}
                mode={symbologyModeFor(variable)}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The map surface and its chrome.
 *
 * Renders into whatever box its parent gives it, so sizing lives with the
 * layout rather than here.
 *
 * MapProvider is what makes the instance addressable by id from siblings, so
 * the toolbar and panels can reach it without being children of <Map>.
 * MapSettingsProvider and SelectionProvider wrap both for the same reason: the
 * rail writes the selected layer that the boundary source reads, and the
 * boundary source writes the location that the chrome will read back.
 * SidePanelsProvider likewise: the popup and the station pills, inside <Map>,
 * open the detail panel, which is chrome — and the popup reads it back, to
 * stand aside while the panel is open. It sits inside SelectionProvider because
 * the panel can only be open while there is a selection.
 *
 * The pre-redesign chrome is gone: MapToolbar, LayerPanel, BasemapToggle and
 * AdminLevelSelect have been deleted rather than left unmounted. The imported
 * design puts the product rail where LayerPanel sat and the title bar where the
 * toolbar sat, and keeping a second, unreachable set of controls on disk only
 * made it ambiguous which one the map actually obeys.
 *
 * Three of the settings they wrote survive in MapSettings, because live code
 * still *reads* them: the basemap (MapScene), the boundary switch
 * (AdminBoundaries) and per-layer visibility (RasterOverlay). Each is stuck on
 * its default until the new chrome grows a control for it — the setters are the
 * seam that control plugs into. `adminLevel` did not survive: the selected
 * product decides the administrative tiers now, so nothing read it.
 */
export function MapRoot() {
  return (
    <MapSettingsProvider>
      <SelectionProvider>
        <SidePanelsProvider>
          <MapProvider>
            <div className="relative size-full overflow-hidden">
              <MapScene />
              <MapChrome />
            </div>
          </MapProvider>
        </SidePanelsProvider>
      </SelectionProvider>
    </MapSettingsProvider>
  );
}
