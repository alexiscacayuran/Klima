import type { CSSProperties } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type { DetailGroup } from "@/map/config/detailRows";
import {
  DEFAULT_PRODUCT_ID,
  findProduct,
  parseVariableKey,
} from "@/map/config/products";
import { useSelection } from "@/map/state/useSelection";
import { ForecastTable, useScrollSync } from "./ForecastTable";

type Month = { id: string; date: string };

export type ForecastAccordionProps<M extends Month> = {
  groups: readonly DetailGroup<M>[];
  /** The issuance's months, earliest first — every card's columns. */
  months: readonly M[];
};

/**
 * An issuance as one card per variable — Rainfall, Temperature — each a
 * disclosure over its own table.
 *
 * The card for the variable the rail has selected opens; the rest start
 * closed, so the panel leads with what the map is painting and the other
 * variables are one click away rather than a scroll past it. Any number may be
 * open at once: comparing rainfall with temperature month by month is a
 * reasonable thing to want.
 *
 * The open cards are one grid: the same columns, scrolled sideways together,
 * and a card opened later joins at the position the others are already at.
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

export function ForecastAccordion<M extends Month>({
  groups,
  months,
}: ForecastAccordionProps<M>) {
  const { variable, date } = useSelection();
  const scrollSync = useScrollSync();
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
            // the classes below read it. The table's outline takes the same
            // colour.
            style={{ "--variable": group.accent } as CSSProperties}
            // No fill or outline of its own: the table's outline is the only
            // frame. Nor the base item's divider — the gap already separates
            // the variables.
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
              <ForecastTable
                sections={group.sections}
                months={months}
                currentDate={date}
                scrollSync={scrollSync}
                accent={group.accent}
              />
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
