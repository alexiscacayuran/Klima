import { Info, Search, Settings } from 'lucide-react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type TitleSearchBarProps = {
  query: string
  onQueryChange: (query: string) => void
  /** Fired on Enter. The bar does not search — it hands the term up. */
  onSubmit?: (query: string) => void
  onOpenSettings?: () => void
  onOpenAbout?: () => void
  className?: string
}

const PLACEHOLDER = 'Search a province, city or station'

/**
 * The bar over the top of the map: wordmark, place search, and the two global
 * actions.
 *
 * A floating bar rather than a page header, because the map is the page — the
 * design gives it no chrome band to sit in. It is laid out as a three-part row
 * whose two outer cells carry the *same* fixed width, which is what lands the
 * search card on the centre of the viewport: the empty left cell is a mirror
 * of the actions cell, not a spacer for the product rail. The card holds its
 * 560px and gives width up only once the row has none left to give.
 *
 * Search is a real form so Enter submits and browsers offer the field to their
 * own autofill and clear affordances; resolving a term to a place is the
 * caller's job.
 */
export function TitleSearchBar({
  query,
  onQueryChange,
  onSubmit,
  onOpenSettings,
  onOpenAbout,
  className,
}: TitleSearchBarProps) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit?.(query)
  }

  return (
    <div
      className={cn(
        'pointer-events-none flex items-start justify-between gap-6 px-6 py-4 font-cis',
        className,
      )}
    >
      {/* Mirrors the actions cell, so the card sits on the viewport's centre
          line rather than on the centre of what is left over beside it. It
          yields width before the card does. Dropped below md, where three
          across no longer fits and a centred card would be a sliver. */}
      <div className="hidden w-56 shrink md:block" aria-hidden />

      <div
        className={cn(
          'pointer-events-auto flex h-12 max-w-[560px] min-w-0 flex-1 items-center gap-3',
          'rounded-panel border border-line bg-panel px-4 shadow-panel backdrop-blur-md',
        )}
      >
        {/* alt is empty on purpose: the wordmark beside it already says Klima,
            and a described logo would announce the name twice. */}
        <img src="/favicon.svg" alt="" width={23} height={22} className="block shrink-0" />
        <span className="shrink-0 text-base font-semibold tracking-[-0.01em] text-fg-heading">
          Klima
        </span>

        <form role="search" onSubmit={handleSubmit} className="min-w-0 flex-1">
          <div
            className={cn(
              'flex h-8 items-center gap-2 rounded-field border border-line bg-well px-3',
              'transition-colors duration-150 focus-within:border-brand',
            )}
          >
            <Search aria-hidden className="size-3.5 shrink-0 text-fg-subtle" />
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={PLACEHOLDER}
              aria-label={PLACEHOLDER}
              className={cn(
                'w-full bg-transparent text-[13px] text-fg-heading outline-none',
                'placeholder:text-fg-subtle',
                // Safari draws its own clear button inside type="search"; it is
                // sized for a form field and collides with the 32px well.
                '[&::-webkit-search-cancel-button]:appearance-none',
              )}
            />
          </div>
        </form>
      </div>

      {/* 224px is the pair at their widest plus a little slack; the number has
          to be declared rather than intrinsic, since it is the mirror above
          that fixes the centre line. Below md it falls back to content width,
          where the row is a two-part composition anyway. */}
      <div className="pointer-events-auto flex shrink-0 justify-end gap-2 md:w-56">
        <BarAction icon={Settings} label="Settings" onClick={onOpenSettings} />
        <BarAction icon={Info} label="About" onClick={onOpenAbout} />
      </div>
    </div>
  )
}

/**
 * The CIS "secondary" button: a neutral fill one step off the panel, a stronger
 * border than the panel's own, and the glint every solid button in the system
 * carries. Text firms up to heading colour on hover rather than the fill
 * carrying the whole state change.
 */
function BarAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Settings
  label: string
  onClick?: () => void
}) {
  return (
    <Button
      size="sm"
      onClick={onClick}
      className={cn(
        'h-8 gap-2 rounded-panel border-line-strong bg-panel px-3 text-sm',
        'text-fg-body shadow-glint backdrop-blur-md',
        'hover:bg-line hover:text-fg-heading focus-visible:ring-line',
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </Button>
  )
}
