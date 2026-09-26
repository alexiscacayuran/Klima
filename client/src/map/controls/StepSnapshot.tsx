import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { rasterUrl } from "@/map/config/rasters";
import type { RasterVariant } from "@/map/config/rasters";
import type { SnapshotSource } from "@/map/hooks/useSnapshotSource";
import type { AdminLevel } from "@/map/types/features";
import {
  rasterSnapshotKey,
  requestRasterSnapshot,
  settledSnapshots,
} from "@/map/utils/rasterSnapshot";
import type { SnapshotPriority } from "@/map/utils/rasterSnapshot";
import {
  EMPTY_SHAPES,
  SNAPSHOT_VIEWBOX,
  loadSnapshotShapes,
  settledShapes,
} from "@/map/utils/snapshotGeometry";
import type { SnapshotShapes } from "@/map/utils/snapshotGeometry";

type StepSnapshotProps = {
  source: SnapshotSource;
  stepId: string;
  /**
   * Whether this is the step the map is showing. Its thumbnail is rendered
   * ahead of the rest — see requestRasterSnapshot.
   */
  selected: boolean;
};

/**
 * One step of the selected layer, as a thumbnail: the layer's own field and
 * nothing else. No boundaries, no labels, no stations, no basemap — at this
 * size any of them is noise, and what a strip of these is for is seeing how
 * the field moves between steps.
 *
 * No boundaries even for the country's shape, because the raster already has
 * one. CIS publishes the surface with no data over the sea — open water, the
 * inland seas and Manila Bay alike — so its own mask *is* the coastline, and
 * the thumbnail draws that edge antialiased from the image's own coverage (see
 * utils/rasterSnapshot). An outline built from the region polygons used to sit
 * under it and clip it; at thumbnail size its seams showed as faint region
 * lines across the field, and its rim put a grey edge on every islet.
 *
 * Decorative to assistive technology. The tick above each card is the
 * accessible control for the same step, and describing a thumbnail of a
 * rainfall field in words would only be a worse version of the legend.
 */
export function StepSnapshot({ source, stepId, selected }: StepSnapshotProps) {
  const units = useSnapshotShapes(
    source.kind === "choropleth" ? source.level : null,
  );
  const url =
    source.kind === "raster" && source.issuedAt
      ? rasterUrl(source.variant, stepId, source.issuedAt)
      : null;
  const raster = useRasterSnapshot(
    url,
    source.kind === "raster" ? source.variant : null,
    selected ? "high" : "low",
  );

  // Still on its way, as opposed to settled on nothing: a month still decoding
  // shimmers, and a month with nothing to show says so, so the two never look
  // alike.
  if (source.kind === "raster") {
    if (source.pending) return <Pending />;
    // The issuance resolved to nothing, so no month has an image to load.
    if (!source.issuedAt) return <NoSnapshot />;
    if (raster.status === "idle" || raster.status === "loading") {
      return <Pending />;
    }
    return raster.status === "ready" && raster.href ? (
      // Plain pixels: the thumbnail is already the card's shape and already
      // transparent over the sea, so there is nothing for an SVG to add.
      <img
        src={raster.href}
        alt=""
        draggable={false}
        className="block size-full"
      />
    ) : (
      <NoSnapshot />
    );
  }

  if (units.status === "error") return <NoSnapshot />;
  if (!source.ready || units.status !== "ready") return <Pending />;

  // A choropleth is its units, filled — polygons because that is what the
  // field is published as, but with no stroke, so they read as one surface
  // rather than as boundaries.
  return (
    <svg
      viewBox={SNAPSHOT_VIEWBOX}
      className="block size-full"
      aria-hidden
      focusable={false}
    >
      {units.shapes.units.map((unit) => {
        const color = source.colorOf(unit.psgc, stepId);
        return color ? <path key={unit.psgc} d={unit.path} fill={color} /> : null;
      })}
    </svg>
  );
}

function Pending() {
  return <Skeleton className="size-full rounded-none bg-line-strong" />;
}

/**
 * A step with nothing to show: CIS published no image for the month, the
 * issuance did not resolve, or the load failed. A dash rather than a blank, so
 * it does not read as a card still loading.
 */
function NoSnapshot() {
  return (
    <div className="flex size-full items-center justify-center font-cis-mono text-xs text-fg-subtle">
      –
    </div>
  );
}

type ShapesState =
  | { status: "idle" | "loading" | "error"; shapes: SnapshotShapes }
  | { status: "ready"; shapes: SnapshotShapes };

/**
 * One level's geometry, from the page-wide cache in utils/snapshotGeometry.
 *
 * Every card on the strip asks for the same level, and they share one request;
 * a card mounting after it has landed paints in its first render.
 */
function useSnapshotShapes(level: AdminLevel | null): ShapesState {
  const [state, setState] = useState<ShapesState>(() => {
    const settled = level === null ? undefined : settledShapes.get(level);
    return settled
      ? { status: "ready", shapes: settled }
      : { status: "idle", shapes: EMPTY_SHAPES };
  });

  useEffect(() => {
    if (level === null) {
      setState({ status: "idle", shapes: EMPTY_SHAPES });
      return;
    }
    const settled = settledShapes.get(level);
    if (settled) {
      setState({ status: "ready", shapes: settled });
      return;
    }

    let live = true;
    setState({ status: "loading", shapes: EMPTY_SHAPES });
    loadSnapshotShapes(level)
      .then((shapes) => {
        if (live) setState({ status: "ready", shapes });
      })
      .catch((error: unknown) => {
        // A thumbnail is not worth an error on screen: the strip keeps its
        // skeletons, and the map beside it is unaffected.
        console.error(error);
        if (live) setState({ status: "error", shapes: EMPTY_SHAPES });
      });
    return () => {
      live = false;
    };
  }, [level]);

  return state;
}

type RasterSnapshotState =
  | { status: "idle" | "loading" | "error" }
  /** `href` is null for a month CIS published no image for. */
  | { status: "ready"; href: string | null };

/**
 * A painted thumbnail of one raster, from the scheduler in utils/rasterSnapshot.
 *
 * The request is released on cleanup, which is what lets the scheduler drop a
 * thumbnail nobody is waiting for — and a change of priority is a release and a
 * fresh request, so a card that becomes the selected one is moved to the front.
 */
function useRasterSnapshot(
  url: string | null,
  variant: RasterVariant | null,
  priority: SnapshotPriority,
): RasterSnapshotState {
  const key = url && variant ? rasterSnapshotKey(url, variant) : null;
  const [state, setState] = useState<RasterSnapshotState>(() =>
    key && settledSnapshots.has(key)
      ? { status: "ready", href: settledSnapshots.get(key) ?? null }
      : { status: "idle" },
  );

  useEffect(() => {
    if (!url || !variant || !key) {
      setState({ status: "idle" });
      return;
    }
    if (settledSnapshots.has(key)) {
      setState({ status: "ready", href: settledSnapshots.get(key) ?? null });
      return;
    }

    let live = true;
    setState({ status: "loading" });
    const request = requestRasterSnapshot(url, variant, priority);
    request.promise
      .then((href) => {
        if (live) setState({ status: "ready", href });
      })
      .catch((error: unknown) => {
        console.error(error);
        if (live) setState({ status: "error" });
      });
    return () => {
      live = false;
      request.release();
    };
  }, [url, variant, key, priority]);

  return state;
}
