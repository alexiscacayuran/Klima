import { useEffect, useMemo, useRef } from "react";
import { Layer, Source } from "@vis.gl/react-maplibre";
import type {
  Map as MapLibreMap,
  VectorSourceSpecification,
} from "maplibre-gl";
import { LAYER_IDS, SOURCE_IDS } from "@/map/config/constants";
import {
  BOUNDARIES_SOURCE_LAYER,
  BOUNDARIES_ZOOM,
  MARTIN_SOURCES,
  USE_MLT,
  tileUrl,
} from "@/map/config/martin";
import { spatialLevelForVariable } from "@/map/config/products";
import {
  ADMIN_TIERS,
  LABEL_FONT,
  LABEL_HALO,
  LABEL_HALO_BLUR,
  LABEL_HALO_WIDTH,
  adminTextSize,
  tierForAdminLevel,
} from "@/map/config/labelTiers";
import { useLabelAnchors } from "@/map/hooks/useLabelAnchors";
import { useRawMap } from "@/map/hooks/useMapInstance";
import { useBoundaryFocus } from "@/map/interactions/useBoundaryFocus";
import { NO_HOVER } from "@/map/state/selectionContext";
import { useMapSettings } from "@/map/state/useMapSettings";
import { useSelection } from "@/map/state/useSelection";
import { boundaryLevels, enclosingParent } from "@/map/types/features";
import type {
  AdminLevel,
  AdminLocation,
  BoundaryLevels,
} from "@/map/types/features";
import type { BoundaryHover } from "@/map/state/selectionContext";

/**
 * maplibre-gl 5.24 supports MLT at runtime — its style spec declares
 * `encoding: {mvt, mlt}` with an `mvt` default — but the bundled .d.ts omits
 * `encoding` from VectorSourceSpecification, so the prop cannot be spelled in
 * TypeScript without this widening. Delete it, and the `as` below, once the
 * typings include it.
 */
type VectorSourceWithEncoding = VectorSourceSpecification & {
  encoding?: "mvt" | "mlt";
};

/**
 * Boundary ink.
 *
 * One colour for every boundary layer — both tiers, fill and stroke alike. What
 * a unit is doing is said entirely in opacity and weight, so nothing on the map
 * has to be read as a hue.
 *
 * Hex rather than the CIS tokens in index.css: MapLibre paints to a canvas and
 * cannot read a CSS custom property, so a token here would mean resolving it
 * with getComputedStyle and repainting on every theme change.
 */
const BOUNDARY_INK = "#ffffff";

/**
 * Where everything that draws data inserts itself: under the label tier.
 *
 * A fixed seam in the style rather than a mount-order convention, so a raster
 * overlay added later cannot land on top of the place names by virtue of its
 * component mounting after this one. Above the seam sit the basemap's own place
 * labels and then, above those, the administrative names at the bottom of this
 * file — which deliberately pass no beforeId, and that is what keeps them last.
 * See utils/basemapStyle for the seam itself and LAYER_ORDER in layers/index
 * for the bands either side of it.
 */
const BELOW_LABELS = LAYER_IDS.labelAnchor;

const source = (level: AdminLevel): VectorSourceWithEncoding => ({
  type: "vector",
  tiles: [tileUrl(MARTIN_SOURCES.adminBoundaries, { level })],
  minzoom: BOUNDARIES_ZOOM.minzoom,
  maxzoom: BOUNDARIES_ZOOM.maxzoom,
  attribution: "Philippine Statistics Authority",
  ...(USE_MLT ? { encoding: "mlt" as const } : {}),
});

/**
 * Philippine administrative boundaries, served by Martin straight from PostGIS.
 *
 * Two tiers, both from the same Martin source and selected by `?level=`. The
 * *parent* is drawn at every zoom and at every scale — for the seasonal
 * forecast that is the 18 regions, and they are never all absent. The *child*
 * is the tier the selected product actually publishes at, and its ink appears
 * in exactly one place: inside the unit the pointer is exploring — or the unit
 * holding the selection, once a click has made one — which is carved out of the
 * parent layer to make room for it. Hovering a region does not stack provinces
 * on top of it; it replaces that one region with its provinces and leaves the
 * other seventeen alone.
 *
 * Painting all 87 provinces at national zoom is noise, and a level switch makes
 * the user ask for detail before they can see where it is. Carving one unit at
 * a time is a drill-down that needs no control at all.
 *
 * The child tier is nonetheless *present* across the whole country, as a fill
 * too faint to read but solid enough to hit-test. That is what keeps a click to
 * one click once a selection has frozen the reveal: the province under the
 * pointer resolves whether or not its region is the open one, so picking a place
 * in a region you are not currently looking into costs no step to get there.
 *
 * Which levels those are is a property of the product, not a user setting: the
 * rail's selection resolves to a spatial level (see spatialLevelForVariable)
 * and this component follows it.
 *
 * Because the property schema is identical at every level (see
 * AdminBoundaryProperties), the layers below are written once and never change
 * when the levels do — only the tile URLs do, and react-maplibre turns that into
 * a `setTiles()` call rather than a source teardown.
 *
 * Every level is served at every zoom. Level 3 used to be withheld below z8 —
 * 1642 polygons in one low-zoom tile — and Martin now generalizes them instead,
 * which is what lets a level-3 product be drawn and labelled at national zoom
 * rather than only after the user has zoomed in far enough to earn it.
 */
