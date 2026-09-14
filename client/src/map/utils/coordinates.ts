/**
 * A point on the map, as the app stores and prints it.
 *
 * A plain pair rather than maplibre's `LngLat` class: this outlives the event it
 * came from — it is held in React state, and is the shape a URL-synced or
 * server-persisted view would serialize — so it must not carry a prototype.
 */
export type LngLat = {
  lng: number
  lat: number
}

/**
 * Decimal places kept when a coordinate is shown.
 *
 * Two is ~1.1km at Philippine latitudes, which is the precision the reading
 * actually carries: the click was resolved against generalized boundary
 * geometry, and what it names is a province or a municipality, not a rooftop.
 * The float would otherwise print fifteen digits of arithmetic noise.
 */
const DECIMALS = 2

/** One axis, signed value turned into a magnitude and a hemisphere. */
const axis = (value: number, positive: string, negative: string) =>
  `${Math.abs(value).toFixed(DECIMALS)}° ${value < 0 ? negative : positive}`

/**
 * A clicked point, in the form a reader can carry to another map.
 *
 * Latitude first — the convention everywhere a coordinate is *read*, and the
 * reverse of the `lng, lat` order every API in this app takes, which is why the
 * hemisphere letters are not decoration: they are what stops the two orders
 * being confused when the pair is copied out of the popup.
 */
export const formatLngLat = ({ lng, lat }: LngLat): string =>
  `${axis(lat, 'N', 'S')}, ${axis(lng, 'E', 'W')}`
