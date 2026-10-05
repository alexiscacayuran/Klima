import { useId, useState } from "react";
import type { ComponentType } from "react";
import { ChevronDown, ChevronRight, CircleDot, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { PRODUCTS, productIdFromKey, variableKey } from "@/map/config/products";
import type {
  ProductControl,
  ProductDefinition,
  ProductVariable,
} from "@/map/config/products";
import { useMapSettings } from "@/map/state/useMapSettings";
import { PanelIconButton, SidePanel } from "./SidePanel";

type ProductAccordionProps = {
  /** Defaults to the full catalogue; injectable so the rail is testable. */
  products?: readonly ProductDefinition[];
  /** The panel is up; when it is not, a button naming the product stands in. */
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
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
  /**
   * Placement, as a box with a definite height — a top *and* a bottom — which
   * the panel caps itself at, the same arrangement as PanelDock.
   */
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
 * All the products share one panel, a hairline between each, drawn in the same
 * SidePanel frame as the overview and detail panels, so the chrome's two edges
 * are one object on either side. Like the overview it can be closed, and what
 * it leaves behind is a button in the same corner, naming the product the map
 * is showing — so with the rail put away the map still says what it is of, and
 * the one click that brings the rail back is on that name. Widening either
 * right-hand panel closes it too, and narrowing it again reopens it (see
 * SidePanelsState.panelExpanded).
 *
 * Selection state is owned by the caller so the map and the rail cannot disagree
 * about what is being painted, and so is whether the rail is open, since the
 * right-hand panels can close it. Which variable group is *expanded* is not —
 * it changes nothing outside this panel, so it lives in the group itself.
 */
export function ProductAccordion({
  products = PRODUCTS,
  open,
  onOpen,
  onClose,
  openProductId,
  onOpenProductChange,
  selectedVariable,
  onSelectVariable,
  className,
}: ProductAccordionProps) {
  const idPrefix = useId();
  const active = selectedVariable
    ? products.find(
        (product) => product.id === productIdFromKey(selectedVariable),
      )
    : undefined;

  return (
    // The button and the panel stacked in one grid cell rather than swapped,
    // so each can fade over the other in the corner they share — the panel
    // grows out of the button and folds back into it (see `.side-panel` in
    // index.css). The row is the caller's full height, which is what the
    // panel's `max-h-full` resolves against.
    <div
      className={cn(
        "pointer-events-none grid grid-rows-[minmax(0,1fr)] items-start justify-items-start",
        "*:[grid-area:1/1]",
        className,
      )}
    >
      <ProductsButton
        label={active?.label ?? "Products"}
        onClick={onOpen}
        closed={open}
      />
      <ProductsPanel
        products={products}
        idPrefix={idPrefix}
        closed={!open}
        onClose={onClose}
        openProductId={openProductId}
        onOpenProductChange={onOpenProductChange}
        selectedVariable={selectedVariable}
        onSelectVariable={onSelectVariable}
      />
    </div>
  );
}

/**
 * The rail itself. Mounted whether or not it is open — closed, it is folded
 * away and inert rather than gone, so closing it can play.
 */
function ProductsPanel({
  products,
  idPrefix,
  closed,
  onClose,
  openProductId,
  onOpenProductChange,
  selectedVariable,
  onSelectVariable,
}: {
  products: readonly ProductDefinition[];
  idPrefix: string;
  closed: boolean;
} & Pick<
  ProductAccordionProps,
  | "onClose"
  | "openProductId"
  | "onOpenProductChange"
  | "selectedVariable"
  | "onSelectVariable"
>) {
  return (
    // The frame is a flex column whose ScrollArea is the one child allowed to
    // shrink, so the list scrolls inside the cap. The scrollbar overlays the
    // rows' right padding, which is wider than the bar, so it never lands on a
    // chevron.
    <SidePanel
      title="Layers"
      closed={closed}
      className="max-h-full w-[250px] origin-top-left"
      actions={
        <PanelIconButton label="Close products" onClick={onClose}>
          <X aria-hidden />
        </PanelIconButton>
      }
    >
      <ul className="flex flex-col divide-y divide-line">
        {products.map((product) => {
          const isOpen = product.id === openProductId;
          const panelId = `${idPrefix}-${product.id}-panel`;
          const headerId = `${idPrefix}-${product.id}-header`;

          return (
            <li key={product.id}>
              <button
                type="button"
                id={headerId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => onOpenProductChange(isOpen ? null : product.id)}
                className={cn(
                  "flex h-11 w-full items-center justify-between px-3.5 text-left",
                  "text-sm text-fg-heading outline-none transition-colors duration-150",
                  // Inset: the row runs edge to edge, and the panel clips
                  // anything drawn outside it.
                  "focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-inset",
                  isOpen ? "font-semibold" : "font-medium hover:bg-line/40",
                )}
              >
                {product.label}
                <ChevronDown
                  aria-hidden
                  className={cn(
                    // 150ms is the CIS accordion-chevron duration.
                    "size-4 shrink-0 transition-transform duration-150",
                    isOpen ? "rotate-180 text-brand" : "text-fg-subtle",
                  )}
                />
              </button>

              <ProductPanel
                product={product}
                open={isOpen}
                id={panelId}
                labelledBy={headerId}
                selectedVariable={selectedVariable}
                onSelectVariable={onSelectVariable}
              />
            </li>
          );
        })}
      </ul>
    </SidePanel>
  );
}

/**
 * What the rail leaves in its corner when it is closed: the name of the
 * product on the map, and the way back to the rail.
 *
 * Drawn like the button the empty right-hand slot shows (see PanelDock) and
 * the same 44px tall as the panel's header, so it stands where the header
 * stood. Content width, capped at the rail's, so a long product name truncates
 * rather than reaching across the map.
 *
 * The accessible name leads with the visible one — the product — and says what
 * pressing it does after, so speech input can call it by what it shows.
 */
function ProductsButton({
  label,
  onClick,
  closed,
}: {
  label: string;
  onClick: () => void;
  /** The rail is open over it: faded out and inert, as PanelDock's button. */
  closed: boolean;
}) {
  return (
    <button
      type="button"
      title="Show products"
      onClick={onClick}
      data-closed={closed || undefined}
      inert={closed}
      className={cn(
        // `panel-launcher` carries the fade and the hover colours' easing.
        "panel-launcher pointer-events-auto flex h-11 max-w-[250px] items-center gap-2.5 px-3.5 font-cis",
        "rounded-panel border border-line bg-panel text-sm font-medium text-fg-body shadow-panel backdrop-blur-md",
        "cursor-pointer outline-none",
        "hover:border-brand-medium hover:text-fg-heading",
        "focus-visible:ring-3 focus-visible:ring-brand/50",
      )}
    >
      <span className="truncate">{label}</span>
      <span className="sr-only">, show products</span>
      {/* The same caret as a closed product row in the rail, since pressing it
        opens that rail. */}
      <ChevronDown
        aria-hidden
        className="ml-auto size-4 shrink-0 text-fg-subtle"
      />
    </button>
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

/**
 * One product's layers and controls, under its row in the rail.
 *
 * Mounted whether or not the product is open, so closing can play: closed, it
 * is folded to nothing and inert rather than gone, as the rail itself is (see
 * `.product-panel` in index.css). Its contents are remounted each time it
 * opens, though, so a variable group holding the selection comes back
 * expanded, as it did when closing a product unmounted them.
 *
 * The hairline under the product's row is the top of this panel rather than
 * the bottom of the row, so it folds away with the panel instead of vanishing
 * the moment the row is pressed.
 */
function ProductPanel({
  product,
  open,
  id,
  labelledBy,
  selectedVariable,
  onSelectVariable,
}: {
  product: ProductDefinition;
  open: boolean;
  id: string;
  labelledBy: string;
} & SelectionProps) {
  const [opens, setOpens] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpens(opens + 1);
  }

  return (
    <div
      id={id}
      role="region"
      aria-labelledby={labelledBy}
      data-closed={!open || undefined}
      inert={!open}
      className="product-panel"
    >
      {/* The clipping row and the hairline are two boxes: a border is never
        clipped by its own box, so on one it would hold a closed panel a
        pixel open. */}
      <div>
        <div key={opens} className="border-t border-line">
          <ProductVariables
            product={product}
            selectedVariable={selectedVariable}
            onSelectVariable={onSelectVariable}
          />
          {product.controls?.length ? (
            <ProductControls controls={product.controls} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

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

/**
 * The controls a product declares (see config/products `controls`), under its
 * layers and a hairline apart from them: the layers above choose *what* the map
 * paints, and these change how it is drawn, so the rule keeps a switch from
 * reading as one more layer to pick.
 *
 * Same padding and row grid as the variable list, so an icon here lines up
 * under the variable icons above it.
 */
function ProductControls({
  controls,
}: {
  controls: readonly ProductControl[];
}) {
  return (
    <ul className="flex flex-col gap-0.5 border-t border-line p-1.5">
      {controls.map((control) => {
        const Control = PRODUCT_CONTROL_COMPONENTS[control];
        return (
          <li key={control}>
            <Control />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Clustered reading cards, or every station as a dot.
 *
 * "On" is the alternative rather than the default, so the switch reads as
 * turning something on — the dots — and the rail opens with it off.
 */
function StationMarkersControl() {
  const { stationMarkers, setStationMarkers } = useMapSettings();
  const id = useId();

  return (
    <div className="flex h-8 items-center justify-between gap-2.5 px-2">
      <Label htmlFor={id} className="min-w-0 gap-2.5 font-normal text-fg-body">
        <CircleDot
          aria-hidden
          className="size-[15px] shrink-0 text-fg-subtle"
        />
        <span className="truncate">Dot markers</span>
      </Label>
      <Switch
        id={id}
        size="sm"
        checked={stationMarkers === "dots"}
        onCheckedChange={(checked) =>
          setStationMarkers(checked ? "dots" : "pills")
        }
        className="data-checked:bg-brand"
      />
    </div>
  );
}

/** What draws each control id. A Record, so a new id fails to compile here. */
const PRODUCT_CONTROL_COMPONENTS: Record<ProductControl, ComponentType> = {
  "station-markers": StationMarkersControl,
};
