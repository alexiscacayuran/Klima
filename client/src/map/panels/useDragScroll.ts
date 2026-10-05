import { useEffect } from "react";
import type { RefObject } from "react";
import type { ScrollSync } from "./useScrollSync";

/** How far a press travels before it is a drag rather than a click, in px. */
const DRAG_THRESHOLD = 4;

/**
 * Drag with the mouse to scroll the ScrollArea around `inside` sideways — for
 * a reader whose wheel only scrolls down, and who would otherwise have to find
 * the thin bar under the table.
 *
 * The drag is the group's (see ScrollSync): the grid follows the pointer
 * 1:1, stretches past an end against growing resistance, and when let go
 * glides on at the speed it was thrown, bouncing off an end it runs into. A
 * press stops a glide where it is, as a finger on a phone does.
 *
 * Mouse only: a finger or a pen already pans the viewport natively, and
 * taking its pointer would fight that.
 *
 * A press becomes a drag once it has moved a few pixels, so a click stays a
 * click. Text in an overflowing table cannot be selected by mouse: dragging to
 * scroll and dragging to select are the same gesture. A table that fits is
 * left alone and keeps its text selectable.
 */
export function useDragScroll(
  inside: RefObject<HTMLElement | null>,
  sync: ScrollSync,
) {
  useEffect(() => {
    const viewport = inside.current?.closest<HTMLElement>(
      "[data-slot=scroll-area-viewport]",
    );
    if (!viewport) return;

    let press: {
      id: number;
      x: number;
      from: number;
      dragging: boolean;
    } | null = null;

    // Let go: on with the drag's speed, or back from a stretch that a press
    // caught mid-bounce and never moved.
    const release = (time: number) => {
      press = null;
      delete viewport.dataset.dragging;
      sync.fling(time);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      if (viewport.scrollWidth <= viewport.clientWidth) return;
      press = {
        id: event.pointerId,
        x: event.clientX,
        from: sync.grab(viewport),
        dragging: false,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (press?.id !== event.pointerId) return;
      // Let go outside the table before it became a drag, so no pointerup
      // reached here: the press is over.
      if ((event.buttons & 1) === 0) return release(event.timeStamp);
      const dx = event.clientX - press.x;
      if (!press.dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD) return;
        press.dragging = true;
        // Held to the end, wherever the pointer wanders off to.
        viewport.setPointerCapture(event.pointerId);
        viewport.dataset.dragging = "";
      }
      sync.drag(press.from - dx, event.timeStamp);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (press?.id === event.pointerId) release(event.timeStamp);
    };

    // Kept from starting rather than cleared once the drag does, which would
    // flash a highlight across the first few pixels.
    const onSelectStart = (event: Event) => {
      if (press) event.preventDefault();
    };

    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", onPointerUp);
    viewport.addEventListener("pointercancel", onPointerUp);
    viewport.addEventListener("selectstart", onSelectStart);
    return () => {
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", onPointerUp);
      viewport.removeEventListener("pointercancel", onPointerUp);
      viewport.removeEventListener("selectstart", onSelectStart);
      delete viewport.dataset.dragging;
    };
  }, [inside, sync]);
}
