import { useState } from "react";
import * as maplibregl from "maplibre-gl";
import { Map, MapProvider } from "@vis.gl/react-maplibre";

import { TimelineBar } from "./controls/TimelineBar";
import { TitleSearchBar } from "./controls/TitleSearchBar";
import { LocationPopup } from "./overlays/LocationPopup";
import { ProductAccordion } from "./panels/ProductAccordion";
import { AdminBoundaries } from "./sources/AdminBoundaries";
import { useBasemapStyle } from "./hooks/useBasemapStyle";
import { useTimeline } from "./hooks/useTimeline";
import type { TimelineState } from "./hooks/useTimeline";
import { useElasticBounds } from "./interactions/useElasticBounds";
import { MapSettingsProvider } from "./state/MapSettingsProvider";
import { SelectionProvider } from "./state/SelectionProvider";
import { useMapSettings } from "./state/useMapSettings";
import { useSelection } from "./state/useSelection";
import { INTERACTIVE_LAYER_IDS, MAP_ID } from "./config/constants";
import { DEFAULT_PRODUCT_ID, variableKey } from "./config/products";
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
 * in layers/index.ts. Weather overlays belong above AdminBoundaries' fills and
 * below its strokes; see the note in that file.
 */
function DataLayers() {
  return <AdminBoundaries />;
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
  const mapStyle = useBasemapStyle(basemap);
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
      interactiveLayerIds={INTERACTIVE_LAYER_IDS}
      // MapControls mounts an AttributionControl explicitly; leaving the
      // default on would render a second one.
      attributionControl={false}
      style={{ width: "100%", height: "100%" }}
    >
      <DataLayers />
      {/* Not in DataLayers: the marker and popup are DOM over the canvas, not
          style layers, so they have no place in LAYER_ORDER. They do have to be
          inside <Map>, which is how they reach the instance. */}
      <LocationPopup />
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
        className="absolute top-20 left-6 max-h-[calc(100%-13rem)] overflow-y-auto"
        openProductId={openProductId}
        onOpenProductChange={setOpenProductId}
        selectedVariable={variable}
        onSelectVariable={(productId, variableId, layerId) =>
          setVariable(variableKey(productId, variableId, layerId))
        }
      />

      {/* Centred on the viewport rather than on the gap beside the rail: the
          rail's max-height stops it 128px above the bottom edge and the bar's
          top sits at 96px, so the two never meet and the bar is free to hold
          the screen's centre line. `mx-auto` between the two insets centres it
          while `inset-x-6` caps it — it keeps 600px until the viewport is
          narrower than that plus its margins, and only then shrinks. 600 is
          close to the search card above it, so the two centred bars read as
          one composition rather than two unrelated widths. */}
      <TimelineBar
        className="absolute inset-x-6 bottom-6 mx-auto max-w-[600px]"
        steps={steps}
        value={date}
        onChange={setDate}
        placeholder={TIMELINE_PLACEHOLDER[status]}
      />
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
 *
 * MapToolbar and LayerPanel are no longer mounted: the imported design puts the
 * product rail where LayerPanel sat and the title bar where the toolbar sat,
 * and two panels in one box is not a layout. Both files are untouched on disk —
 * re-adding either is one line — but the controls they carry (basemap toggle,
 * the tiles-offline badge, overlay switches) currently have no home in the new
 * chrome and need folding into it. AdminLevelSelect is the exception: the
 * product now decides the administrative tiers, so a manual picker would be a
 * second, disagreeing source of truth. It should go when the rest is folded in.
 */
export function MapRoot() {
  return (
    <MapSettingsProvider>
      <SelectionProvider>
        <MapProvider>
          <div className="relative size-full overflow-hidden">
            <MapScene />
            <MapChrome />
          </div>
        </MapProvider>
      </SelectionProvider>
    </MapSettingsProvider>
  );
}
