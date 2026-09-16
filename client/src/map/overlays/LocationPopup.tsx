import { Marker, Popup } from "@vis.gl/react-maplibre";
import { ChevronDown } from "lucide-react";
import { seasonalMonth } from "@/api/seasonal";
import type { SymbologyMode } from "@/map/config/colorScales";
import { symbologyModeFor } from "@/map/config/rasters";
import {
  formatSeasonalValue,
  seasonalReadingFor,
  seasonalValue,
} from "@/map/config/seasonalReadings";
import { formatStepId } from "@/map/config/timeline";
import { useSeasonalForecast } from "@/map/hooks/useSeasonalForecast";
import type { SeasonalForecastState } from "@/map/hooks/useSeasonalForecast";
import { useSelection } from "@/map/state/useSelection";

/**
 * The value the card quotes, and what it is.
 *
 * One shape for every outcome, so the card's height never depends on whether
 * the fetch landed: there is always a value slot and always a line under it.
 * When there is no number the slot holds an em dash and the line below says
 * why — "no data" and "not fetched yet" and "the API is down" are three
 * different things to a reader, and the same distinction the timeline's
 * placeholder makes.
 */
type Reading = {
  /** The number as printed, or an em dash. */
  value: string;
  /** The unit, set apart from the number. Absent when there is no number. */
  unit?: string;
  /**
   * What the number *means*, when there is one — the class it falls in on the
   * layer's own symbology: "Wet month", "Above normal". Not the name of the
   * quantity, which the rail already states and which the unit beside the
   * figure repeats; a card with room for one line under a number should spend
   * it on the reading nothing else on screen gives.
   *
   * With no number it carries the reason instead, and the quantity's name comes
   * back — "Forecast rainfall…" while the fetch is out — because at that point
   * naming what is missing is the only thing the line can say.
   */
  label: string;
  /**
   * The value's colour, when there is one — resolved through the mode the
   * selected layer declares, so it is the ink the surface under this card is
   * painting that number with and not merely the class it belongs to. Classed and
   * interpolated agree only at the breaks; reading the class unconditionally
   * would leave the card quoting a colour the map is not using anywhere for two
   * thirds of every band.
   */
  color?: string;
};

const NO_VALUE = "—";

/**
 * What to quote for the current selection, or null to quote nothing at all.
 *
 * Null is the honest answer for a rail product CIS has no dataset for — the
 * card stays a month and a place rather than growing a row that says
 * "unavailable" about something nobody asked for. Every other state has a
 * reading, because once a fetch has been made on the user's behalf its outcome
 * is theirs to see.
 */
function readingFor(
  variable: string | null,
  forecast: SeasonalForecastState,
  date: string | null,
  mode: SymbologyMode,
): Reading | null {
  if (forecast.status === "idle") return null;

  // Nothing this card can quote for the selected layer — either no reading at
  // all, or one with no province field, which is seasonal temperature: it is
  // published per station and the province endpoint this card reads carries
  // rainfall only (see config/seasonalReadings). Said plainly, because the
  // alternative is a dash the user cannot account for.
  //
  // Defensive rather than load-bearing today: a layer published only at
  // stations declares no `boundaries` overlay, so there is nothing to pin and
  // this card never mounts for one. That is a fact about the catalogue, which
  // can change, and this is a card that quotes numbers under a place name — the
  // wrong number here is the one failure worth ruling out twice.
  const reading = seasonalReadingFor(variable);
  if (!reading?.field) {
    return { value: NO_VALUE, label: "Published per station only" };
  }

  if (forecast.status === "loading") {
    return { value: NO_VALUE, label: `${reading.label}…` };
  }
  if (forecast.status === "error") {
    return { value: NO_VALUE, label: "Forecast unavailable" };
  }
  if (forecast.status === "none") {
    return { value: NO_VALUE, label: "No forecast for this place" };
  }

  const month = seasonalMonth(forecast.province, date);
  if (!month) {
    return { value: NO_VALUE, label: "No forecast for this month" };
  }

  const value = seasonalValue(reading, month);
  // A row that exists with a null in the field it was asked for. The label
  // still names the quantity — the reading is missing, not the subject.
  if (value === null) return { value: NO_VALUE, label: reading.label };

  // Both read off the raw number, and printed from it separately: the class and
  // the colour have to be the ones the map gives the value CIS published rather
  // than the rounded one this card shows.
  //
  // The two come from different calls on purpose. The *name* of a reading is
  // always its class — "Wet month" is a band, and there is no such thing as an
  // interpolated one — while the *colour* is whatever the map is painting,
  // which under a ramp sits between two published hexes.
  const band = reading.scale.classAt(value);

  return {
    value: formatSeasonalValue(reading, value),
    unit: reading.unit,
    label: band.label,
    color: reading.scale.colorFor(value, mode),
  };
}

