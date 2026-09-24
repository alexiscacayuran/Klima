import { useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { PRODUCTS, variableKey } from "@/map/config/products";
import type { ProductDefinition, ProductVariable } from "@/map/config/products";

type ProductAccordionProps = {
  /** Defaults to the full catalogue; injectable so the rail is testable. */
  products?: readonly ProductDefinition[];
  /** The single expanded product, or null for all-collapsed. */
  openProductId: string | null;
  onOpenProductChange: (productId: string | null) => void;
  /** The layer currently painted on the map — see `variableKey`. */
  selectedVariable: string | null;
  onSelectVariable: (
    productId: string,
    variableId: string,
    layerId?: string,
  ) => void;
  className?: string;
};

/**
 * The product rail: which PAGASA bulletin the map is showing.
 *
 * Three levels, because the catalogue has three: a product holds variables, and
 * a variable holds the layers CIS maps it as (rainfall as a forecast total *and*
 * as a percent of normal). The top level is an accordion — one product open at a
 * time — and the variables inside it are shadcn sidebar groups: a menu button
 * that discloses an indented sub-list hung off a left rule. Only the innermost
 * row repaints the map.
 *
 * The rail is a *navigation* control, so it is built from real buttons with
 * aria-expanded rather than a disclosure widget, and an open product panel is a
 * labelled region.
 *
 * Collapsed products are separate floating cards with a gap between them, and
 * the open one is a single bordered card containing its variables; that is the
 * design, and it is also what makes the open product findable at a glance
 * without a scrollbar in the way.
 *
 * Selection state is owned by the caller so the map and the rail cannot disagree
 * about what is being painted. Which variable group is *expanded* is not — it
 * changes nothing outside this panel, so it lives in the group itself.
 */
export function ProductAccordion({
  products = PRODUCTS,
  openProductId,
  onOpenProductChange,
  selectedVariable,
  onSelectVariable,
  className,
}: ProductAccordionProps) {
  const idPrefix = useId();

  return (
    // The caller caps the height; the root is a flex column so the viewport
    // (an overflow-scroll flex child) shrinks to that cap and scrolls, rather
    // than resolving its `h-full` against an indefinite height and spilling.
    // The scrollbar overlays the viewport, so while there is something to
    // scroll the rail widens by a gutter for it rather than narrowing the cards.
    // The cards' width is fixed, so widening cannot change their height and
    // flip the overflow state back.
    <ScrollArea
      className={cn(
        "pointer-events-auto flex w-[250px] flex-col font-cis",
        "data-has-overflow-y:w-[264px]",
        className,
      )}
    >
      <div className="flex w-[250px] flex-col gap-2">
        {products.map((product) => {
          const isOpen = product.id === openProductId;
          const panelId = `${idPrefix}-${product.id}-panel`;
          const headerId = `${idPrefix}-${product.id}-header`;

          return (
            <div
              key={product.id}
              className={cn(
                "overflow-hidden rounded-panel backdrop-blur-md transition-colors duration-150",
                isOpen
                  ? "border border-brand-medium bg-panel-strong"
                  : "border border-line bg-panel",
              )}
            >
              <button
                type="button"
                id={headerId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => onOpenProductChange(isOpen ? null : product.id)}
                className={cn(
                  "flex h-11 w-full items-center justify-between px-3.5 text-left",
                  "text-sm text-fg-heading outline-none",
                  "focus-visible:ring-3 focus-visible:ring-brand/50",
                  isOpen ? "border-b border-line font-semibold" : "font-medium",
                )}
              >
                {product.label}
                <ChevronDown
                  aria-hidden
                  className={cn(
                    // 150ms is the CIS accordion-chevron duration.
                    "size-4 transition-transform duration-150",
                    isOpen ? "rotate-180 text-brand" : "text-fg-subtle",
                  )}
                />
              </button>

              {/* Kept out of the tree when closed rather than hidden: the rail is
                short, and an unmounted panel cannot be reached by tab order or
                by a screen reader's virtual cursor. */}
              {isOpen && (
                <div id={panelId} role="region" aria-labelledby={headerId}>
                  <ProductVariables
                    product={product}
                    selectedVariable={selectedVariable}
                    onSelectVariable={onSelectVariable}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

type SelectionProps = {
  selectedVariable: string | null;
  onSelectVariable: (
    productId: string,
    variableId: string,
    layerId?: string,
  ) => void;
};

function ProductVariables({
  product,
  selectedVariable,
  onSelectVariable,
}: { product: ProductDefinition } & SelectionProps) {
  const variables = product.variables ?? [];

  // The catalogue carries products CIS has not published a mappable layer for.
  // Saying so beats an empty box, and beats omitting the product entirely —
  // PAGASA does issue these, they just are not on the map yet.
  if (variables.length === 0) {
    return (
      <p className="px-3.5 py-3 text-xs leading-relaxed text-fg-body">
        No mapped layers published for this product yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5 p-1.5">
      {variables.map((variable) =>
        variable.layers?.length ? (
          <VariableGroup
            key={variable.id}
            productId={product.id}
            variable={variable}
            selectedVariable={selectedVariable}
            onSelectVariable={onSelectVariable}
          />
        ) : (
          <VariableRow
            key={variable.id}
            productId={product.id}
            variable={variable}
            selectedVariable={selectedVariable}
            onSelectVariable={onSelectVariable}
          />
        ),
      )}
    </ul>
  );
}

/** Shared geometry for the two variable-level rows, so a group header and a
 *  single-layer variable sit on the same grid whichever one a product gets. */
const menuButton = cn(
  "flex h-8 w-full items-center gap-2.5 overflow-hidden rounded-md px-2",
  "text-left text-sm outline-none transition-colors duration-150",
  "focus-visible:ring-2 focus-visible:ring-brand/50",
);

/**
 * A variable with more than one mapped layer: a disclosure header over an
 * indented sub-list.
 *
 * Expanded on mount when it holds the current selection, so reopening a product
 * shows what the map is painting rather than making you go find it again.
 * Groups toggle independently — the single-open rule belongs to the products
 * above, and applying it twice makes exploring one product jump around.
 */
function VariableGroup({
  productId,
  variable,
  selectedVariable,
  onSelectVariable,
}: { productId: string; variable: ProductVariable } & SelectionProps) {
  const layers = variable.layers ?? [];
  const listId = useId();
  const Icon = variable.icon;

  const holdsSelection = layers.some(
    (layer) =>
      selectedVariable === variableKey(productId, variable.id, layer.id),
  );
  const [isOpen, setIsOpen] = useState(holdsSelection);

  return (
    <li>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={listId}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          menuButton,
          "hover:bg-line/60",
          // The selected layer's own row carries the fill; marking its parent
          // too would read as two selections. It gets weight and a brand icon
          // instead, which survives the group being collapsed.
          holdsSelection ? "font-medium text-fg-heading" : "text-fg-body",
        )}
      >
        <Icon
          aria-hidden
          className={cn(
            "size-[15px] shrink-0",
            holdsSelection ? "text-brand-strong" : "text-fg-subtle",
          )}
        />
        <span className="truncate">{variable.label}</span>
        <ChevronRight
          aria-hidden
          className={cn(
            "ml-auto size-3.5 shrink-0 text-fg-subtle transition-transform duration-150",
            isOpen && "rotate-90",
          )}
        />
      </button>

      {isOpen && (
        // The sidebar-group sub-list: a left rule the rows hang off, nudged a
        // pixel right while the rows are nudged a pixel left so a row's focus
        // ring and hover fill sit flush over the rule rather than beside it.
        <ul
          id={listId}
          className={cn(
            "mx-3.5 mt-0.5 flex min-w-0 translate-x-px flex-col gap-0.5",
            "border-l border-line px-2.5 py-0.5",
          )}
        >
          {layers.map((layer) => {
            const isSelected =
              selectedVariable ===
              variableKey(productId, variable.id, layer.id);

            return (
              <li key={layer.id}>
                <button
                  type="button"
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() =>
                    onSelectVariable(productId, variable.id, layer.id)
                  }
                  className={cn(
                    "flex h-7 w-full -translate-x-px items-center overflow-hidden",
                    "rounded-md px-2 text-left text-sm outline-none",
                    "transition-colors duration-150",
                    "focus-visible:ring-2 focus-visible:ring-brand/50",
                    isSelected
                      ? "bg-brand-soft font-medium text-fg-heading"
                      : "text-fg-body hover:bg-line/60",
                  )}
                >
                  <span className="truncate">{layer.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/** A variable CIS maps one way: the row is the layer, so it selects directly. */
function VariableRow({
  productId,
  variable,
  selectedVariable,
  onSelectVariable,
}: { productId: string; variable: ProductVariable } & SelectionProps) {
  const isSelected = selectedVariable === variableKey(productId, variable.id);
  const Icon = variable.icon;

  return (
    <li>
      <button
        type="button"
        aria-current={isSelected ? "true" : undefined}
        onClick={() => onSelectVariable(productId, variable.id)}
        className={cn(
          menuButton,
          isSelected
            ? "bg-brand-soft font-medium text-fg-heading"
            : "text-fg-body hover:bg-line/60",
        )}
      >
        <Icon
          aria-hidden
          className={cn(
            "size-[15px] shrink-0",
            isSelected ? "text-brand-strong" : "text-fg-subtle",
          )}
        />
        <span className="truncate">{variable.label}</span>
      </button>
    </li>
  );
}
