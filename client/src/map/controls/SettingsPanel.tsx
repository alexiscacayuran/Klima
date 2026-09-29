import { useId } from "react";
import { Moon } from "lucide-react";
import { useTheme } from "@/components/theme/useTheme";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * What the Settings button in the map's top-right corner opens.
 *
 * One setting so far. The heading is there anyway, so the next one has a
 * group to join rather than a single row to be squeezed in beside.
 */
export function SettingsPanel() {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-cis-mono text-[10px]/3 font-medium tracking-[0.02em] text-fg-subtle">
        Appearance
      </h2>
      <ThemeSwitch />
    </section>
  );
}

/**
 * Dark mode on or off.
 *
 * A switch rather than a Light/Dark pair, because there are only the two and
 * dark is the default: "on" reads as the state the app opens in. The line under
 * the name says the basemap changes with it, since the map is most of the
 * screen and would otherwise be a surprise.
 */
function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const id = useId();

  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="gap-2.5 font-normal">
        <Moon aria-hidden className="size-4 text-fg-body" />
        <span className="flex flex-col gap-1">
          <span className="text-[13px]/4 font-medium text-fg-heading">
            Dark mode
          </span>
          <span className="text-[12px]/4 text-fg-body">Panels and basemap</span>
        </span>
      </Label>
      <Switch
        id={id}
        checked={theme === "dark"}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        className="data-checked:bg-brand"
      />
    </div>
  );
}