/**
 * The marker and popup for the pinned place.
 *
 * The pin is made in interactions/useBoundaryFocus, which is also what makes
 * this component's job small: it renders a selection, it does not decide one.
 * Nothing here hit-tests, and the only interaction it owns is dismissal.
 *
 * Why a marker at all, when the boundary fill already lights the selected unit:
 * a province is 100km across, and the card has to hang off *somewhere* in it.
 * The dot is that somewhere — the point the user actually clicked — so the
 * popup reads as attached to the map rather than floating over it, and the
 * leader line has a place to land. It is not a second statement of the
 * selection; the lit fill is the selection, and the dot is only its address.
 *
 * DOM, not style layers: Marker and Popup are absolutely-positioned elements
 * over the canvas rather than anything MapLibre paints, so they take no part in
 * LAYER_ORDER and are mounted beside DataLayers rather than inside it. They must
 * still be children of <Map> — both reach the instance through MapContext.
 */
export function LocationPopup() {
  const { pinned, setPinned, date, variable } = useSelection();
  // Above the early return, as hooks have to be. It keys on the pin itself, so
  // with none it fetches nothing and reports `idle`.
  const forecast = useSeasonalForecast();
  const reading = readingFor(variable, forecast, date, symbologyModeFor(variable));

  // No pin, nothing to point at. Unmounting rather than hiding is what keeps
  // MapLibre from holding a popup element over the canvas that swallows clicks.
  if (!pinned) return null;

  const { lng, lat } = pinned.lngLat;

  return (
    <>
      <Marker
        longitude={lng}
        latitude={lat}
        anchor="center"
        // `pointerEvents` — inert on purpose. The marker is a mark, not a
        // control: letting it absorb clicks would carve a dead spot into the
        // middle of the very province the user is working in, where a click
        // should re-pin or move on like it does everywhere else on the map.
        //
        // `zIndex` — the dot over the leader line, which is the whole reason
        // this is set. MapLibre appends markers inside the canvas container and
        // popups after it, and neither carries a z-index, so tree order alone
        // decides and the popup's tail paints across the dot it is pointing at.
        // The container is a static block — it opens no stacking context — so
        // these two compete directly and a single step is enough to invert them.
        // Nothing else of the popup reaches this far down, so lifting the marker
        // over the whole popup only ever shows up as the dot capping the line.
        //
        // Both go through `style` because they are properties of the marker
        // element MapLibre makes, not of the dot this component renders inside
        // it; className on <Marker> would land on the same element, but these
        // two exist to override library CSS and belong next to the reason.
        style={{ pointerEvents: "none", zIndex: 1 }}
      >
        {/* A dot, not a droplet. What is being marked is a coordinate rather
            than a place — the place is already lit underneath, in the boundary
            fill — and a dot sits *on* its point where a pin hangs above one.
            Nothing rings it: the leader line running up to the popup is what
            carries the eye off the dot now, and a halo would be a second
            outline over a unit the boundary layer is already outlining. */}
        <span aria-hidden className="block size-3 rounded-full bg-brand" />
      </Marker>

      <Popup
        longitude={lng}
        latitude={lat}
        // Pinned, not derived. MapLibre chooses an anchor per position when it
        // is left to, and this design has exactly one: the panel's left edge
        // over the point, the panel itself up and to the right, the tail cut for
        // that corner alone (see index.css). What it gives up is the flip
        // MapLibre would do near a viewport edge — a pin close to the top shows
        // its popup clipped rather than dropped below the dot.
        anchor="bottom-left"
        // No offset: the tail is a real element with a real height, so the gap
        // between dot and panel *is* that height, and it is set in one place.
        //
        // The map's own click handler owns the pin (see useBoundaryFocus), and
        // MapLibre's default would race it: clicking a second province would
        // close this popup *and* set the new pin, leaving the popup shut over a
        // live selection until something else remounted it.
        closeOnClick={false}
        // Closing is the one decision this component makes, and it is the whole
        // selection that goes — the popup is a view of the pin, so a popup with
        // no pin behind it, or a pin with the map still lit and nothing naming
        // it, would both be states the user cannot act on.
        onClose={() => setPinned(null)}
        // The content sets its own width. MapLibre's 240px default is a guess
        // about prose, and nothing in this card is prose — a place name and a
        // class name are both single phrases that should break where the design
        // says or not at all.
        maxWidth="none"
        className="klima-popup"
      >
        {/* A moment, a place, a reading — and no rule between any of them.
            Each is a different kind of thing and type does the separating: the
            mono lines are readouts, the sans lines name things. A divider
            across 200px of card would be the loudest mark in it. */}
        <div className="min-w-[11.5rem] font-cis">
          {/* The forecast month, in the slot the coordinate used to hold.

              The coordinate was the more precise fact and the less true one:
              the click resolved to a *province*, and printing the point it
              happened to land on invited the number below to be read as that
              point's. It is not — every value on this card is the province's,
              for one month — and the month is what the card actually needs
              stated, because it is the one thing about the reading the user can
              change without the map moving.

              An eyebrow, so it frames the rest rather than reading as a value
              of its own: the place is what the card is about, the month is
              when. `whitespace-nowrap` keeps "September 7, 2026" off a second
              line, and the right padding keeps it clear of the close button. */}
          <p className="pr-5 font-cis-mono text-[10px]/3 font-medium tracking-[0.02em] whitespace-nowrap text-fg-subtle">
            {date ? formatStepId(date) : NO_VALUE}
          </p>
          {/* A paragraph rather than a heading: the app has no heading outline
              to slot into, and a lone h2 in a transient popup would invent one
              that leads nowhere. */}
          <p className="pr-4 text-[15px]/5 font-semibold text-fg-heading">
            {pinned.name}
          </p>

          {/* The reading and the disclosure on one line, which is what removing
              the date row leaves room for — the button had a row of its own only
              because the date was sharing it. */}
          <div className="mt-1 flex items-end justify-between gap-3">
            <div className="min-w-0">
              {reading && (
                <>
                  {/* The reading, set in the biggest type the card holds —
                      which is the point of it. The place name above says where,
                      the month says when, and this is the one line that is the
                      answer rather than the question; nothing else here is
                      allowed to outsize it.

                      Mono, and for a reason the name above does not have: this
                      number is replaced in place every time the timeline moves a
                      month, and proportional digits would reflow the line each
                      time a 1 landed where a 4 was. The unit is set beside it at
                      body size so "mm" does not compete with the figure it
                      qualifies, and the em-dash states reuse the same slot so
                      the card cannot change height between a forecast and a gap
                      in one. */}
                  <p className="flex items-center gap-2">
                    {/* The value's place on the layer's symbology, in the ink
                        the map is painting that value with — classed or
                        interpolated, whichever the layer declares (see
                        config/rasters `symbologyModeFor`). A swatch rather
                        than colouring the
                        digits: this scale runs from #e1e1e1 to #000000, so half
                        of it is unreadable as text on one theme or the other,
                        and a number that changes colour with its own value
                        reads as a status where it is only a position on a ramp.

                        It holds its slot in every state — filled with the well
                        colour when there is no value — because the alternative
                        is the figure sliding left and right as the fetch
                        resolves, in a card that is otherwise careful not to
                        move under the pointer. The ring is what keeps both ends
                        of the ramp visible: neither the near-white bottom nor
                        the black top has an edge of its own against one of the
                        two panel colours. */}
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-[3px] ring-1 ring-line-strong ring-inset"
                      style={{ backgroundColor: reading.color ?? "var(--cis-well)" }}
                    />
                    <span className="font-cis-mono text-[22px]/7 font-semibold tracking-tight text-fg-heading">
                      {reading.value}
                      {reading.unit && (
                        <span className="ml-1 text-[12px] font-medium text-fg-subtle">
                          {reading.unit}
                        </span>
                      )}
                    </span>
                  </p>
                  {/* What the number means, not what it is called. "Wet month"
                      is the sentence the reader came for; "Forecast rainfall"
                      is the row they already clicked in the rail. */}
                  <p className="text-[11px]/4 text-fg-body">{reading.label}</p>
                </>
              )}
            </div>

            {/* The disclosure this card will open, standing in its corner
                before there is anything behind it. Inert on purpose rather
                than wired to a no-op: `disabled` keeps it out of the tab order
                and off the pointer, so the accent below promises nothing a
                click can fail to deliver. The hover and focus treatment
                arrives with the panel it opens.

                Solid brand, the same fill the timeline's play button carries,
                on white rather than --color-fg-brand-strong — that step is for
                text on the *soft* fills and would sit too close to this one.
                It is the second brand mark on screen, and deliberately the
                same ink as the first: the dot on the map is where the reading
                is from, this is where the reading continues.

                Pulled into the padding on both axes so the button's own
                whitespace does not read as a fourth line of card. */}
            <button
              type="button"
              disabled
              aria-label="More detail"
              className="-mr-0.5 -mb-0.5 flex size-5 shrink-0 items-center justify-center rounded-field bg-brand text-white shadow-glint"
            >
              <ChevronDown aria-hidden className="size-3.5" />
            </button>
          </div>
        </div>
      </Popup>
    </>
  );
}