export function AdminBoundaries() {
  const { showBoundaries } = useMapSettings();
  const { variable, hover, pinned } = useSelection();

  // Memoised on the resolved *level* rather than on the selection: the reset
  // effect below identifies the tiers by object identity, and keying it off the
  // variable would tear down the hover and the pin every time the user switched
  // between two layers of one product — which are the same provinces.
  const spatialLevel = spatialLevelForVariable(variable);
  const levels = useMemo(() => boundaryLevels(spatialLevel), [spatialLevel]);

  // Keyed on the product's own resolution rather than on either tier: the
  // labels name the units the data is published for, which is the child tier
  // when there is one and the parent tier when there is not.
  const labelAnchors = useLabelAnchors(spatialLevel);
  // Region, province or city/municipality — the same ladder the basemap's own
  // place names are on, so a level-3 product's labels sit below a province's
  // rather than shouting at the same size. See config/labelTiers.
  const labelTier = tierForAdminLevel(spatialLevel);

  useBoundaryFocus();
  useResetOnLevelChange(levels);

  const focused = focusedParent(hover, pinned);
  const hoveredPsgc = hover.location?.psgc ?? "";
  const pinnedPsgc = pinned?.psgc ?? "";

  // The focused parent is *replaced* by its children, not drawn under them: its
  // outline leaves the parent layer and the child outlines take over the same
  // silhouette, which is what makes this read as one tier carved open rather
  // than as two tiers stacked. A product with no child tier has nothing to
  // replace it with, so there it takes a highlight instead — the two are
  // mutually exclusive by construction.
  const carved = levels.child !== null ? focused : null;
  const highlighted = levels.child === null ? focused : null;

  return (
    <>
      <Source id={SOURCE_IDS.boundariesParent} {...source(levels.parent)}>
        {/*
          Hit target, and the surface a choropleth of parent-level aggregates
          would eventually paint. Kept at 0.01 rather than 0: an all-but-invisible
          fill is still indexed for queryRenderedFeatures, and a 1px stroke is far
          too small a click target to rely on instead. `visibility` is what
          actually hides it, since a hidden layer *is* excluded from queries —
          which is the intent when the user switches boundaries off.

          Deliberately *not* carved along with the outline that draws over it.
          The carve is about ink; this is hit-testing, and keeping it whole is
          how a click can tell land from water at a spot the child tier does not
          cover — an inland lake belongs to a province but to no municipality,
          and clicking one must not read as leaving the country.
        */}
        <Layer
          id={LAYER_IDS.boundariesParentFill}
          type="fill"
          source-layer={BOUNDARIES_SOURCE_LAYER}
          beforeId={BELOW_LABELS}
          layout={{ visibility: showBoundaries ? "visible" : "none" }}
          paint={{
            "fill-color": BOUNDARY_INK,
            "fill-opacity": [
              "case",
              ["==", ["get", "psgc"], highlighted ?? ""],
              0.05,
              0.01,
            ],
          }}
        />
        <Layer
          id={LAYER_IDS.boundariesParentLine}
          type="line"
          source-layer={BOUNDARIES_SOURCE_LAYER}
          beforeId={BELOW_LABELS}
          layout={{
            visibility: showBoundaries ? "visible" : "none",
            "line-join": "round",
          }}
          // The carve itself: the focused unit's outline is withheld so the
          // child tier below can draw the same silhouette subdivided. Every
          // other unit is untouched, so the level-1 frame is never absent —
          // there is exactly one hole in it, and it is the one being examined.
          filter={["!=", ["get", "psgc"], carved ?? ""]}
          paint={{
            "line-color": BOUNDARY_INK,
            "line-opacity": [
              "case",
              ["==", ["get", "psgc"], highlighted ?? ""],
              0.9,
              0.55,
            ],
            // Light when the whole country is in frame, heavier as you zoom in —
            // a constant width reads as noise at z5 and as hairline at z12 — and
            // heavier again on a highlighted unit.
            //
            // The `case` per stop rather than one `case` multiplying the whole
            // ramp: `["zoom"]` is only legal as the input to a *top-level*
            // `interpolate`, so wrapping this in arithmetic makes MapLibre
            // reject the paint property and drop the layer — a silent way to
            // lose the level-1 frame entirely.
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              5,
              ["case", ["==", ["get", "psgc"], highlighted ?? ""], 1.6, 0.9],
              10,
              ["case", ["==", ["get", "psgc"], highlighted ?? ""], 3.2, 1.8],
              14,
              ["case", ["==", ["get", "psgc"], highlighted ?? ""], 4.6, 2.6],
            ],
          }}
        />
      </Source>

      {levels.child !== null && (
        <Source id={SOURCE_IDS.boundariesChild} {...source(levels.child)}>
          {/*
            Unfiltered, unlike the outline beside it: this is the surface a
            click hits, so it has to exist for provinces the map is not
            currently drawing the outlines of — that is what resolves a click
            inside a frozen reveal without a trip through the region first.
            Paint is what separates the tier in play from the rest, and the base
            step is the parent fill's trick again: 0.01 is invisible on either
            basemap and still indexed for queryRenderedFeatures, where 0 would be
            an invitation to optimise the layer away. `visibility` is the real
            off switch, since a hidden layer is excluded from queries — which is
            the intent when the user switches boundaries off.

            Four steps, four statements: this is the selection, this is what a
            click would take, this is the tier in play, this is everywhere else
            you could click. The first two never apply at once — a pin stops the
            hover — but the selection is read first so the strongest ink belongs
            to the decision rather than to the pointer.
          */}
          <Layer
            id={LAYER_IDS.boundariesChildFill}
            type="fill"
            source-layer={BOUNDARIES_SOURCE_LAYER}
            beforeId={BELOW_LABELS}
            layout={{ visibility: showBoundaries ? "visible" : "none" }}
            paint={{
              "fill-color": BOUNDARY_INK,
              "fill-opacity": [
                "case",
                ["==", ["get", "psgc"], pinnedPsgc],
                0.3,
                ["==", ["get", "psgc"], hoveredPsgc],
                0.22,
                ["==", ["get", "parent_psgc"], focused ?? ""],
                0.12,
                0.01,
              ],
            }}
          />
          <Layer
            id={LAYER_IDS.boundariesChildLine}
            type="line"
            source-layer={BOUNDARIES_SOURCE_LAYER}
            beforeId={BELOW_LABELS}
            layout={{
              visibility: showBoundaries ? "visible" : "none",
              "line-join": "round",
            }}
            filter={["==", ["get", "parent_psgc"], focused ?? ""]}
            paint={{
              "line-color": BOUNDARY_INK,
              "line-opacity": 0.85,
              // The parent's own ramp, because these strokes inherit the
              // carved unit's outer edge as well as drawing its interior
              // divisions — thinning them would make the country's outline go
              // slack exactly where the user is looking. The two tiers share
              // one ink, so what tells them apart is where they are drawn: the
              // child appears only inside the hole the parent gave up.
              "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                5,
                0.4,
                10,
                1,
                14,
                1.6,
              ],
            }}
          />
        </Source>
      )}

      {/*
        Every unit's name, at the resolution the product publishes for, all the
        time.

        Its own source, and a point one, because the boundary tiles cannot carry
        this. MapLibre labels a polygon once per *outer ring* — so against the
        live tiles the 86 provinces ask for 553 labels, 116 of them "Palawan",
        one per islet, and collision detection then keeps whichever handful fits.
        That is the repeated names, and no styling reaches it: a symbol layer
        labels a feature once only when the feature is a point. utils/labelAnchors
        derives those points, one per unit, on the unit's largest island.

        Unfiltered, unlike every other layer here. The names are not part of the
        drill-down — a place is called what it is called whether or not the
        pointer is near it — so the carve applies to ink and not to labels, and
        what thins them at low zoom is collision, which is a cartographer's
        answer rather than a state machine's.

        No beforeId, so this appends above both the seam and the basemap's own
        place labels — the last thing MapLibre draws, and the first thing it
        places, which is what keeps a province name from being dropped in favour
        of a town's. See LAYER_ORDER in layers/index.
      */}
      <Source id={SOURCE_IDS.boundaryLabels} type="geojson" data={labelAnchors}>
        <Layer
          id={LAYER_IDS.boundariesLabel}
          type="symbol"
          layout={{
            visibility: showBoundaries ? "visible" : "none",
            "text-field": ["get", "name"],
            "text-font": LABEL_FONT,
            // Names wrap rather than run: "Davao de Oro" across a province is a
            // banner, and two short lines sit inside a shape where one long one
            // overhangs into the sea.
            "text-max-width": 8,
            "text-size": adminTextSize(labelTier),
            "text-padding": 20,
            // Who gets the space when two names want it — and at national zoom
            // most of them do, because 86 provinces will not fit, let alone 1641
            // municipalities, and MapLibre has to drop some. The unit under the
            // pointer, and the one holding the selection, must never be among the
            // dropped. Lower sorts first, and first placed keeps its spot.
            //
            // Then cities before municipalities, but only at level 3. That tier
            // is 149 cities among 1492 municipalities, and when two names
            // collide the city is the one more likely to be the thing a reader
            // was looking for — it is larger, and it is how people describe
            // where they are.
            //
            // `geo_level` rather than the level the tile was fetched at: the two
            // are different questions, and this one asks what the unit *is* (see
            // AdminBoundaryProperties). Which is also why the rule is confined to
            // level 3. Level 2 carries the same "City" value on exactly two rows
            // — City of Davao and City of Isabela, promoted out of level 3 — and
            // ranking those above all 83 provinces would hand the country's
            // label space to two of its smaller units.
            //
            // The gate is a plain boolean inside the expression rather than two
            // expressions chosen in TypeScript: `["all", false, …]` can never
            // match, so every unit falls through to the last rung and the
            // ordering is exactly what it was before this rule existed.
            "symbol-sort-key": [
              "case",
              ["==", ["get", "psgc"], pinnedPsgc],
              0,
              ["==", ["get", "psgc"], hoveredPsgc],
              1,
              ["all", spatialLevel === 3, ["==", ["get", "geo_level"], "City"]],
              2,
              3,
            ],
          }}
          paint={{
            // The tier's own ink, not BOUNDARY_INK: the boundary lines say
            // "this is an edge" in one colour at every level, but a name says
            // which level it belongs to, and colour is half of how.
            "text-color": ADMIN_TIERS[labelTier].color,
            // One rung, where the fill has three: the fill already says which
            // unit is which, and a name that changed weight under the pointer
            // would be a second voice saying it. This only keeps the rest from
            // competing with the one in play.
            //
            // Opacity rather than size, deliberately: text-size is a layout
            // property, so making it depend on the hover would re-lay out the
            // whole bucket on every pointer move. text-opacity is paint, and
            // costs a uniform.
            "text-opacity": [
              "case",
              [
                "any",
                ["==", ["get", "psgc"], pinnedPsgc],
                ["==", ["get", "psgc"], hoveredPsgc],
              ],
              1,
              0.8,
            ],
            "text-halo-color": LABEL_HALO,
            "text-halo-width": LABEL_HALO_WIDTH,
            "text-halo-blur": LABEL_HALO_BLUR,
          }}
        />
      </Source>
    </>
  );
}

