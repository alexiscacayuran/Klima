import type { ComponentProps, ReactNode } from "react"

import { TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type TooltipCardProps = Omit<
  ComponentProps<typeof TooltipContent>,
  "children"
> & {
  /** The name of the thing under the pointer. */
  title: ReactNode
  /** What it means, or why it is as it is — a sentence, not a tag. */
  description: ReactNode
}

/**
 * A tooltip whose description is too long to sit beside its title: the title
 * on its own line and the description wrapped beneath it, like a small card.
 *
 * Only for a long description. A title with a short one — a range and a class
 * name, say — stays a single row in a plain TooltipContent, where stacking it
 * would only make the popup taller.
 */
function TooltipCard({
  title,
  description,
  className,
  ...props
}: TooltipCardProps) {
  return (
    <TooltipContent
      className={cn("max-w-64 flex-col items-start gap-1 py-2", className)}
      {...props}
    >
      <span className="font-semibold">{title}</span>
      <span className="leading-snug opacity-70">{description}</span>
    </TooltipContent>
  )
}

export { TooltipCard }
