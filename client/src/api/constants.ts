/**
 * Ids the API is addressed by, in one place.
 *
 * The mirror of map/config/constants.ts on the data side, and for the same
 * reason: these codes are typed into query strings from files that do not
 * declare them, so a literal would drift silently.
 */

/**
 * The 18 regions, as the codes a national fan-out iterates.
 *
 * There is no national query — `location=Philippines` is a 404 — and no bbox or
 * viewport filter either; the unit of retrieval is a location, so painting the
 * whole country means asking 18 times and stitching (docs/cis-api.md §3, §6).
 *
 * Codes rather than names, because the names are not safe to round-trip: they
 * carry parentheses and roman numerals that have to survive
 * `encodeURIComponent` intact, and a code resolves by exact match rather than
 * through the fuzzy matcher, which cannot come back as a neighbouring region the
 * matcher preferred.
 *
 * Note the gap at 15 and the two late additions: `1800000000` (Negros Island
 * Region) and `1900000000` (Bangsamoro) are regions in their own right, and NCR
 * at `1300000000` is also a level-2 unit — it is the one code that appears in
 * both tiers, which is why the boundary tiles promote it (docs/vector-tiles.md).
 */
export const REGION_PSGC = [
  '0100000000', // Region I (Ilocos Region)
  '0200000000', // Region II (Cagayan Valley)
  '0300000000', // Region III (Central Luzon)
  '0400000000', // Region IV-A (CALABARZON)
  '0500000000', // Region V (Bicol Region)
  '0600000000', // Region VI (Western Visayas)
  '0700000000', // Region VII (Central Visayas)
  '0800000000', // Region VIII (Eastern Visayas)
  '0900000000', // Region IX (Zamboanga Peninsula)
  '1000000000', // Region X (Northern Mindanao)
  '1100000000', // Region XI (Davao Region)
  '1200000000', // Region XII (SOCCSKSARGEN)
  '1300000000', // National Capital Region (NCR)
  '1400000000', // Cordillera Administrative Region (CAR)
  '1600000000', // Region XIII (Caraga)
  '1700000000', // MIMAROPA Region
  '1800000000', // Negros Island Region (NIR)
  '1900000000', // Bangsamoro (BARMM)
] as const