/**
 * Which parent is carved open.
 *
 * The pointer decides while nothing is selected, and a click takes the decision
 * away from it: useBoundaryFocus stops reporting the hover for as long as the
 * selection stands, so the region you chose from cannot be carved away by a
 * pointer that was only crossing the map on its way to a panel.
 *
 * Read in the pointer's favour, though the two are never actually both set —
 * the hover is empty for the whole life of a pin, which is what leaves the pin
 * answering.
 */
function focusedParent(
  hover: BoundaryHover,
  pinned: AdminLocation | null,
): string | null {
  if (hover.parent) return hover.parent;
  return pinned ? enclosingParent(pinned) : null;
}

const clearFeatureState = (map: MapLibreMap, sourceId: string) => {
  // A source that is not in the style yet — or, for the child tier, not at all —
  // makes removeFeatureState throw rather than no-op.
  if (!map.getSource(sourceId)) return;
  map.removeFeatureState({
    source: sourceId,
    sourceLayer: BOUNDARIES_SOURCE_LAYER,
  });
};

/**
 * Everything keyed by feature id has to go when the levels change.
 *
 * Feature ids are `psgc` cast to integer, which is unique *within* a level but
 * not across them — 1300000000 is NCR at level 1 and again at level 2. Any state
 * set before the switch would therefore be re-applied to whatever feature
 * happens to share the id at the new level.
 *
 * The hover and the pin go with it for the same reason in a different currency:
 * they name a place at the old product's resolution, and the new product does
 * not publish that place. Better an empty readout than a stale one that a fetch
 * would then key on.
 *
 * Runs on change only, not on mount: clearing state that was never set is
 * harmless but the guard keeps the intent legible.
 */
function useResetOnLevelChange(levels: BoundaryLevels) {
  const map = useRawMap();
  const { setHover, setPinned } = useSelection();
  const previous = useRef(levels);

  useEffect(() => {
    if (!map) return;
    if (previous.current === levels) return;
    previous.current = levels;

    clearFeatureState(map, SOURCE_IDS.boundariesParent);
    clearFeatureState(map, SOURCE_IDS.boundariesChild);
    setHover(NO_HOVER);
    setPinned(null);
  }, [map, levels, setHover, setPinned]);
}
