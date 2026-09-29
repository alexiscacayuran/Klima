import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import * as maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { Map } from "@vis.gl/react-maplibre";

import { cn } from "@/lib/utils";
import { INSET_MAP_ID } from "@/map/config/constants";
import { KALAYAAN_CENTER } from "@/map/config/viewState";
import { useMapEvent } from "@/map/hooks/useMapEvent";
import { useRawMap } from "@/map/hooks/useMapInstance";
import { useSidePanels } from "@/map/state/useSidePanels";

/**
 * The inset's camera, fixed. At z12.5 the island is about 50px across, a third
 * of the inset's width: its shape reads, and there is sea on every side to say
 * it is an island.
 */
const INSET_ZOOM = 12.5;

/**
 * The main map's zoom from which the island is legible without help. At z11 it
 * is ~17px across, and the inset would be magnifying it by four at most.
 */
const HIDE_AT_ZOOM = 11;

/** The inset's canvas, in CSS pixels. The frame adds its padding. */
const INSET_SIZE = { width: 160, height: 102 };

/**
 * How far the frame's near corner sits from the island, on each axis. Equal,
 * so the leader line leaves the ring at 45°.
 */
const OFFSET = 24;

/** The ring drawn round the island on the main map. */
const RING_RADIUS = 7;

/**
 * Where the chrome in MapRoot sits, which the frame keeps clear of: the top
 * row ends at 80px, the rail and the dock stop 128px above the bottom edge for
 * the bottom row, and the side gutters are 24px. The rail is 250px wide when it
 * is open; collapsed, it is a button in the top-left corner.
 */
const CHROME = { top: 80, bottom: 128, side: 24, rail: 250, gap: 16 };

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * Whether a point on the main map is covered by a chrome panel.
 *
 * Asked of the page rather than of a list of rectangles: whatever the browser
 * would hand a click at that point is what is drawn on top there, so a panel
 * that grows, a rail that opens and a rounded corner that does not quite reach
 * all answer correctly without this file knowing any of their sizes. The chrome
 * root itself is `pointer-events-none`, so the gaps between panels are never
 * hit; only the panels, which opt back in, are. The one piece of chrome that
 * does not is the wordmark — bare text on no panel — and it does not count.
 */
function underChrome(
  container: HTMLElement,
  point: { x: number; y: number },
  chrome: HTMLElement | null,
) {
  if (!chrome) return false;
  const origin = container.getBoundingClientRect();
  const hit = document.elementFromPoint(origin.left + point.x, origin.top + point.y);
  return hit !== null && chrome.contains(hit);
}

type KalayaanInsetProps = {
  /**
   * The switch in MapOptions. Off, the inset is hidden like a faded one, and
   * does no placement work; it stays mounted — see MapScene for why.
   */
  enabled: boolean;
  /** The main map's style: both maps draw the same basemap. */
  mapStyle: StyleSpecification;
  /** Passed through as the main map passes it. See MapScene. */
  interactiveLayerIds?: string[];
  /** What the inset draws: the same layers the main map mounts. */
  children: ReactNode;
  /** The chrome over the map. The inset fades while the island is under it. */
  chrome: RefObject<HTMLElement | null>;
  /**
   * Told when the inset appears and fades. MapScene hands a pin on the island
   * to whichever map is showing it.
   */
  onShownChange?: (shown: boolean) => void;
};

