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
  /** A card's body: its variable as a table, or as charts. */
  children: (group: G) => ReactNode;
};

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
 */
/** The rail's icons for the seasonal variables, so a card and its row match. */
const ICONS = new Map(
  (findProduct(DEFAULT_PRODUCT_ID)?.variables ?? []).map((variable) => [
    variable.id,
    variable.icon,
  ]),
);

export function ForecastAccordion<G extends Card>({
  groups,
  children,
}: ForecastAccordionProps<G>) {
  const { variable } = useSelection();
  const selected = parseVariableKey(variable);
  // The detail panel describes the seasonal issuance; a variable of another
  // product says nothing about which of these cards is the relevant one.
  const active =
    selected?.productId === DEFAULT_PRODUCT_ID ? selected.variableId : null;

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
        const Icon = ICONS.get(group.variableId);
        return (
          <AccordionItem
            key={group.variableId}
            value={group.variableId}
            // One custom property, so the title and icon cannot drift apart;
            // the classes below read it. The body's outline takes the same
            // colour.
            style={{ "--variable": group.accent } as CSSProperties}
            // No fill or outline of its own: the body's outline is the only
            // frame. Nor the base item's divider — the gap already separates
            // the variables. Padded below, so each card closes with the same
            // space, the last one included.
            className="not-last:border-b-0"
          >
            <AccordionTrigger
              className={cn(
                "h-10 items-center justify-start gap-2 px-0 py-0 text-[13px] font-semibold text-(--variable)",
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
