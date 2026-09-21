import { expect, test } from "playwright/test";
import type { Page } from "playwright/test";

/**
 * The station layer, as a browser sees it.
 *
 * What is worth asserting here is only what needs a renderer: that the pills
 * exist at all, that clustering thins them at national zoom and gives way to
 * real readings when the camera comes in, and that switching to a stations-only
 * product changes the quantity on the map rather than emptying it. The joins
 * and the formatting behind those numbers are provable without a browser and
 * are not re-proved here.
 */

/**
 * Every marker on the map, flattened to `kind` and text.
 *
 * Clusters are told apart by their role rather than their wording: the disc
 * shows a bare count and nothing else, so `19` is indistinguishable from a
 * reading by text alone. It is the only marker that is a button, and the only
 * one whose label offers to zoom — both of which are contracts the design is
 * meant to keep, so asserting on them is not a workaround.
 */
async function pills(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".maplibregl-marker")].map((marker) => {
      const button = marker.querySelector("button[aria-label$='zoom in']");
      return {
        kind: button ? ("cluster" as const) : ("station" as const),
        text: (marker as HTMLElement).innerText.replace(/\s*\n\s*/g, " ").trim(),
        label: button?.getAttribute("aria-label") ?? null,
      };
    }),
  );
}

/**
 * Wait until markers have settled.
 *
 * The count changes several times on the way in — geometry lands before values,
 * and tiles arrive one at a time — so a bare `waitFor` on the first marker would
 * assert against a half-built layer.
 */
async function settled(page: Page, minimum = 1) {
  await expect
    .poll(async () => (await pills(page)).length, { timeout: 90_000 })
    .toBeGreaterThanOrEqual(minimum);
  let previous = -1;
  for (let i = 0; i < 20; i += 1) {
    const count = (await pills(page)).length;
    if (count === previous && count >= minimum) return;
    previous = count;
    await page.waitForTimeout(700);
  }
}