/**
 * Kalayaan, magnified.
 *
 * The municipality is one island in the boundary data, a kilometre across and
 * 300km west of mainland Palawan, and at the national fit it is less than a
 * pixel: nothing to see, and nothing to click. This is a second map, framed on
 * the island, floating over the main one.
 *
 * **It mirrors the main map.** MapScene mounts the same layers in both, and
 * every layer reads the one set of providers, so the inset draws the same
 * product, month, surface and boundaries, and its pointer does what the main
 * map's does: hovering the island lights it on both maps, and clicking it pins
 * it the same way — the card and the detail panel follow.
 *
 * **A pin on the island is drawn here, and only here.** The dot and its card
 * hang off the island in the inset rather than off a sub-pixel speck on the
 * main map, and the card is free to spill out over the frame's edge — it is a
 * card on a small map, not a card inside one. Once the inset fades the pin goes
 * back to the main map, where the island is by then large enough to hold it.
 *
 * **Its camera does not move.** No drag, no scroll, no pinch, no keys: a view
 * that could wander would stop being a view of the island its leader line
 * points at. Pointing and clicking are all it takes.
 *
 * **It is a callout, not a corner inset.** The frame hangs up and to the right
 * of the island's position on the main map, with a leader line to a ring round
 * the point, and follows it through every pan and zoom. It keeps clear of the
 * chrome by the same measures the chrome keeps clear of itself, and turns to
 * the other side on either axis only where there is no room on this one.
 *
 * It fades out while it has nothing to point at, or nothing to add: when the
 * island is off screen, when it is under a chrome panel — a callout from a
 * point the reader cannot see explains nothing — and when the main map is
 * zoomed in far enough to show the island itself. Hidden,
 * it stays mounted — a second WebGL context is expensive to create, and the
 * browser caps how many a page may hold. The switch in MapOptions is off by
 * default, and the inset is not mounted until it first goes on (see MapScene).
 *
 * Outside the main <Map>, deliberately. As a child it would sit in the main
 * map's DOM, and pointer events over the inset would reach the main map too.
 */
