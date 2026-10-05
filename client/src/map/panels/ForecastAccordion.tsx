import type { CSSProperties, ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PRODUCT_ID,
  findProduct,
  parseVariableKey,
} from "@/map/config/products";
import { useSelection } from "@/map/state/useSelection";

/** What a card needs to know about its variable: which, and in what colour. */
type Card = {
  /** The catalogue's id (see PRODUCTS) — how the selected card is found. */
  variableId: string;
  label: string;
  /** The card's title and icon, and its body's outline. */
  accent: string;
};

export type ForecastAccordionProps<G extends Card> = {
  groups: readonly G[];
  /**
   * The rail product the groups' variables are listed under: whose icons the
   * cards wear, and whose selected variable opens its card. Seasonal unless
   * said otherwise.
   */
  productId?: string;
  /**
   * Every card open, with nothing to close it: a title in place of the
   * toggle. For a card with no others beside it, which closing would only
   * empty the tab of.
   */
  alwaysOpen?: boolean;
  /** A card's body: its variable as a table, or as charts. */
  children: (group: G) => ReactNode;
};

/** The rail's icon for a variable, so a card and its row match. */
const iconFor = (productId: string, variableId: string) =>
  findProduct(productId)?.variables?.find(
    (variable) => variable.id === variableId,
  )?.icon;

/**
 * A card's title, toggle or not: the variable's name and icon in its colour,
 * on a 40px bar the table sits right under.
 */
const cardTitle =
  "h-10 items-center justify-start gap-2 px-0 py-0 text-[13px] font-semibold text-(--variable)";

/**
 * An issuance as one card per variable — Rainfall, Temperature — each a
 * disclosure over what the tab shows of it: a table on the Table tab, charts
 * on the Chart tab. The two tabs are this one shell, so a card looks and opens
 * the same whichever the reader is on.
 *
 * The card for the variable the rail has selected opens; the rest start
 * closed, so the panel leads with what the map is painting and the other
 * variables are one click away rather than a scroll past it. Any number may be
 * open at once: comparing rainfall with temperature month by month is a
 * reasonable thing to want.
 *
 * Which cards are open resets when the rail's variable changes — picking
 * Temperature on the rail is asking about temperature — but not when the
 * subject does, so a reader stepping from station to station keeps the cards
 * they opened.
 *
 * Unless `alwaysOpen`: drought's one card holds the assessment and the outlook
 * together, and a card that is the whole tab has nothing to make room for.
 */
export function ForecastAccordion<G extends Card>({
  groups,
  productId = DEFAULT_PRODUCT_ID,
  alwaysOpen = false,
  children,
}: ForecastAccordionProps<G>) {
  const { variable } = useSelection();
  const selected = parseVariableKey(variable);
  // A variable of another product says nothing about which of these cards is
  // the relevant one.
  const active = selected?.productId === productId ? selected.variableId : null;

  if (alwaysOpen) {
    return (
      <div className="flex flex-col gap-1 border-t border-line px-2.5 pb-2.5">
        {groups.map((group) => {
          const Icon = iconFor(productId, group.variableId);
          return (
            <section
              key={group.variableId}
              style={{ "--variable": group.accent } as CSSProperties}
            >
              <h3 className={cn("flex", cardTitle)}>
                {Icon && <Icon aria-hidden className="size-4 shrink-0" />}
                {group.label}
              </h3>
              {children(group)}
            </section>
          );
        })}
      </div>
    );
  }

  // No selected variable among the groups — nothing to lead with, so none is
  // hidden.
  const defaultOpen = groups.some((group) => group.variableId === active)
    ? [active]
    : groups.map((group) => group.variableId);

  return (
    <Accordion
      key={active}
      multiple
      defaultValue={defaultOpen}
      className="gap-1 border-t border-line px-2.5 pb-2.5"
    >
      {groups.map((group) => {
        const Icon = iconFor(productId, group.variableId);
        return (
          <AccordionItem
            key={group.variableId}
            value={group.variableId}
            // One custom property, so the title and icon cannot drift apart;
            // the classes below read it.
            style={{ "--variable": group.accent } as CSSProperties}
            // No fill or outline of its own, nor the base item's divider —
            // the gap already separates the variables. Padded below, so each card closes with the same
            // space, the last one included.
            className="not-last:border-b-0"
          >
            <AccordionTrigger
              className={cn(
                cardTitle,
                "hover:no-underline focus-visible:ring-brand/50",
              )}
            >
              {Icon && <Icon aria-hidden className="size-4 shrink-0" />}
              {group.label}
            </AccordionTrigger>
            <AccordionContent className="pb-0">
              {children(group)}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