test.describe("station markers", () => {
  test("cluster at national zoom and resolve to readings when zoomed", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    const apiCalls: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/api/v1/")) apiCalls.push(new URL(url).pathname + new URL(url).search);
    });

    await page.goto("/");
    await settled(page);

    // The country is about six zoom levels wide and there are 73 seasonal
    // stations, so an unclustered layer would be a wall of overlapping cards.
    const national = await pills(page);
    expect(national.length).toBeGreaterThan(0);
    expect(national.length).toBeLessThan(73);

    const clusters = national.filter((pill) => pill.kind === "cluster");
    expect(clusters.length).toBeGreaterThan(0);
    // The disc carries a count and nothing else — no unit, no name, no word.
    for (const cluster of clusters) {
      expect(cluster.text).toMatch(/^\d+$/);
      expect(Number(cluster.text)).toBeGreaterThan(1);
      // …but the word it drops is still there for a screen reader.
      expect(cluster.label).toMatch(/^\d+ stations/);
    }
    await page.screenshot({ path: "e2e/__screenshots__/01-national.png" });

    // One request for geometry, eighteen for values — the whole point of
    // `spatialRes=station` over the per-station endpoint.
    expect(apiCalls.filter((u) => u.startsWith("/api/v1/stations"))).toHaveLength(1);
    expect(
      apiCalls.filter((u) => u.includes("spatialRes=station")),
    ).toHaveLength(18);

    // Coming in should break clusters apart into stations with real numbers.
    await page.mouse.move(700, 450);
    for (let i = 0; i < 6; i += 1) {
      await page.mouse.wheel(0, -600);
      await page.waitForTimeout(800);
    }
    await settled(page);

    const zoomed = await pills(page);
    const readings = zoomed.filter((pill) => pill.kind === "station");
    expect(readings.length).toBeGreaterThan(0);
    // Forecast rainfall is the default layer, so a resolved pill reads in mm.
    expect(readings.some((pill) => /\d\s*mm\b/.test(pill.text))).toBe(true);

    // The raster legend labels each cell with the value its range starts at.
    const legend = page.getByRole("figure", { name: "Map legend" });
    await expect(legend.locator("li")).toHaveText([
      "<50", "50", "100", "200", "300", "400", "500+",
    ].map((label) => new RegExp(`^${label}`)));
    await page.screenshot({ path: "e2e/__screenshots__/02-zoomed.png" });

    expect(errors).toEqual([]);
  });

  test("temperature is a stations-only layer", async ({ page }) => {
    await page.goto("/");
    await settled(page);

    // Seasonal is the product the rail opens on, so Temperature is already
    // visible; it has no sub-layers, which makes its own row the selection.
    await page.getByRole("button", { name: "Temperature", exact: true }).click();
    await page.waitForTimeout(2500);
    await settled(page);

    await page.mouse.move(700, 450);
    for (let i = 0; i < 6; i += 1) {
      await page.mouse.wheel(0, -600);
      await page.waitForTimeout(800);
    }
    await settled(page);

    const readings = (await pills(page)).filter((pill) => pill.kind === "station");
    expect(readings.length).toBeGreaterThan(0);
    // The quantity changed with the selection: °C, not mm. This is the only
    // seasonal temperature CIS publishes anywhere.
    expect(readings.some((pill) => /\d\s*°C/.test(pill.text))).toBe(true);
    expect(readings.some((pill) => /\d\s*mm\b/.test(pill.text))).toBe(false);

    // Stations-only means nothing to point at: no unit resolves under the
    // pointer, so no pinned readout can open.
    await page.mouse.click(700, 450);
    await page.waitForTimeout(1200);
    await expect(page.locator(".klima-popup")).toHaveCount(0);

    // No surface, so the legend keys the pills: one °C bar.
    const legend = page.getByRole("figure", { name: "Map legend" });
    await expect(legend).toBeVisible();
    await expect(legend).toContainText("°C");
    await expect(legend.locator("ol")).toHaveCount(1);

    await page.screenshot({ path: "e2e/__screenshots__/03-temperature.png" });
  });

  test("probabilistic forecast shows tercile pills", async ({ page }) => {
    await page.goto("/");
    await settled(page);

    // A sub-layer of Rainfall, which the rail shows expanded on load.
    await page
      .getByRole("button", { name: "Probabilistic Forecast", exact: true })
      .click();
    await page.waitForTimeout(2500);
    await settled(page);

    await page.mouse.move(700, 450);
    for (let i = 0; i < 6; i += 1) {
      await page.mouse.wheel(0, -600);
      await page.waitForTimeout(800);
    }
    await settled(page);

    const readings = (await pills(page)).filter((pill) => pill.kind === "station");
    expect(readings.length).toBeGreaterThan(0);
    // The dominant probability, tagged with which outcome it is.
    expect(readings.some((pill) => /\d+%\s*(AN|NN|BN)\b/.test(pill.text))).toBe(
      true,
    );
    expect(readings.some((pill) => /\d\s*mm\b/.test(pill.text))).toBe(false);

    // A resolved pill's strip is split into three bands, one per tercile.
    const bands = await page.evaluate(() =>
      [...document.querySelectorAll(".maplibregl-marker span.flex-col")].map(
        (strip) => strip.children.length,
      ),
    );
    expect(bands.length).toBeGreaterThan(0);
    expect(bands.every((count) => count === 3)).toBe(true);

    // The legend keys the pills: one bar per tercile, thresholds aligned, so
    // near normal's "50+" sits directly over the other two bars' "50".
    const legend = page.getByRole("figure", {
      name: "Tercile probability legend (%)",
    });
    await expect(legend).toBeVisible();
    await expect(legend.locator("ol")).toHaveCount(3);
    const [above, near] = await legend.locator("ol").all();
    const fifty = await above.getByText("50", { exact: true }).boundingBox();
    const nearTop = await near.getByText("50+", { exact: true }).boundingBox();
    expect(Math.abs((fifty?.x ?? 0) - (nearTop?.x ?? 99))).toBeLessThan(3);
    for (const name of ["AN", "NN", "BN"]) {
      await expect(legend.getByText(name, { exact: true })).toBeVisible();
    }

    // A band is a confidence in its row's outcome, and says so.
    await above.getByText("50", { exact: true }).hover();
    const tooltip = page.getByText("Confidence", { exact: true });
    await expect(tooltip).toBeVisible();
    await expect(page.getByText("Above normal", { exact: true })).toHaveCount(0);

    // Stations only, and nothing per province to quote: no readout opens.
    await page.mouse.click(700, 450);
    await page.waitForTimeout(1200);
    await expect(page.locator(".klima-popup")).toHaveCount(0);

    await page.screenshot({ path: "e2e/__screenshots__/04-probabilistic.png" });
  });
});
