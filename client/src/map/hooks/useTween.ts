import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

const REDUCED = '(prefers-reduced-motion: reduce)'

const subscribeReduced = (listener: () => void) => {
  const query = window.matchMedia(REDUCED)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

/** Whether the reader has asked for less motion, kept current if they change it. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  )
}

export type TweenOptions = {
  duration: number
  easing: (t: number) => number
  /** Where the values start on mount, to animate in; the target if absent. */
  initial?: readonly number[]
}

/**
 * A list of numbers that moves to each new target over `duration` rather than
 * jumping, for a shape CSS cannot transition — an SVG path's `d`.
 *
 * Interruptible: a new target mid-flight starts from where the values are on
 * screen, not from the last target, so a timeline scrubbed through several
 * months never snaps back. Under reduced motion the target is returned as is.
 *
 * The target is compared by value, so a fresh array with the same numbers
 * each render costs nothing. Its length is taken to be fixed; a value with no
 * counterpart to move from starts at its target.
 */
export function useTween(
  target: readonly number[],
  { duration, easing, initial }: TweenOptions,
): readonly number[] {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState<readonly number[]>(initial ?? target)
  const shownRef = useRef(shown)
  const key = target.join(',')

  useEffect(() => {
    if (reduced) return
    const to = key.split(',').map(Number)
    const from = shownRef.current
    const start = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / duration)
      const eased = easing(t)
      const next = to.map((value, index) => {
        const was = from[index] ?? value
        return was + (value - was) * eased
      })
      shownRef.current = next
      setShown(next)
      if (t < 1) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [key, duration, easing, reduced])

  return reduced ? target : shown
}
