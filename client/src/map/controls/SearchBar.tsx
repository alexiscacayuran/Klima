import { Search } from "lucide-react";
import type { FormEvent } from "react";
import { cn } from "@/lib/utils";

type SearchBarProps = {
  query: string;
  onQueryChange: (query: string) => void;
  /** Fired on Enter. The bar does not search — it hands the term up. */
  onSubmit?: (query: string) => void;
  className?: string;
};

const PLACEHOLDER = "Search a province, city or station";

/**
 * Place search, floating over the top of the map.
 *
 * The field is the bar: the panel surface takes the input directly rather than
 * holding a well inset into a card. With the wordmark moved out to head the
 * product rail, the card had nothing else in it, and a box whose only content
 * is a smaller box just draws a second outline around the same control.
 *
 * Width and placement are the caller's. MapChrome centres it on the viewport
 * between two cells of equal width, the same way it centres the timeline.
 *
 * A real form so Enter submits and browsers offer the field to their own
 * autofill; resolving a term to a place is the caller's job.
 */
export function SearchBar({
  query,
  onQueryChange,
  onSubmit,
  className,
}: SearchBarProps) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit?.(query);
  };

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className={cn(
        "pointer-events-auto flex h-12 items-center gap-3 px-4 font-cis",
        "rounded-panel border border-line bg-panel shadow-panel backdrop-blur-md",
        "transition-colors duration-150 focus-within:border-brand",
        className,
      )}
    >
      <Search aria-hidden className="size-4 shrink-0 text-fg-subtle" />
      <input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={PLACEHOLDER}
        aria-label={PLACEHOLDER}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-sm text-fg-heading outline-none",
          "placeholder:text-fg-subtle",
          // Safari draws its own clear button inside type="search", styled
          // for a form field rather than for this bar.
          "[&::-webkit-search-cancel-button]:appearance-none",
        )}
      />
    </form>
  );
}
