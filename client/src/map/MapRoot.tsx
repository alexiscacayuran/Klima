import { useState } from "react";
import * as maplibregl from "maplibre-gl";
import { Map, MapProvider } from "@vis.gl/react-maplibre";

import { TimelineBar } from "./controls/TimelineBar";
import { TitleSearchBar } from "./controls/TitleSearchBar";
import { ProductAccordion } from "./panels/ProductAccordion";
import { AdminBoundaries } from "./sources/AdminBoundaries";
import { useBasemapStyle } from "./hooks/useBasemapStyle";
import { useElasticBounds } from "./interactions/useElasticBounds";
import { MapSettingsProvider } from "./state/MapSettingsProvider";
import { useMapSettings } from "./state/useMapSettings";
import { INTERACTIVE_LAYER_IDS, MAP_ID } from "./config/constants";
import {
  DEFAULT_LAYER_ID,
  DEFAULT_MONTH_ID,
  DEFAULT_PRODUCT_ID,
  DEFAULT_VARIABLE_ID,
  SEASONAL_OUTLOOK_MONTHS,
  variableKey,
} from "./config/products";
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
 * in layers/index.ts. Weather overlays belong above AdminBoundaries' fill and
 * below its stroke; see the note in that file.
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
    </Map>
  );
}

/**
 * The chrome floating over the map: product rail, title/search bar, timeline.
 *
 * Holds the selection state the three share rather than pushing it into
 * MapSettingsContext, which is deliberately scoped to settings the *map style*
 * reads (basemap, admin level, layer visibility). What is being forecast and
 * for which month is product state; it moves into the context — or a store —
 * when a layer actually consumes it.
 *
 * Absolute positioning with a pointer-events-none parent so the gaps between
 * panels stay draggable map. Each panel opts its own box back in.
 */
function MapChrome() {
  const [openProductId, setOpenProductId] = useState<string | null>(
    DEFAULT_PRODUCT_ID,
  );
  const [selectedVariable, setSelectedVariable] = useState<string | null>(
    variableKey(DEFAULT_PRODUCT_ID, DEFAULT_VARIABLE_ID, DEFAULT_LAYER_ID),
  );
  const [month, setMonth] = useState<string>(DEFAULT_MONTH_ID);
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
        selectedVariable={selectedVariable}
        onSelectVariable={(productId, variableId, layerId) =>
          setSelectedVariable(variableKey(productId, variableId, layerId))
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
        steps={SEASONAL_OUTLOOK_MONTHS}
        value={month}
        onChange={setMonth}
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
 * MapSettingsProvider wraps both for the same reason.
 *
 * MapToolbar and LayerPanel are no longer mounted: the imported design puts the
 * product rail where LayerPanel sat and the title bar where the toolbar sat,
 * and two panels in one box is not a layout. Both files are untouched on disk —
 * re-adding either is one line — but the controls they carry (basemap toggle,
 * admin level, the tiles-offline badge, overlay switches) currently have no
 * home in the new chrome and need folding into it.
 */
export function MapRoot() {
  return (
    <MapSettingsProvider>
      <MapProvider>
        <div className="relative size-full overflow-hidden">
          <MapScene />
          <MapChrome />
        </div>
      </MapProvider>
    </MapSettingsProvider>
  );
}