export function KalayaanInset({
  enabled,
  mapStyle,
  interactiveLayerIds,
  children,
  chrome,
  onShownChange,
}: KalayaanInsetProps) {
  // Outside every <Map>, so this is the main one. See hooks/useMapInstance.
  const main = useRawMap();
  const { productsOpen } = useSidePanels();

  const frame = useRef<HTMLDivElement>(null);
  const leader = useRef<SVGLineElement>(null);
  const ring = useRef<SVGCircleElement>(null);

  // State only for the one thing that re-renders, and it changes rarely. The
  // position changes every frame of a pan and is written straight to the DOM.
  const [shown, setShown] = useState(false);

  const place = useCallback(() => {
    const box = frame.current;
    if (!main || !box) return;

    const container = main.getContainer();
    const view = { width: container.clientWidth, height: container.clientHeight };
    const point = main.project(KALAYAAN_CENTER);

    const visible =
      enabled &&
      main.getZoom() < HIDE_AT_ZOOM &&
      point.x >= 0 &&
      point.x <= view.width &&
      point.y >= 0 &&
      point.y <= view.height &&
      !underChrome(container, point, chrome.current);
    setShown(visible);
    if (!visible) return;

    const width = box.offsetWidth;
    const height = box.offsetHeight;
    const minLeft =
      CHROME.side + (productsOpen ? CHROME.rail + CHROME.gap : 0);
    const maxLeft = view.width - CHROME.side - width;
    const minTop = CHROME.top;
    const maxTop = view.height - CHROME.bottom - height;

    // Up and to the right. Each axis turns over on its own when it runs out
    // of room, so the frame stays off the point rather than being clamped
    // onto it.
    let left = point.x + OFFSET;
    if (left > maxLeft) left = point.x - OFFSET - width;
    let top = point.y - OFFSET - height;
    if (top < minTop) top = point.y + OFFSET;
    left = clamp(left, minLeft, maxLeft);
    top = clamp(top, minTop, maxTop);

    box.style.transform = `translate(${left}px, ${top}px)`;

    ring.current?.setAttribute("cx", String(point.x));
    ring.current?.setAttribute("cy", String(point.y));

    // From the ring's edge to the nearest point of the frame — its near
    // corner, unless a clamp has slid the frame along an edge.
    const line = leader.current;
    if (line) {
      const toX = clamp(point.x, left, left + width);
      const toY = clamp(point.y, top, top + height);
      const dx = toX - point.x;
      const dy = toY - point.y;
      const length = Math.hypot(dx, dy);
      // A viewport too small to hold the frame clear of the point: there is
      // no line to draw between two things that overlap.
      line.style.display = length > RING_RADIUS ? "" : "none";
      if (length > RING_RADIUS) {
        line.setAttribute("x1", String(point.x + (dx / length) * RING_RADIUS));
        line.setAttribute("y1", String(point.y + (dy / length) * RING_RADIUS));
        line.setAttribute("x2", String(toX));
        line.setAttribute("y2", String(toY));
      }
    }
  }, [enabled, main, productsOpen, chrome]);

  // The main map's events: this component is outside every <Map>.
  useMapEvent("move", place);
  useMapEvent("resize", place);
  // First placement, and again when the rail opens or closes.
  useEffect(place, [place]);

  // The chrome changes without the map moving — a product expanding in the
  // rail, a panel opening, the timeline's strip growing — and any of those can
  // cover the island or uncover it. So a change anywhere in it is a reason to
  // look again: its DOM changing, and a transition in it settling, since a
  // panel that animates its size mutates nothing while it does. Coalesced to
  // one look per frame; `place` is cheap, but the chrome can change often.
  useEffect(() => {
    const root = chrome.current;
    if (!root) return;

    let frameRequest = 0;
    const schedule = () => {
      cancelAnimationFrame(frameRequest);
      frameRequest = requestAnimationFrame(place);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(root, { subtree: true, childList: true, attributes: true });
    root.addEventListener("transitionend", schedule);

    return () => {
      observer.disconnect();
      root.removeEventListener("transitionend", schedule);
      cancelAnimationFrame(frameRequest);
    };
  }, [chrome, place]);

  useEffect(() => onShownChange?.(shown), [shown, onShownChange]);

  return (
    <>
      <svg
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 size-full",
          "transition-[opacity,visibility] duration-150 motion-reduce:transition-none",
          shown ? "visible opacity-100" : "invisible opacity-0",
        )}
      >
        {/* The popup's leader line, restated: the same 2px in the card's own
            fill (see .klima-popup in index.css), so the two lines that can
            leave the island read as one kind of mark. A ring rather than a dot
            at the point, because the dot is the pin's. */}
        <line
          ref={leader}
          stroke="var(--cis-panel-strong)"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <circle
          ref={ring}
          r={RING_RADIUS}
          fill="none"
          stroke="var(--cis-panel-strong)"
          strokeWidth={2}
        />
      </svg>

      <div
        ref={frame}
        role="region"
        aria-label="Kalayaan, magnified"
        className={cn(
          "klima-inset absolute top-0 left-0 p-1",
          "rounded-panel border border-line bg-panel-strong shadow-float backdrop-blur-md",
          "transition-[opacity,visibility] duration-150 motion-reduce:transition-none",
          shown ? "visible opacity-100" : "invisible opacity-0",
        )}
      >
        {/* Not overflow-hidden: the pin's card hangs out past the frame. The
            canvas takes the rounding instead (see .klima-inset in index.css). */}
        <div style={INSET_SIZE}>
          <Map
            id={INSET_MAP_ID}
            mapLib={maplibregl}
            mapStyle={mapStyle}
            initialViewState={{
              longitude: KALAYAAN_CENTER[0],
              latitude: KALAYAAN_CENTER[1],
              zoom: INSET_ZOOM,
            }}
            // Every camera handler off, one by one. Not `interactive={false}`:
            // that also drops the handler MapLibre fires click and mousemove
            // from, and those are the whole of what the inset takes.
            dragPan={false}
            dragRotate={false}
            scrollZoom={false}
            boxZoom={false}
            doubleClickZoom={false}
            touchZoomRotate={false}
            touchPitch={false}
            keyboard={false}
            interactiveLayerIds={interactiveLayerIds}
            // The main map carries the attribution for both.
            attributionControl={false}
            style={{ width: "100%", height: "100%" }}
          >
            {children}
          </Map>
        </div>
      </div>
    </>
  );
}
